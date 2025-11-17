/**
 * Increment Page View Date Count
 * Firestore trigger that listens for new page view documents and increments date-based counters
 * Also tracks unique visitors, countries, and referrers
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Firestore trigger that listens for new page view documents
 */
exports.incrementPageViewDateCount = onDocumentCreated(
  'Users/{uid}/knowledgebases/{selectedCompany}/metrics/pageViews/{pageId}/{viewId}',
  async (event) => {
    const FUNCTIONS_MODE = process.env.FUNCTIONS_MODE || 'test';
    
    if (FUNCTIONS_MODE === 'test') {
      console.log('FUNCTIONS_MODE is test, skipping incrementPageViewDateCount');
      return;
    }

    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const { uid, pageId, viewId } = event.params;
    const selectedCompany = event.params.selectedCompany || 'default';
    const newPageView = snapshot.data();

    // Check if pageId contains 'dates_' to prevent recursive triggers
    if (pageId.startsWith('dates_')) {
      console.log(`Skipping document with pageId: ${pageId}`);
      return null;
    }

    const visitorID = newPageView.visitorID;
    const country = newPageView.country;
    const referrer = newPageView.referrer;
    const currentDate = new Date().toISOString().split('T')[0]; // Get the current date in 'yyyy-mm-dd' format
    const pageViewDateDocRef = db
      .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/pageViews/dates_${pageId}`)
      .doc(currentDate);

    const overalPageViewDateDocRef = db
      .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/pageViews/overalPageViews`)
      .doc(currentDate);

    console.log(`Triggered for user: ${uid}, pageId: ${pageId}, viewId: ${viewId}, date: ${currentDate}`);

    try {
      // Query all documents in /pageViews/{pageId}/ except the current one to check for unique visitor ID
      const allPageViewsSnapshot = await db
        .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/pageViews/${pageId}`)
        .where('visitorID', '==', visitorID)
        .get();

      let isUniqueVisitor = true;
      for (const doc of allPageViewsSnapshot.docs) {
        console.log("doc id is " + doc.id + ", view id is" + viewId);
        if (doc.id !== viewId) {
          isUniqueVisitor = false;
          break;
        }
      }

      console.log("unique visitor " + isUniqueVisitor);

      //This is for specific page
      const pageViewDateDoc = await pageViewDateDocRef.get();

      if (pageViewDateDoc.exists) {
        const data = pageViewDateDoc.data();

        await pageViewDateDocRef.update({
          count: FieldValue.increment(1),
          uniqueVisitors: isUniqueVisitor ? FieldValue.increment(1) : (data.uniqueVisitors || 0)
        });

        console.log(`Incremented count and updated uniqueVisitors for date: ${currentDate}`);
      } else {
        await pageViewDateDocRef.set({
          count: 1,
          uniqueVisitors: isUniqueVisitor ? 1 : 0
        });

        console.log(`Created new document for date: ${currentDate} with count 1 and uniqueVisitors ${isUniqueVisitor ? 1 : 0}`);
      }

      //this is for all pages
      const overalPageViewDateDoc = await overalPageViewDateDocRef.get();

      if (overalPageViewDateDoc.exists) {
        const data = overalPageViewDateDoc.data();

        await overalPageViewDateDocRef.update({
          count: FieldValue.increment(1),
          uniqueVisitors: isUniqueVisitor ? FieldValue.increment(1) : (data.uniqueVisitors || 0)
        });

        console.log(`(overal)Incremented count and updated uniqueVisitors for date: ${currentDate}`);
      } else {
        await overalPageViewDateDocRef.set({
          count: 1,
          uniqueVisitors: isUniqueVisitor ? 1 : 0
        });

        console.log(`(overal)Created new document for date: ${currentDate} with count 1 and uniqueVisitors ${isUniqueVisitor ? 1 : 0}`);
      }

      // Update overall unique visitors
      const metricsRef = db
        .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics`)
        .doc('pageViews');
      const subcollections = await metricsRef.listCollections();

      let visitorFound = false;

      for (const subcollection of subcollections) {
        if (subcollection.id.startsWith('dates_')) continue; // Skip 'dates_' subcollections

        const snapshot = await subcollection.where('visitorID', '==', visitorID).get();

        for (const doc of snapshot.docs) {
          if (doc.id !== viewId) {
            visitorFound = true;
            break;
          }
        }

        if (visitorFound) break;
      }

      console.log("visitorFound " + visitorFound);

      if (!visitorFound) {
        const overallDoc = await metricsRef.get();

        if (overallDoc.exists) {
          await metricsRef.update({
            overallUniqueVisitors: FieldValue.increment(1)
          });
        } else {
          await metricsRef.set({
            overallUniqueVisitors: 1
          });
        }

        console.log(`Incremented overallUniqueVisitors for user: ${uid}`);

        // Update or create document in /knowledgebases/{selectedCompany}/metrics/overallUniqueVisitors/byDates/
        const overallUniqueVisitorsByDateRef = db
          .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/overallUniqueVisitors/byDates`)
          .doc(currentDate);

        const overallUniqueVisitorsByDateDoc = await overallUniqueVisitorsByDateRef.get();

        if (overallUniqueVisitorsByDateDoc.exists) {
          await overallUniqueVisitorsByDateRef.update({
            count: FieldValue.increment(1)
          });
          console.log(`Incremented count for overallUniqueVisitors on date: ${currentDate}`);
        } else {
          await overallUniqueVisitorsByDateRef.set({
            count: 1
          });
          console.log(`Created new document for overallUniqueVisitors on date: ${currentDate} with count 1`);
        }

        // Update country stats
        const countryQuerySnapshot = await db
          .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/otherStats/countries`)
          .where('country', '==', country)
          .get();

        if (!countryQuerySnapshot.empty) {
          const countryDocRef = countryQuerySnapshot.docs[0].ref;
          await countryDocRef.update({
            count: FieldValue.increment(1)
          });
          console.log(`Incremented count for country: ${country}`);
        } else {
          await db
            .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/otherStats/countries`)
            .add({
              country: country,
              count: 1
            });
          console.log(`Created new document for country: ${country} with count 1`);
        }

        // Update referrer stats
        if (referrer) {
          const referrerQuerySnapshot = await db
            .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/otherStats/referrers`)
            .where('referrer', '==', referrer)
            .get();

          if (!referrerQuerySnapshot.empty) {
            const referrerDocRef = referrerQuerySnapshot.docs[0].ref;
            await referrerDocRef.update({
              count: FieldValue.increment(1)
            });
            console.log(`Incremented count for referrer: ${referrer}`);
          } else {
            await db
              .collection(`Users/${uid}/knowledgebases/${selectedCompany}/metrics/otherStats/referrers`)
              .add({
                referrer: referrer,
                count: 1
              });
            console.log(`Created new document for referrer: ${referrer} with count 1`);
          }
        }
      }
    } catch (error) {
      console.error("Error updating page view metrics: ", error);
    }
  }
);

