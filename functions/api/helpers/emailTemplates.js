/**
 * Email template helper functions
 */

/**
 * Generates HTML content for new ticket confirmation email
 * @param {string} from - The sender's email address
 * @param {string} to - The recipient's email address
 * @param {string} subject - The email subject
 * @param {Date} date - The ticket date
 * @param {string} body - The message body
 * @param {string} messageId - The message ID
 * @param {string} inReplyTo - The in-reply-to header
 * @param {string} references - The references header
 * @param {string} uid - The user UID
 * @param {string} html - The HTML content
 * @param {number} ticketNumber - The ticket number
 * @param {string} companyname - The company name
 * @param {string} subdomain - The subdomain
 * @returns {Promise<string>} - The HTML content for the email
 */
async function getNewTicketConfirmationHTML(from, to, subject, date, body, messageId, inReplyTo, references, uid, html, ticketNumber, companyname, subdomain) {

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Received</title>
  <style>
      body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
          color: #333333;
      }
      .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      .header {
          text-align: center;
          padding: 20px 0;
      }
      .header img {
          max-width: 150px;
      }
      .header h1 {
          font-size: 24px;
          color: #2c3e50;
      }
      .content {
          padding: 20px;
          line-height: 1.6;
      }
      .content h2 {
          color: #2c3e50;
          font-size: 22px;
          margin-bottom: 10px;
      }
      .content p {
          margin: 10px 0;
      }
      .content .ticket-details {
          background-color: #ecf0f1;
          padding: 15px;
          border-radius: 8px;
          margin-top: 20px;
      }
      .content .ticket-details p {
          margin: 5px 0;
      }
      .content .cta {
          text-align: center;
          margin-top: 30px;
      }
      .content .cta a {
          background-color: #3498db;
          color: #ffffff;
          text-decoration: none;
          padding: 12px 25px;
          border-radius: 5px;
          font-weight: bold;
          display: inline-block;
      }
      .footer {
          text-align: center;
          padding: 20px;
          font-size: 12px;
          color: #7f8c8d;
      }
      .footer a {
          color: #3498db;
          text-decoration: none;
      }
      .social-icons img {
          width: 32px;
          margin: 0 10px;
          border-radius:5px;
      }
  </style>
</head>
<body>
  <div class="container">
      <div class="header">
          <!--<img src="your-logo-url.png" alt="Company Logo">-->
          <h1>`+ companyname + `</h1>
          <br>
          <hr>
      </div>
      <div class="content">
          <h2>Hello ` + from + `,</h2>
          <p>Thank you for reaching out to us! 🎉 We've received your ticket and our support team is already on the case.</p>

          <div class="ticket-details">
              <h3>🔍 Ticket Details:</h3>
              <p><strong>Ticket ID:</strong> ` + ticketNumber + `</p>
              <p><strong>Subject:</strong> ` + subject + `</p>
              <p><strong>Date Submitted:</strong> ` + date + `</p>
              <p><strong>Priority:</strong> High</p>
          </div>

          <p>Our team is reviewing your request and will get back to you with an update as soon as possible. You can expect a response within <strong>24 hours</strong>.</p>

          <div class="cta">
              <a href="`+ subdomain + `.ourkd.help">Help Center</a>
          </div>
          <br>

          <p>If you need immediate assistance, please visit our <a href="`+ subdomain + `.ourkd.help">Help Center</a> <!--or join the conversation in our <a href="[Community Forum Link]">Community Forum</a>-->.</p>
      </div>
      <div class="footer">
          <p>Thank you for choosing `+ companyname + `. We're here to help!</p>
          <!--<p><a href="mailto:[Your Contact Information]">Contact Us</a> | <a href="[Unsubscribe Link]">Unsubscribe</a></p>-->
          <!--<div class="social-icons">
              <a href="https://facebook.com"><img src="https://cdn.jim-nielsen.com/ios/512/facebook-2019-05-21.png" alt="Facebook"></a>
              <a href="#https://instagram.com"><img src="https://cdn.jim-nielsen.com/ios/512/instagram-2022-05-19.png" alt="Instagram"></a>
          </div>-->
          <br>
          <hr>
          <p style="margin-top: 40px; font-size: 17px; font-weight: bold; color: #2c3e50;">
              Powered By <a href="https://evidah.com" style="color: #e74c3c; text-decoration: none;">Evidah</a>
          </p>

      </div>
  </div>
</body>
</html>`;

  return htmlContent;

}

module.exports = {
  getNewTicketConfirmationHTML
};

