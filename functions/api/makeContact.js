/**
 * Make Contact API endpoint
 * Handles incoming emails and creates tickets or adds messages to existing tickets
 */

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

// Import helper functions
const { extractTopLevelMessage, removeEmailQuotes } = require('./helpers/emailHelpers');
const { getUidWithTo, getCompanyName, getSubdomain } = require('./helpers/userHelpers');
const { addMessageToInReplyToTicket } = require('./helpers/ticketHelpers');
const { getNewTicketConfirmationHTML } = require('./helpers/emailTemplates');
const { sendNewTicketConfirmation } = require('./helpers/emailService');

/**
 * Main function to process contact emails and create/update tickets
 * @param {string} from - The sender's email address
 * @param {string} to - The recipient's email address
 * @param {string} subject - The email subject
 * @param {Date} date - The email date
 * @param {string} body - The email body
 * @param {string} messageId - The message ID
 * @param {string} inReplyTo - The in-reply-to header
 * @param {string} references - The references header
 * @param {string} uid - The user UID (optional, will be looked up if not provided)
 * @param {string} html - The HTML content
 * @param {Array} downloadURLs - Array of attachment download URLs
 * @param {string} selectedCompany - The selected company (default: 'default')
 * @returns {Promise<Object>} - Status object with success/failure information
 */
async function makeContact2(from, to, subject, date, body, messageId, inReplyTo, references, uid, html, downloadURLs, selectedCompany = 'default') {

  //lets get the uid
  uid = await getUidWithTo(to, selectedCompany);
  console.log('Directed User uid:', uid);

  if (uid == null) {
    return { "status": 0, "message": "Uid not found" };
  }

  if (body != 'N/A' && body != '') {
    body = await extractTopLevelMessage(body);
  }

  console.log('----new body ' + body);
  if (html == "N/A") {
    html = body;
  } else {
    html = await removeEmailQuotes(html);
  }

  console.log("date before");
  console.log(date);

  if (date == "current") {
    date = new Date();
  } else {
    date = new Date(date);
  }

  console.log("Date after ");
  console.log(date);

  const messageData = { from: from, to: to, subject: subject, date: date, body: body, messageId: messageId, inReplyTo: inReplyTo, references: references, html: html, uid: uid, type: "humanReceiver", attachments: downloadURLs };

  //set the contact
  const ticketsCollection = db.collection('Users').doc(uid).collection('knowledgebases').doc(selectedCompany).collection('Helpdesk').doc('default').collection('tickets');
  //await docRef.set({email: from});

  //lets create a new ticket if inReplyTo == N/A
  if (inReplyTo == 'N/A') {
    console.log("First message - Means New Ticket");
    //add ticket document

    // Get the current count of documents in the 'tickets' collection
    const ticketsSnapshot = await ticketsCollection.get();
    const ticketNumber = ticketsSnapshot.size + 1;

    // Add the new ticket with the ticket number (no more thread creation)
    const newTicketRef = await ticketsCollection.add({
      from: from,
      to: to,
      date: date,
      subject: subject,
      lastMessage: body,
      lastMessageDate: date,
      status: "Open",
      read: false,
      ticketNumber: ticketNumber, // Set the ticket number here
    });

    console.log('Ticket Created');

    // Get the ID of the newly created document
    const newTicketId = newTicketRef.id;

    console.log(`New Ticket ID: ${newTicketId}`);

    //add the message to the ticket
    await ticketsCollection.doc(newTicketId).collection('messages').add(messageData);

    console.log("Message Added");

    // send back ticket confirmation here!

    //lets get company name and subdomain first
    const companyname = await getCompanyName(uid, selectedCompany);
    const subdomain = await getSubdomain(uid, selectedCompany);

    const theHtml = await getNewTicketConfirmationHTML(from, to, subject, date, body, messageId, inReplyTo, references, uid, html, ticketNumber, companyname, subdomain);

    return await sendNewTicketConfirmation(from, "Ticket Received", "We received your ticket. Please expect a response in the next 24 hours.", theHtml, subdomain + "@ourkd.help", messageId, references);

  } else {
    //this email must belong to a ticket so lets look for it!
    return await addMessageToInReplyToTicket(ticketsCollection, inReplyTo, messageData, body, date);
  }

}

/**
 * HTTP endpoint for makeContact
 * Handles incoming POST requests to create or update tickets from emails
 */
exports.makeContact = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  try {
    const { from, to, subject, date, body, messageId, inReplyTo, references, uid, html, downloadURLs, selectedCompany = 'default' } = req.body;

    var actualDate = date;
    if (date == "current") {
      actualDate = new Date();
    } else {
      try {
        actualDate = new Date(date);
      } catch (error) {
        console.log(error);
        actualDate = new Date();
      }
    }

    const result = await makeContact2(from, to, subject, actualDate, body, messageId, inReplyTo, references, uid, html, downloadURLs, selectedCompany);
    res.status(200).send(result);
  } catch (error) {
    console.error('makeContact error:', error);
    res.status(500).send({ error: 'Internal server error', message: error.message });
  }
});

module.exports = {
  makeContact2
};

