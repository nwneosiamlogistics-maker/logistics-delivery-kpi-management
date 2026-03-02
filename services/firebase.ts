import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Expect values from Vite env (define in .env.local):
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL,
// VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
// VITE_FIREBASE_APP_ID, VITE_FIREBASE_MEASUREMENT_ID (optional)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

function getAppInstance() {
  if (!getApps().length) {
    if (!firebaseConfig.databaseURL) {
      console.warn('[Firebase] VITE_FIREBASE_DATABASE_URL is not set. Firebase Realtime DB will be disabled.');
    }
    initializeApp(firebaseConfig);
  }
  return getApp();
}

export function getRealtimeDb() {
  if (!firebaseConfig.databaseURL) return null;
  try {
    const app = getAppInstance();
    return getDatabase(app);
  } catch (e) {
    console.warn('[Firebase] getRealtimeDb error:', e);
    return null;
  }
}
