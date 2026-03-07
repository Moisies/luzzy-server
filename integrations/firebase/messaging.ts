import admin from "firebase-admin";

let messagingInstance: admin.messaging.Messaging | null = null;

function getMessaging(): admin.messaging.Messaging {
  if (!messagingInstance) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    }
    messagingInstance = admin.messaging();
  }
  return messagingInstance;
}

const messaging = {
  send: (message: admin.messaging.Message) => getMessaging().send(message),
};

export default messaging;
