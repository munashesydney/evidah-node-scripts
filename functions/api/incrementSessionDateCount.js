/**
 * Increment Session Date Count
 * Firestore trigger that listens for new session documents and increments date-based counters
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Firestore trigger that listens for new session documents
 */
exports.incrementSessionDateCount = onDocumentCreated(
  'Users/{uid}/knowledgebases/{selectedCompany}/metrics/sessions/{pageId}/{sessionId}',
  async (event) => {
    const FUNCTIONS_MODE = process.env.FUNCTIONS_MODE || 'test';
    
    if (FUNCTIONS_MODE === 'test') {
      console.log('FUNCTIONS_MODE is test, skipping incrementSessionDateCount');
      return;
    }

    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const { uid, pageId } = event.params;
    const selectedCompany = event.params.selectedCompany || 'default';
    const newSession = snapshot.data();

    // Check if pageId contains 'dates_' to prevent recursive triggers
    if (pageId.startsWith('dates_')) {
      console.log(`Skipping document with pageId: ${pageId}`);
      return null;
    }

    const currentDate = new Date().toISOString().split('T')[0]; // Get the current date in 'yyyy-mm-dd' format
    const sessionDateDocRef = db
      .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/sessions/dates_${pageId}`)
      .doc(currentDate);

    console.log(`Triggered for user: ${uid}, pageId: ${pageId}, date: ${currentDate}`);

    try {
      const sessionDateDoc = await sessionDateDocRef.get();
      const duration = newSession.duration || 0;

      if (sessionDateDoc.exists) {
        // Document exists, increment the count field and add the duration to totalDuration
        await sessionDateDocRef.update({
          count: FieldValue.increment(1),
          totalDuration: FieldValue.increment(duration)
        });
        console.log(`Incremented count and totalDuration for date: ${currentDate}`);
      } else {
        // Document does not exist, create it with the count field set to 1 and totalDuration set to the session duration
        await sessionDateDocRef.set({
          count: 1,
          totalDuration: duration
        });
        console.log(`Created new document for date: ${currentDate} with count 1 and totalDuration ${duration}`);
      }
    } catch (error) {
      console.error("Error updating or creating date document: ", error);
    }
  }
);

