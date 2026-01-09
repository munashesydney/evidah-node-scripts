/**
 * Listen to New Messages
 * Firestore trigger that listens for new messages in tickets and generates AI responses
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const axios = require('axios');

const db = getFirestore();

// Import constants and helpers
const { BASE_URL, ENDPOINTS } = require('./constants');
const { getCompanyName, getUserData, removeAfterAt } = require('./helpers/userHelpers');
const { getConversationHistory } = require('./helpers/ticketHelpers');
const { runActionTriggers } = require('./helpers/actionTriggerHelper');

/**
 * Calls the employee respond API to get AI response
 * @param {string} uid - User UID
 * @param {string} companyId - Company ID
 * @param {Array} messages - Array of messages with role and content
 * @param {Object} context - Optional context object with ticketId, sessionId, etc.
 * @returns {Promise<Object>} - Response from the API
 */
async function getAIResponse(uid, companyId, messages, context = {}) {
  try {
    const url = `${BASE_URL}${ENDPOINTS.EMPLOYEE_RESPOND}`;
    
    const requestBody = {
      uid,
      companyId,
      employee: 'charlie',
      messages,
      temperature: 0.7,
    };

    // Add context if provided (includes ticketId, sessionId, etc.)
    if (context && Object.keys(context).length > 0) {
      requestBody.context = context;
    }
    
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 second timeout
    });

    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    } else {
      throw new Error('Invalid response from employee API');
    }
  } catch (error) {
    console.error('Error calling employee respond API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Sends an email using the inbox emails send API
 * @param {Object} emailData - Email data to send
 * @returns {Promise<Object>} - Response from the API
 */
async function sendEmail(emailData) {
  try {
    const url = `${BASE_URL}${ENDPOINTS.INBOX_EMAILS_SEND}`;
    
    const response = await axios.post(url, emailData, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    if (response.data && response.data.status === 1) {
      return response.data;
    } else {
      throw new Error(response.data?.message || 'Failed to send email');
    }
  } catch (error) {
    console.error('Error calling inbox emails send API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Firestore trigger that listens for new messages in tickets
 */
exports.listenToNewMessages = onDocumentCreated(
  'Users/{uid}/knowledgebases/{selectedCompany}/Helpdesk/default/tickets/{ticketId}/messages/{messagesId}',
  async (event) => {
    const FUNCTIONS_MODE = process.env.FUNCTIONS_MODE || 'test';
    
    if (FUNCTIONS_MODE === 'test') {
      console.log('FUNCTIONS_MODE is test, skipping listenToNewMessages');
      return;
    }

    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const { uid, ticketId, messagesId, selectedCompany } = event.params;
    const companyId = selectedCompany || 'default';

    try {
      // Fetch KB + ticket + message docs
      const knowledgebaseRef = db.doc(`Users/${uid}/knowledgebases/${companyId}`);
      const ticketRef = db.doc(`Users/${uid}/knowledgebases/${companyId}/Helpdesk/default/tickets/${ticketId}`);
      const messageRef = db.doc(`Users/${uid}/knowledgebases/${companyId}/Helpdesk/default/tickets/${ticketId}/messages/${messagesId}`);

      const [knowledgebaseDoc, ticketDoc, messageDoc] = await Promise.all([
        knowledgebaseRef.get(),
        ticketRef.get(),
        messageRef.get(),
      ]);

      const knowledgebaseData = knowledgebaseDoc.exists ? knowledgebaseDoc.data() : null;
      const ticketData = ticketDoc.exists ? ticketDoc.data() : null;
      const messageData = messageDoc.exists ? messageDoc.data() : null;

      if (!knowledgebaseData || !ticketData || !messageData) {
        console.log('Missing required data:', { knowledgebaseData: !!knowledgebaseData, ticketData: !!ticketData, messageData: !!messageData });
        return;
      }

      // Only respond to inbound messages from the customer
      const messageType = messageData.type || '';
      console.log('Processing message type:', messageType);
      if (!messageType.includes('Receiver')) {
        console.log('Message Skipped - not a receiver message');
        return;
      }

      // Create inbox notification for new message
      try {
        const notificationUrl = `${BASE_URL}/api/notifications/create`;
        const inReplyTo = messageData.inReplyTo || '';
        const isNewTicket = inReplyTo === 'N/A' || inReplyTo === '';
        
        await axios.post(notificationUrl, {
          uid,
          companyId,
          type: 'inbox',
          referenceId: ticketId,
          title: isNewTicket ? 'New Ticket Received' : 'New Reply on Ticket',
          message: `${ticketData.subject || 'No subject'}`,
        }, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        
        console.log('Inbox notification created for ticket:', ticketId);
      } catch (notifError) {
        console.error('Failed to create inbox notification:', notifError.message);
        // Don't fail the entire function if notification creation fails
      }

      // Build conversation history and trigger data for actions
      const conversationHistory = await getConversationHistory(ticketId, uid, companyId);
      if (messageData.body) {
        conversationHistory.push({
          role: 'user',
          content: messageData.body.toString()
        });
      }

      const triggerData = {
        ticketId,
        ticketSubject: ticketData.subject || '',
        ticketFrom: ticketData.from || '',
        messageBody: messageData.body || '',
        messageType: messageData.type || '',
      };

      // TRIGGER ACTIONS - Independent of AI settings
      const inReplyTo = messageData.inReplyTo || '';
      if (inReplyTo !== 'N/A' && inReplyTo !== '') {
        console.log('Message is a reply - checking for ticket_reply actions');
        await runActionTriggers({
          uid,
          companyId,
          triggerType: 'ticket_reply',
          triggerData,
          conversationHistory,
        });
      } else {
        console.log('Message is a new ticket - checking for new_ticket actions');
        await runActionTriggers({
          uid,
          companyId,
          triggerType: 'new_ticket',
          triggerData,
          conversationHistory,
        });
      }

      // LEGACY AI AUTO RESPONSE/SUGGESTIONS - Check feature flags
      const aiMessagesOn = knowledgebaseData.aiMessagesOn || false;
      const aiSuggestionsOn = knowledgebaseData.aiSuggestionsOn || false;

      console.log('AI Messages On:', aiMessagesOn);
      console.log('AI Suggestions On:', aiSuggestionsOn);

      // If both are off, skip legacy AI processing
      if (!aiMessagesOn && !aiSuggestionsOn) {
        console.log('Both AI Auto Response and AI Suggestions are turned off - skipping legacy AI processing');
        return;
      }

      // Check ticket-level AI setting
      if ('aiOn' in ticketData) {
        console.log('aiOn exists');
        if (!ticketData.aiOn) {
          console.log('AI turned off for this ticket - skipping legacy AI processing');
          return;
        }
      }

      console.log(`Processing ${conversationHistory.length} messages for legacy AI response`);

      // Get customer info from ticket data
      const customerEmail = ticketData.from || '';
      const customerName = removeAfterAt(customerEmail); // Extract name from email if available
      
      // Build context with ticket_id and customer info
      const context = {
        ticketId: ticketId,
        customerEmail: customerEmail,
        customerName: customerName,
      };

      // Get AI response from the employee respond API
      let aiResponse;
      try {
        const responseData = await getAIResponse(uid, companyId, conversationHistory, context);
        aiResponse = responseData.content || responseData.response || responseData.message;
        
        if (!aiResponse) {
          console.log('No response content generated from AI');
          return;
        }
      } catch (error) {
        console.error('Error getting AI response:', error);
        return;
      }

      console.log('AI Response generated:', aiResponse.substring(0, 100) + '...');

      // Determine action based on settings
      if (aiMessagesOn) {
        // Auto Response is on - send the email
        console.log('Auto Response is on - sending email');

        const subdomain = knowledgebaseData.subdomain || 'aiknowledgedesk';
        const fromEmail = `${subdomain}@ourkd.help`;

        try {
          const emailResult = await sendEmail({
            uid,
            selectedCompany: companyId,
            ticketId,
            to: ticketData.from,
            subject: ticketData.subject,
            message: aiResponse,
            replyToId: messageData.messageId || '',
            references: messageData.references || '',
            fileUrls: [],
          });

          if (emailResult && emailResult.messageId) {
            console.log('AI email sent successfully:', emailResult.messageId);
            // Note: The email API already adds the message to Firestore and updates the ticket
            console.log('AI response stored in conversation history');
          } else {
            console.log("Unfortunately, the AI email wasn't sent.");
          }
        } catch (error) {
          console.error('Error sending AI email:', error);
        }
      } else if (aiSuggestionsOn) {
        // Only suggestions are on - store as suggestion
        console.log('Auto Suggest is on - storing suggestion');

        await ticketRef.update({
          lastAISuggestion: aiResponse,
          lastAISuggestionTimestamp: FieldValue.serverTimestamp(),
        });

        console.log('AI suggestion stored in ticket document');
      }
    } catch (error) {
      console.error('Error in listenToNewMessages:', error);
    }
  }
);

