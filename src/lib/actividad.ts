// ACTIVIDAD DIARIA PARA LA ANALÍTICA DEL ADMIN ("USUARIOS ACTIVOS POR DÍA").
// CADA VEZ QUE ALGUIEN ABRE SU PANEL SE INTENTA CREAR Actividad/{AAAA-MM-DD}_{uid}. SOLO SE PUEDE CREAR UNA VEZ POR DÍA
// (LAS REGLAS NO DEJAN REESCRIBIRLO), ASÍ QUE CONTAR LOS DOCUMENTOS DE UN DÍA = CUÁNTAS PERSONAS ENTRARON ESE DÍA.
import { doc, setDoc } from 'firebase/firestore';

import { auth, db } from '../../firebaseConfig';
import { claveDia } from '@/lib/contratos';

const yaRegistrado = new Set<string>(); // PARA NO REPETIR EL INTENTO EN LA MISMA SESIÓN

export const registrarActividad = (rol: 'Trabajador' | 'Contratista') => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const fecha = claveDia(new Date());
  const id = `${fecha}_${uid}`;
  if (yaRegistrado.has(id)) return;
  yaRegistrado.add(id);
  // SI YA EXISTÍA (YA HABÍA ENTRADO HOY), LAS REGLAS LO RECHAZAN Y NO PASA NADA
  setDoc(doc(db, 'Actividad', id), { uid, fecha, rol }).catch(() => {});
};
