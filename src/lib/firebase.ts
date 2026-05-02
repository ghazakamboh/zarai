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

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

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
