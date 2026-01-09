const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

const db = getFirestore();
const { BASE_URL } = require('../constants');

/**
 * Trigger enabled actions for a given trigger type
 * @param {Object} params
 * @param {string} params.uid
 * @param {string} params.companyId
 * @param {string} params.triggerType
 * @param {Object} params.triggerData
 * @param {Array} params.conversationHistory
 */
async function runActionTriggers({
  uid,
  companyId,
  triggerType,
  triggerData,
  conversationHistory = [],
}) {
  try {
    const actionsSnapshot = await db
      .collection('Users')
      .doc(uid)
      .collection('knowledgebases')
      .doc(companyId)
      .collection('actions')
      .where('trigger', '==', triggerType)
      .where('enabled', '==', true)
      .get();

    if (actionsSnapshot.empty) {
      console.log(`[ACTIONS] No enabled ${triggerType} actions found`);
      return;
    }

    console.log(`[ACTIONS] Found ${actionsSnapshot.size} enabled ${triggerType} actions`);

    for (const actionDoc of actionsSnapshot.docs) {
      const action = actionDoc.data();
      const actionId = actionDoc.id;

      try {
        const eventRef = await db
          .collection('Users')
          .doc(uid)
          .collection('knowledgebases')
          .doc(companyId)
          .collection('actions')
          .doc(actionId)
          .collection('events')
          .add({
            actionId,
            triggerData,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: null,
          });

        const eventId = eventRef.id;
        console.log(`[ACTIONS] Created event ${eventId} for action ${actionId}`);

        const url = `${BASE_URL}/api/actions/events/${eventId}/respond`;
        const response = await axios.post(
          url,
          {
            uid,
            selectedCompany: companyId,
            actionId,
            actionPrompt: action.prompt,
            employeeId: action.employee,
            triggerData,
            conversationHistory,
            personalityLevel: 2,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000,
            responseType: 'stream',
          }
        );

        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'done') {
                  console.log(`[ACTIONS] Event ${eventId} completed`, data.data);
                } else if (data.type === 'error') {
                  console.error(`[ACTIONS] Event ${eventId} error`, data.data.error);
                }
              } catch (error) {
                // ignore parse errors
              }
            }
          }
        });

        console.log(`[ACTIONS] Action ${actionId} triggered successfully`);
      } catch (error) {
        console.error(`[ACTIONS] Error triggering action ${actionId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[ACTIONS] Error running action triggers:', error);
  }
}

module.exports = {
  runActionTriggers,
};

