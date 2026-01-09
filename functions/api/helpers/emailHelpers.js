/**
 * Email helper functions for processing email content
 */

const { getStorage } = require('firebase-admin/storage');
const { v4: uuidv4 } = require('uuid');

const storage = getStorage();

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

/**
 * Finds inline base64 images inside HTML, uploads them to Cloud Storage, and replaces the data URI with a URL.
 * @param {string} html - Raw HTML content that may contain inline base64 images.
 * @param {string} uid - UID used to organize stored attachments (optional).
 * @returns {Promise<{html: string, attachments: Array}>} Sanitized HTML and metadata for stored attachments.
 */
async function offloadInlineImages(html, uid = 'unknown') {
  if (!html || typeof html !== 'string') {
    return { html, attachments: [] };
  }

  const bucket = storage.bucket();
  const dataUriRegex = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
  const attachments = [];
  let cleanedHtml = html;

  const matches = Array.from(html.matchAll(dataUriRegex));

  for (const match of matches) {
    const mimeType = match[1];
    const base64Payload = match[2];

    try {
      const buffer = Buffer.from(base64Payload, 'base64');
      const filePath = `inline-attachments/${uid || 'unknown'}/${Date.now()}-${uuidv4()}`;
      const file = bucket.file(filePath);

      await file.save(buffer, {
        resumable: false,
        metadata: {
          contentType: mimeType,
          cacheControl: 'public,max-age=31536000'
        }
      });

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '2099-01-01'
      });

      cleanedHtml = cleanedHtml.replace(match[0], url);
      attachments.push({
        type: 'inlineImage',
        mimeType,
        url,
        size: buffer.length,
        storagePath: filePath
      });
    } catch (error) {
      console.error('Error offloading inline image:', error);
    }
  }

  return { html: cleanedHtml, attachments };
}

module.exports = {
  extractTopLevelMessage,
  removeEmailQuotes,
  extractEmailName,
  offloadInlineImages
};

