// ELIMINA UNA CUENTA POR COMPLETO A TRAVÉS DEL SERVIDOR (backend/kyc-worker, RUTA /eliminar-cuenta):
// PERFIL, DATOS PRIVADOS, FOTOS DE LA INE Y EL USUARIO DE FIREBASE, TODO JUNTO.
// SIN uid BORRA LA CUENTA PROPIA; CON uid BORRA LA DE OTRA PERSONA (SOLO FUNCIONA SI QUIEN LLAMA ES ADMIN).
import { auth } from '../../firebaseConfig';

export const eliminarCuentaEnServidor = async (uid?: string) => {
  const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
  if (!KYC_API_URL) throw new Error("Falta configurar EXPO_PUBLIC_KYC_API_URL en el archivo .env");

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

  const response = await fetch(`${KYC_API_URL}/eliminar-cuenta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(uid ? { uid } : {}),
  });
  const resultado = await response.json();
  if (!response.ok) throw new Error(resultado.error || "No se pudo eliminar la cuenta.");
};
