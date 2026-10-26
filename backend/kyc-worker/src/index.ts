// Worker de verificación de identidad (KYC) de PalanteMX.
// Aquí viven las llaves de OCR.space y Face++, fuera de la app, donde nadie puede leerlas.
// Solo responde a usuarios con sesión válida de Firebase.
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env {
  FIREBASE_PROJECT_ID: string;
  CLOUDINARY_CLOUD_NAME: string;
  OCR_KEY: string;
  FACE_KEY: string;
  FACE_SECRET: string;
}

// LLAVES PÚBLICAS DE GOOGLE PARA COMPROBAR QUE EL TOKEN DE FIREBASE ES REAL
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const responder = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });

class ErrorKYC extends Error {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/verificar-identidad') {
      return responder(404, { error: 'Ruta no encontrada' });
    }

    // 1. COMPROBAR QUE QUIEN LLAMA TIENE SESIÓN EN FIREBASE
    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return responder(401, { error: 'Falta el token de sesión' });

    try {
      await jwtVerify(idToken, FIREBASE_JWKS, {
        issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
        audience: env.FIREBASE_PROJECT_ID,
      });
    } catch {
      return responder(401, { error: 'Sesión inválida o expirada' });
    }

    // 2. LEER Y VALIDAR LOS DATOS QUE MANDA LA APP
    let datos: { urlINEFrente?: unknown; urlSelfie?: unknown; nombreCompleto?: unknown };
    try {
      datos = await request.json();
    } catch {
      return responder(400, { error: 'Cuerpo de la petición inválido' });
    }

    const { urlINEFrente, urlSelfie, nombreCompleto } = datos;
    if (typeof urlINEFrente !== 'string' || typeof urlSelfie !== 'string' || typeof nombreCompleto !== 'string') {
      return responder(400, { error: 'Faltan datos para la verificación' });
    }

    // SOLO ACEPTAMOS FOTOS DE NUESTRA CUENTA DE CLOUDINARY (EVITA QUE USEN NUESTRA CUOTA CON OTRAS IMÁGENES)
    const prefijoCloudinary = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
    if (!urlINEFrente.startsWith(prefijoCloudinary) || !urlSelfie.startsWith(prefijoCloudinary)) {
      return responder(400, { error: 'Las imágenes no provienen de PalanteMX' });
    }

    // 3. VERIFICACIÓN (MISMA LÓGICA QUE ANTES TENÍA LA APP)
    try {
      await validarNombreEnINE(env, urlINEFrente, nombreCompleto);
      await validarRostro(env, urlINEFrente, urlSelfie);
      return responder(200, { aprobado: true });
    } catch (error) {
      if (error instanceof ErrorKYC) return responder(200, { aprobado: false, motivo: error.message });
      console.log('Error interno de KYC', error);
      return responder(502, { error: 'El servicio de verificación no respondió. Intenta más tarde.' });
    }
  },
};

const validarNombreEnINE = async (env: Env, urlINEFrente: string, nombreCompleto: string) => {
  const form = new FormData();
  form.append('url', urlINEFrente);
  form.append('language', 'spa');
  form.append('isOverlayRequired', 'false');

  const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: env.OCR_KEY },
    body: form,
  });
  const ocrData: any = await ocrResponse.json();

  if (ocrData.IsErroredOnProcessing) throw new ErrorKYC('Documento ilegible. Escanea la INE con mejor iluminación.');

  const textoINE: string = ocrData.ParsedResults?.[0]?.ParsedText?.toUpperCase() || '';
  let coincidencias = 0;
  nombreCompleto.toUpperCase().split(' ').forEach(palabra => {
    if (palabra.length > 2 && textoINE.includes(palabra)) coincidencias++;
  });
  if (coincidencias < 2) throw new ErrorKYC('Fraude: El nombre no coincide con el documento oficial escaneado.');
};

const validarRostro = async (env: Env, urlINEFrente: string, urlSelfie: string) => {
  const form = new FormData();
  form.append('api_key', env.FACE_KEY);
  form.append('api_secret', env.FACE_SECRET);
  form.append('image_url1', urlINEFrente);
  form.append('image_url2', urlSelfie);

  const faceResponse = await fetch('https://api-us.faceplusplus.com/facepp/v3/compare', { method: 'POST', body: form });
  const faceData: any = await faceResponse.json();

  if (faceData.error_message || !faceData.faces1?.length || !faceData.faces2?.length) {
    throw new ErrorKYC('Las fotografías no coinciden.');
  }
  if (faceData.confidence < faceData.thresholds['1e-4']) {
    throw new ErrorKYC('Las fotografías no coinciden.');
  }
};
