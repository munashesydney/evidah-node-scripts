/**
 * User helper functions for retrieving user and company information
 */

const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

/**
 * Gets the user UID based on the email address (to field)
 * Searches by subdomain or defaultForward field
 * @param {string} to - The email address to search for
 * @param {string} selectedCompany - The selected company (default: 'default')
 * @returns {Promise<string|null>} - The user UID or null if not found
 */
async function getUidWithTo(to, selectedCompany = 'default') {
  const { extractEmailName } = require('./emailHelpers');
  const emailName = await extractEmailName(to);

  try {
    // Query all knowledgebases where subdomain matches emailName
    const subdomainSnapshot = await db.collectionGroup('knowledgebases')
      .where('subdomain', '==', emailName)
      .get();

    // Query all knowledgebases where defaultForward matches the full email
    const forwardSnapshot = await db.collectionGroup('knowledgebases')
      .where('defaultForward', '==', to)
      .get();

    let uid = null;

    // Check subdomain matches first
    if (!subdomainSnapshot.empty) {
      // Get the parent document reference (which is the Users/{uid} document)
      const userDocRef = subdomainSnapshot.docs[0].ref.parent.parent;
      uid = userDocRef.id;
    }
    // If no subdomain match, check forward matches
    else if (!forwardSnapshot.empty) {
      // Get the parent document reference (which is the Users/{uid} document)
      const userDocRef = forwardSnapshot.docs[0].ref.parent.parent;
      uid = userDocRef.id;
    }

    if (!uid) {
      console.log('No matching documents found.');
      return null;
    }

    return uid;
  } catch (error) {
    console.error('Error in getUidWithTo:', error);
    return null;
  }
}

/**
 * Gets the company name for a given user and company
 * @param {string} uid - The user UID
 * @param {string} selectedCompany - The selected company (default: 'default')
 * @returns {Promise<string>} - The company name or fallback value
 */
async function getCompanyName(uid, selectedCompany = 'default') {
  try {
    const docRef = db.collection("Users").doc(uid).collection('knowledgebases').doc(selectedCompany);
    const doc = await docRef.get();

    if (doc.exists) {
      console.log("Knowledgebase data:", doc.data());
      return doc.data().name;
    } else {
      console.log("No such document!: getCompanyName");
      return "Company Name"; // Fallback value if the document doesn't exist
    }
  } catch (error) {
    console.log("Error getting document:", error);
    return "Company Name"; // Fallback value in case of an error
  }
}

/**
 * Gets the subdomain for a given user and company
 * @param {string} uid - The user UID
 * @param {string} selectedCompany - The selected company (default: 'default')
 * @returns {Promise<string>} - The subdomain or fallback value
 */
async function getSubdomain(uid, selectedCompany = 'default') {
  try {
    const docRef = db.collection("Users").doc(uid).collection('knowledgebases').doc(selectedCompany);
    const doc = await docRef.get();

    if (doc.exists) {
      //console.log("Knowledgebase data:", doc.data());
      return doc.data().subdomain;
    } else {
      console.log("No such document!: getSubdomain");
      return "aiknowledgedesk"; // Fallback value if the document doesn't exist
    }
  } catch (error) {
    console.log("Error getting document:", error);
    return "aiknowledgedesk"; // Fallback value in case of an error
  }
}

/**
 * Gets user/knowledgebase data
 * @param {string} uid - The user UID
 * @param {string} selectedCompany - The selected company (default: 'default')
 * @returns {Promise<Object|null>} - The user data or null if not found
 */
async function getUserData(uid, selectedCompany = 'default') {
  console.log('uid ' + uid);

  const userDocRef = db.doc(`Users/${uid}/knowledgebases/${selectedCompany}`);

  try {
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      const userdata = userDoc.data();
      return userdata;
    } else {
      console.log('No such document! : getUserData');
      return null;
    }
  } catch (error) {
    console.error('Error getting document:', error);
    return null;
  }
}

/**
 * Removes everything after '@' in an email address
 * @param {string} inputString - The email address
 * @returns {string} - The part before '@'
 */
function removeAfterAt(inputString) {
  // Split the string at '@' and take the first part (before '@')
  return inputString.split('@')[0];
}

module.exports = {
  getUidWithTo,
  getCompanyName,
  getSubdomain,
  getUserData,
  removeAfterAt
};

