// CONTADOR DE CHATS CON MENSAJES SIN LEER, EN TIEMPO REAL (EL PUNTO ROJO DEL BOTÓN "MENSAJES" DE LA BARRA DE ABAJO).
// LA ESCUCHA SE CIERRA AL SALIR DE LA PANTALLA. EL ERROR AL CERRAR SESIÓN (YA NO HAY PERMISO) SE IGNORA A PROPÓSITO.
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { auth, db } from '../../firebaseConfig';

export const useMensajesSinLeer = () => {
  const [sinLeer, setSinLeer] = useState(0);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(query(collection(db, 'Chats'), where('usuarios_ids', 'array-contains', uid)),
      (snap) => setSinLeer(snap.docs.filter(d => d.data().ultimo_emisor_id !== uid && d.data().leido === false).length),
      () => {});
  }, []);
  return sinLeer;
};
