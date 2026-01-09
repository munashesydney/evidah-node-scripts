const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { runActionTriggers } = require('./helpers/actionTriggerHelper');

exports.listenToAnsweredQuestions = onDocumentCreated(
  'Users/{uid}/knowledgebases/{selectedCompany}/answered/{answerId}',
  async (event) => {
    const FUNCTIONS_MODE = process.env.FUNCTIONS_MODE || 'test';

    if (FUNCTIONS_MODE === 'test') {
      console.log('FUNCTIONS_MODE is test, skipping listenToAnsweredQuestions');
      return;
    }

    const snapshot = event.data;
    if (!snapshot) {
      console.log('[QUESTION ANSWERED] No data in event');
      return;
    }

    const answerData = snapshot.data();
    if (!answerData) {
      console.log('[QUESTION ANSWERED] Empty answer data');
      return;
    }

    const { uid, selectedCompany, answerId } = event.params;
    const companyId = selectedCompany || 'default';

    const triggerData = {
      answerId,
      question: answerData.question || '',
      answer: answerData.answer || '',
      ticketId: answerData.ticket_id || '',
      sessionId: answerData.session_id || '',
      chatId: answerData.chat_id || '',
      moreInfo: answerData.more_info || '',
      createdAt: answerData.createdAt || new Date().toISOString(),
    };

    await runActionTriggers({
      uid,
      companyId,
      triggerType: 'question_answered',
      triggerData,
      conversationHistory: [],
    });
  }
);

