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

/**
 * Calls the employee respond API to get AI response
 * @param {string} uid - User UID
 * @param {string} companyId - Company ID
 * @param {Array} messages - Array of messages with role and content
 * @returns {Promise<Object>} - Response from the API
 */
async function getAIResponse(uid, companyId, messages) {
  try {
    const url = `${BASE_URL}${ENDPOINTS.EMPLOYEE_RESPOND}`;
    
    const response = await axios.post(url, {
      uid,
      companyId,
      employee: 'charlie',
      messages,
      temperature: 0.7,
    }, {
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

      // Feature flags: org-level and ticket-level
      const aiMessagesOn = knowledgebaseData.aiMessagesOn || false;
      const aiSuggestionsOn = knowledgebaseData.aiSuggestionsOn || false;

      console.log('AI Messages On:', aiMessagesOn);
      console.log('AI Suggestions On:', aiSuggestionsOn);

      // If both are off, don't do anything
      if (!aiMessagesOn && !aiSuggestionsOn) {
        console.log('Both AI Auto Response and AI Suggestions are turned off');
        return;
      }

      // Check ticket-level AI setting
      if ('aiOn' in ticketData) {
        console.log('aiOn exists');
        if (!ticketData.aiOn) {
          console.log('AI turned off for this ticket');
          return;
        }
      }

      // Only respond to inbound messages from the customer
      const messageType = messageData.type || '';
      console.log('Processing message type:', messageType);
      if (!messageType.includes('Receiver')) {
        console.log('Message Skipped - not a receiver message');
        return;
      }

      // Get conversation history
      const conversationHistory = await getConversationHistory(ticketId, uid, companyId);

      // Ensure the latest inbound message is included
      if (messageData.body) {
        conversationHistory.push({
          role: 'user',
          content: messageData.body.toString()
        });
      }

      console.log(`Processing ${conversationHistory.length} messages for AI response`);

      // Get AI response from the employee respond API
      let aiResponse;
      try {
        const responseData = await getAIResponse(uid, companyId, conversationHistory);
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

