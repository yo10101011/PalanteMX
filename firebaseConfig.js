import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage'; // <-- EL ARCHIVERO DE FOTOS

const firebaseConfig = {
  apiKey: "AIzaSyCnlqzM3GCDGICbgUmCrsKPMobxvCqneIc",
  authDomain: "palantemx-2a5aa.firebaseapp.com",
  projectId: "palantemx-2a5aa",
  storageBucket: "palantemx-2a5aa.firebasestorage.app",
  messagingSenderId: "915139500038",
  appId: "1:915139500038:web:7ad857f971d91210b74b87",
  measurementId: "G-E6SQE417RW"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const storage = getStorage(app); // <-- EXPORTAMOS EL STORAGE

export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (error) {
    return getAuth(app);
  }
})();