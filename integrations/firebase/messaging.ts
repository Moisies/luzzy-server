import admin from "firebase-admin";

function getFirebaseCredential() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
        return admin.credential.cert(JSON.parse(json));
    }
    return admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    });
}

admin.initializeApp({
    credential: getFirebaseCredential()
});
const messaging = admin.messaging();

export default messaging;
