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
 * Sends push notification to user's devices via FCM
 * @param {string} uid - User UID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload
 * @returns {Promise<Object>} - Result object with success status and counts
 */
async function sendNotificationToUser(uid, title, body, data = {}) {
  try {
    // Get all tokens for the user
    const tokensSnapshot = await db
      .collection('Users')
      .doc(uid)
      .collection('tokens')
      .get();

    if (tokensSnapshot.empty) {
      console.log(`No FCM tokens found for user: ${uid}`);
      return { success: false, message: 'No tokens found' };
    }

    // Extract tokens
    const registrationTokens = [];
    tokensSnapshot.forEach(doc => {
      const tokenData = doc.data();
      if (tokenData.fcmToken) {
        registrationTokens.push(tokenData.fcmToken);
      }
    });

    if (registrationTokens.length === 0) {
      console.log(`No valid FCM tokens found for user: ${uid}`);
      return { success: false, message: 'No valid tokens found' };
    }

    // For safety, limit to 500 tokens per batch (FCM limit)
    if (registrationTokens.length > 500) {
      registrationTokens.length = 500;
    }

    console.log(`Attempting to send notification to ${registrationTokens.length} devices for user ${uid}`);

    // Create a safe copy of the data object to avoid reserved FCM keywords
    const safeData = { ...data };

    // Rename any reserved FCM keywords
    const reservedKeys = ['from', 'notification', 'android', 'webpush', 'apns', 'fcm_options'];
    for (const key of reservedKeys) {
      if (key in safeData) {
        safeData[`custom_${key}`] = safeData[key];
        delete safeData[key];
      }
    }

    try {
      // Create the message exactly as in the Firebase documentation
      const message = {
        notification: {
          title: title,
          body: body
        },
        data: {
          ...safeData,
          title: title,
          body: body,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens: registrationTokens
      };

      // Log the message structure for debugging (excluding tokens for security)
      console.log('FCM message structure:', {
        notification: message.notification,
        data: message.data,
        tokensCount: registrationTokens.length
      });

      // Send the multicast message as shown in the docs
      const response = await admin.messaging().sendMulticast(message);

      console.log(`Successfully sent ${response.successCount} messages out of ${registrationTokens.length}`);

      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push({
              token: registrationTokens[idx].substring(0, 10) + '...',
              error: resp.error ? resp.error.message : 'Unknown error'
            });
          }
        });
        console.log('Failed tokens:', JSON.stringify(failedTokens));
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      };
    } catch (messagingError) {
      console.error('Error sending FCM multicast:', messagingError);

      // Try sending messages one by one
      console.log('Falling back to individual message sending...');
      let successCount = 0;

      for (const token of registrationTokens) {
        try {
          const individualMessage = {
            notification: {
              title: title,
              body: body
            },
            data: {
              ...safeData,
              title: title,
              body: body,
              click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            token: token // For individual messages, use 'token' instead of 'tokens'
          };

          await admin.messaging().send(individualMessage);
          successCount++;
        } catch (individualError) {
          console.log(`Failed to send to token: ${token.substring(0, 10)}...`, individualError.message);
        }
      }

      console.log(`Individual sending results: ${successCount} successes out of ${registrationTokens.length}`);

      if (successCount > 0) {
        return {
          success: true,
          successCount: successCount,
          failureCount: registrationTokens.length - successCount,
          responses: []
        };
      } else {
        return {
          success: false,
          error: 'All individual message sends failed',
          originalError: messagingError.message
        };
      }
    }
  } catch (error) {
    console.error('Error in notification process:', error);
    return {
      success: false,
      error: error.message
    };
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

      // --- Push notification to the owner for new inbound (Receiver) messages
      if (ticketData && messageData) {
        try {
          if (messageData.type && messageData.type.includes('Receiver')) {
            const notificationTitle = `New message in ticket: ${ticketData.subject}`;
            const notificationBody = messageData.body
              ? (messageData.body.length > 100 ? messageData.body.substring(0, 97) + '...' : messageData.body)
              : 'New message received';

            const notificationData = {
              ticketId,
              selectedCompany: companyId,
              messageId: messagesId,
              sender_email: messageData.from || '',
              subject: ticketData.subject || '',
              timestamp: Date.now().toString(),
            };

            const notificationResult = await sendNotificationToUser(uid, notificationTitle, notificationBody, notificationData);
            if (notificationResult.success) {
              console.log(`Successfully sent notifications to ${notificationResult.successCount} devices for user ${uid}`);
            } else {
              console.log(`Failed to send notifications: ${notificationResult.error || 'Unknown error'}`);
            }
          } else {
            console.log('Skipping notification for non-receiver message');
          }
        } catch (notificationError) {
          console.error('Error in notification process:', notificationError);
          // continue
        }
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

