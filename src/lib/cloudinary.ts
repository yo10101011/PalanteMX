// SUBIDAS A CLOUDINARY CON PERMISO FIRMADO.
// CLOUDINARY RECHAZA SUBIDAS SIN FIRMA; LA FIRMA LA DA NUESTRO SERVIDOR (backend/kyc-worker, RUTA /firma-subida)
// SOLO A USUARIOS CON SESIÓN, Y AMARRADA A SU PROPIA CARPETA. LA LLAVE SECRETA NUNCA ESTÁ EN LA APP.
import { auth } from '../../firebaseConfig';

// 'publica': fotos de perfil, vacantes, chat, bitácora, quejas. 'ine': fotos de la INE (privadas).
export type TipoSubida = 'publica' | 'ine';

type ArchivoLocal = { uri: string; name: string; type: string };

const pedirFirma = async (tipo: TipoSubida) => {
  const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
  if (!KYC_API_URL) throw new Error("Falta configurar EXPO_PUBLIC_KYC_API_URL en el archivo .env");

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Inicia sesión para subir archivos.");

  const response = await fetch(`${KYC_API_URL}/firma-subida`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tipo }),
  });
  const firma = await response.json();
  if (!response.ok) throw new Error(firma.error || "No se pudo autorizar la subida.");
  return firma as { cloud_name: string; api_key: string; timestamp: number; signature: string; folder: string; type?: string };
};

// archivo: una imagen en base64 ("data:image/jpeg;base64,...") o un archivo local ({ uri, name, type }).
// resourceType 'auto' sirve para documentos y audios del chat.
export const subirACloudinary = async (archivo: string | ArchivoLocal, tipo: TipoSubida = 'publica', resourceType: 'image' | 'auto' = 'image') => {
  const firma = await pedirFirma(tipo);

  const data = new FormData();
  data.append('file', archivo as any);
  data.append('api_key', firma.api_key);
  data.append('timestamp', String(firma.timestamp));
  data.append('signature', firma.signature);
  data.append('folder', firma.folder);
  if (firma.type) data.append('type', firma.type);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloud_name}/${resourceType}/upload`, { method: 'POST', body: data });
  const resultado = await response.json();
  if (!response.ok || !resultado.secure_url) throw new Error(resultado.error?.message || "No se pudo subir el archivo.");

  return { url: resultado.secure_url as string, publicId: resultado.public_id as string, formato: resultado.format as string };
};

// ATAJO PARA LAS PANTALLAS QUE SOLO NECESITAN LA DIRECCIÓN DE UNA FOTO PÚBLICA
export const subirFotoACloudinary = async (base64String: string) => (await subirACloudinary(base64String)).url;
