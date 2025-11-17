/**
 * API Constants
 * Base URL for API endpoints
 */

// Base URL for the Next.js API routes
// This should be set via environment variable or default to localhost for development
const BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

module.exports = {
  BASE_URL,
  ENDPOINTS: {
    EMPLOYEE_RESPOND: '/api/employee/respond',
    INBOX_EMAILS_SEND: '/api/inbox/emails/send',
    MAUTIC: '/api/mautic',
  }
};

