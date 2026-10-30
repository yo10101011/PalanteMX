import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
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

// EN CELULARES, LA CONEXIÓN EN TIEMPO REAL DE FIRESTORE (WEBCHANNEL) SE CORTA CON DATOS MÓVILES O WIFI DÉBIL
// ("Could not reach Cloud Firestore backend"). LONG POLLING ES MÁS ESTABLE EN REACT NATIVE.
export const db = (() => {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (error) {
    return getFirestore(app); // AL RECARGAR LA APP YA ESTABA INICIALIZADO
  }
})();
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