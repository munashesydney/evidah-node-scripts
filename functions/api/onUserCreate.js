/**
 * On User Create
 * Firestore trigger that listens for new user creation and adds them to Mautic
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const axios = require('axios');

// Import constants
const { BASE_URL, ENDPOINTS } = require('./constants');

/**
 * Calls the Mautic API to add a contact
 * @param {Object} contactData - Contact data to add
 * @returns {Promise<Object>} - Response from the API
 */
async function addMauticContact(contactData) {
  try {
    const url = `${BASE_URL}${ENDPOINTS.MAUTIC}`;
    
    const response = await axios.post(url, contactData, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    if (response.data && response.data.success) {
      return response.data;
    } else {
      throw new Error(response.data?.error || 'Failed to add contact to Mautic');
    }
  } catch (error) {
    console.error('Error calling Mautic API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Firestore trigger that listens for new user creation
 */
exports.onUserCreate = onDocumentCreated(
  'Users/{userId}',
  async (event) => {
    const FUNCTIONS_MODE = process.env.FUNCTIONS_MODE || 'test';
    
    if (FUNCTIONS_MODE === 'test') {
      console.log('FUNCTIONS_MODE is test, skipping onUserCreate');
      return;
    }

    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const newUser = snapshot.data();
    const userId = event.params.userId;

    const first_name = newUser.name;
    const last_name = newUser.surname;
    const email = newUser.email;

    console.log('New user added with ID:', userId, newUser);

    // Add user to Mautic segment 1
    try {
      const mauticResult = await addMauticContact({
        email,
        firstname: first_name || null,
        lastname: last_name || null,
        phone: null,
        tags: null,
        custom_fields: null,
        segment_id: 1,
      });

      if (mauticResult.success) {
        console.log('User successfully added to Mautic:', mauticResult);
      } else {
        console.error('Failed to add user to Mautic:', mauticResult.error);
      }
    } catch (error) {
      console.error('Error adding user to Mautic:', error);
    }

    return Promise.resolve();
  }
);

