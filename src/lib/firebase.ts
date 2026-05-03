import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAwajoGttl92-BPybiZsQf8-zdTxQTP_lU",
  authDomain: "gen-lang-client-0599444341.firebaseapp.com",
  projectId: "gen-lang-client-0599444341",
  storageBucket: "gen-lang-client-0599444341.firebasestorage.app",
  messagingSenderId: "324980043558",
  appId: "1:324980043558:web:feca39c36dfcbf94f15be7"
};

const firestoreDatabaseId = "ai-studio-c5216612-3846-44a1-9e8c-e2d2eb2aa08e";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Guard against multiple concurrent sign-in requests which cause
// "auth/cancelled-popup-request" and "INTERNAL ASSERTION FAILED"
let signInProgress: Promise<any> | null = null;

export const signInWithGoogle = async () => {
  if (signInProgress) {
    return signInProgress;
  }

  signInProgress = signInWithPopup(auth, googleProvider)
    .then((result) => {
      signInProgress = null;
      return result;
    })
    .catch((error) => {
      signInProgress = null;
      // Handle "auth/cancelled-popup-request" silently or with custom logic if needed
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.warn('Sign-in cancelled or closed by user.');
      } else {
        throw error;
      }
    });

  return signInProgress;
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Firestore Error:', { error, operationType, path });
}
