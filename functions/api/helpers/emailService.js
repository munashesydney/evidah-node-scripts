/**
 * Email service helper functions for sending emails
 */

const nodemailer = require('nodemailer');

/**
 * Sends a new ticket confirmation email
 * @param {string} newTo - The recipient email address
 * @param {string} subject - The email subject
 * @param {string} message - The plain text message
 * @param {string} html - The HTML content
 * @param {string} from - The sender email address
 * @param {string} replyToId - The message ID to reply to
 * @param {string} references - The references header
 * @returns {Promise<Object>} - Status object with success/failure information
 */
async function sendNewTicketConfirmation(newTo, subject, message, html, from, replyToId, references) {
  // Create the transporter with your email service's SMTP settings
  let transporter = nodemailer.createTransport({
    host: 'smtp.fastmail.com', // Replace with your SMTP server
    port: 465, // or 465 for secure
    secure: true, // true for 465, false for other ports
    auth: {
      user: 'all@ourkd.help', // Your email
      pass: '9t5p4s7d3p58432l' // Your email password
    }
  });
  console.log("Attempting to reply to ", replyToId);

  // Create the reply email
  let replyEmail = {
    from: from, // The user replying
    to: newTo, // The original sender's email
    subject: subject, // Prefix "Re:" to the original subject
    text: message, // The body of the reply
    inReplyTo: replyToId, // Reference the original email's Message-ID
    references: references,
    html: html
  };

  // Send the email
  try {
    const info = await transporter.sendMail(replyEmail);
    console.log('New ticket confirmation sent');
    console.log('###################################################################');
    return { status: 1, message: 'New ticket confirmation sent', messageId: info.messageId };
  } catch (error) {
    console.log('Error sending new ticket confirmation: ' + error.message);
    return { status: 0, message: 'Error sending new ticket confirmation: ' + error.message };
  }
}

module.exports = {
  sendNewTicketConfirmation
};

