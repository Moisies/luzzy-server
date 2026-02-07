import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function getFirebaseCredential() {
    // Try loading from base64 env var (strips whitespace/newlines that Dokploy may add)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        const cleaned = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.replace(/\s/g, '');
        const json = Buffer.from(cleaned, 'base64').toString('utf-8');
        return admin.credential.cert(JSON.parse(json));
    }
    // Try loading from JSON file
    const filePath = path.join(process.cwd(), 'firebase-service-account.json');
    if (fs.existsSync(filePath)) {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return admin.credential.cert(content);
    }
    // Fallback to individual env vars
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
