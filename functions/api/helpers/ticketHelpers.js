/**
 * Ticket helper functions for managing tickets and messages
 */

const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Adds a message to an existing ticket based on the inReplyTo message ID
 * @param {FirebaseFirestore.CollectionReference} ticketsCollection - The tickets collection reference
 * @param {string} inReplyTo - The message ID to reply to
 * @param {Object} messageData - The message data to add
 * @param {string} body - The message body
 * @param {Date} date - The message date
 * @returns {Promise<Object>} - Status object with success/failure information
 */
async function addMessageToInReplyToTicket(ticketsCollection, inReplyTo, messageData, body, date) {
  /*This function searches for where the current email belongs to and adds a message to that ticket*/
  // Get all tickets
  const ticketsSnapshot = await ticketsCollection.get();

  // Iterate through each ticket
  for (const ticketDoc of ticketsSnapshot.docs) {
    const ticketId = ticketDoc.id;
    const messagesRef = ticketsCollection.doc(ticketId).collection('messages');

    // Query messages where messageId matches inReplyTo
    const messagesSnapshot = await messagesRef.where('messageId', '==', inReplyTo).get();

    if (!messagesSnapshot.empty) {
      // Found a matching message, add the new message to this subcollection
      await messagesRef.add(messageData);
      console.log(`Message added to ticket: ${ticketId}`);
      await ticketsCollection.doc(ticketId).set({ lastMessage: body, lastMessageDate: date, read: false }, { merge: true });

      return { status: 1, message: `Message added to ticket: ${ticketId}` }; // Exit after adding the message to the first match found
    }
  }

  console.log('No matching message found with the given inReplyTo value.');
  return { status: 0, message: 'No matching message found with the given inReplyTo value.' };
}

/**
 * Gets conversation history for a ticket
 * @param {string} ticketId - The ticket ID
 * @param {string} uid - The user UID
 * @param {string} selectedCompany - The selected company (default: 'default')
 * @returns {Promise<Array>} - Array of formatted messages for the API
 */
async function getConversationHistory(ticketId, uid, selectedCompany = 'default') {
  try {
    const messagesRef = db
      .collection('Users')
      .doc(uid)
      .collection('knowledgebases')
      .doc(selectedCompany)
      .collection('Helpdesk')
      .doc('default')
      .collection('tickets')
      .doc(ticketId)
      .collection('messages');

    const messagesSnapshot = await messagesRef.orderBy('date', 'asc').get();

    const messages = messagesSnapshot.docs.map((doc) => {
      const data = doc.data();
      // Format messages for the API: role is 'user' for Receiver messages, 'assistant' for AI/outbound messages
      let role = 'user';
      if (data.type === 'AI' || data.type === 'outbound') {
        role = 'assistant';
      } else if (data.type && data.type.includes('Receiver')) {
        role = 'user';
      }

      return {
        role: role,
        content: data.body || data.html || ''
      };
    });

    return messages;
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

module.exports = {
  addMessageToInReplyToTicket,
  getConversationHistory
};
