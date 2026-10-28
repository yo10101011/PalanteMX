// CONTRATOS ENTRE TRABAJADOR Y CONTRATISTA (COLECCIÓN "Postulaciones").
// LOS CAMBIOS DE ESTADO LOS HACE EL SERVIDOR (backend/kyc-worker, RUTA /contratos); LA APP SOLO PIDE LA ACCIÓN.
//
//   Pendiente ──┐ (el trabajador se postuló: espera al contratista)
//   Propuesta ──┼─► Aceptada (En Proceso) ─► Por confirmar fin ─► Finalizada
//               │            │                      │
//               └─► Rechazada └──── cancelar ───────┴─► Suspendida ─► (admin) Cancelada, o reactivada
import { addDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export const ESTADOS = {
  PENDIENTE: 'Pendiente',
  PROPUESTA: 'Propuesta',
  ACTIVA: 'Aceptada (En Proceso)',
  POR_CONFIRMAR_FIN: 'Por confirmar fin',
  FINALIZADA: 'Finalizada',
  RECHAZADA: 'Rechazada',
  SUSPENDIDA: 'Suspendida',
  CANCELADA: 'Cancelada',
};

// TEXTO Y COLOR PARA MOSTRAR CADA ESTADO
export const ESTILO_ESTADO: Record<string, { texto: string; color: string }> = {
  [ESTADOS.PENDIENTE]: { texto: 'SOLICITUD ENVIADA', color: '#F59E0B' },
  [ESTADOS.PROPUESTA]: { texto: 'PROPUESTA', color: '#3B82F6' },
  [ESTADOS.ACTIVA]: { texto: 'OBRA ACTIVA', color: '#00D06C' },
  [ESTADOS.POR_CONFIRMAR_FIN]: { texto: 'POR CONFIRMAR FIN', color: '#8B5CF6' },
  [ESTADOS.FINALIZADA]: { texto: 'FINALIZADA', color: '#0D2340' },
  [ESTADOS.RECHAZADA]: { texto: 'RECHAZADA', color: '#DC2626' },
  [ESTADOS.SUSPENDIDA]: { texto: 'SUSPENDIDA (EN REVISIÓN)', color: '#DC2626' },
  [ESTADOS.CANCELADA]: { texto: 'CANCELADA', color: '#6B7280' },
};
export const estiloEstado = (estado: string) => ESTILO_ESTADO[estado] || { texto: (estado || '').toUpperCase(), color: '#6B7280' };

// YA TERMINADOS: SE PUEDE CALIFICAR A LA OTRA PERSONA
export const sePuedeCalificar = (estado: string) => [ESTADOS.FINALIZADA, ESTADOS.SUSPENDIDA, ESTADOS.CANCELADA].includes(estado);

export type AccionContrato =
  | 'proponer' | 'postular' | 'aceptar' | 'rechazar'
  | 'solicitar_fin' | 'confirmar_fin' | 'rechazar_fin' | 'cancelar'
  | 'admin_reactivar' | 'admin_cancelar';

// PIDE UNA ACCIÓN AL SERVIDOR. SI NO SE PUEDE, LANZA UN ERROR CON EL MOTIVO (LISTO PARA MOSTRARLO EN UN Alert)
export const accionContrato = async (accion: AccionContrato, datos: { id_contrato?: string; id_vacante?: string; id_trabajador?: string; motivo?: string } = {}) => {
  const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
  if (!KYC_API_URL) throw new Error("Falta configurar EXPO_PUBLIC_KYC_API_URL en el archivo .env");

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

  const response = await fetch(`${KYC_API_URL}/contratos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ accion, ...datos }),
  });
  const resultado = await response.json();
  if (!response.ok) throw new Error(resultado.error || "No se pudo actualizar el contrato.");
  return resultado as { estado?: string; id_contrato?: string };
};

// BITÁCORA DIARIA: VIVE DENTRO DE CADA CONTRATO (Postulaciones/{id}/Bitacora), ASÍ LAS DOS PARTES VEN LA MISMA
export const leerBitacora = async (idContrato: string) => {
  const snap = await getDocs(collection(db, 'Postulaciones', idContrato, 'Bitacora'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

export const agregarABitacora = async (idContrato: string, entrada: { asistio: boolean; nota: string; evidencia: string | null }) => {
  const ahora = new Date();
  await addDoc(collection(db, 'Postulaciones', idContrato, 'Bitacora'), {
    ...entrada,
    autor_id: auth.currentUser?.uid,
    fecha: ahora.toLocaleDateString('es-MX'),
    timestamp: ahora.getTime(),
  });
};
