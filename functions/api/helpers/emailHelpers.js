/**
 * Email helper functions for processing email content
 */

/**
 * Extracts the top-level message from an email string by removing quoted replies
 * @param {string} emailString - The email content to process
 * @returns {Promise<string>} - The extracted top-level message
 */
async function extractTopLevelMessage(emailString) {
  // Split the string by line breaks
  const lines = emailString.split('\n');

  // Initialize an empty array to collect lines of the top-level message
  let topLevelMessage = [];

  // Flag to indicate whether we are in the top-level message section
  let inTopLevelMessage = true;

  // Loop through the lines
  for (let line of lines) {
    // If we encounter a line that starts with "On " followed by the date pattern, we stop
    if (line.startsWith('On ') || line.startsWith('>')) {
      inTopLevelMessage = false;
    }

    // If we are in the top-level message, add the line to the array
    if (inTopLevelMessage && line.trim() !== '') {
      topLevelMessage.push(line.trim());
    }
  }

  // Join the collected lines to form the complete top-level message
  return topLevelMessage.join(' ');
}

/**
 * Removes email quotes from HTML email content
 * @param {string} emailContent - The email HTML content
 * @returns {Promise<string>} - The cleaned email content without quotes
 */
async function removeEmailQuotes(emailContent) {
  // Remove Gmail quotes
  const gmailQuoteRegex = /<div class="gmail_quote">([\s\S]*?)<\/div>/i;
  let cleanedContent = emailContent.replace(gmailQuoteRegex, '');

  // Remove blockquote tags (used by Yahoo, Apple Mail, Thunderbird)
  const blockquoteRegex = /<blockquote[\s\S]*?>[\s\S]*?<\/blockquote>/gi;
  cleanedContent = cleanedContent.replace(blockquoteRegex, '');

  // Remove plain-text quotes (e.g., '>' at the start of lines)
  const plainTextQuoteRegex = /^>[\s\S]*?$/gm;
  cleanedContent = cleanedContent.replace(plainTextQuoteRegex, '');

  // Remove Outlook-style quotes (e.g., "From:", "Sent:", etc.)
  const outlookQuoteRegex = /(From:.+?\nTo:.+?\nSent:.+?\nSubject:.+?)/i;
  cleanedContent = cleanedContent.replace(outlookQuoteRegex, '');

  return cleanedContent;
}

/**
 * Extracts the email name (part before @) from an email address
 * @param {string} email - The email address
 * @returns {Promise<string|null>} - The email name or null if not found
 */
async function extractEmailName(email) {
  const atIndex = email.indexOf('@');
  if (atIndex !== -1) {
    return email.substring(0, atIndex);
  }
  return null;
}

module.exports = {
  extractTopLevelMessage,
  removeEmailQuotes,
  extractEmailName
};

