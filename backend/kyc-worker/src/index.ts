// Worker de verificación de identidad (KYC) de PalanteMX.
// Aquí viven las llaves de OCR.space, Face++ y la cuenta de servicio de Firebase, fuera de la app, donde nadie puede leerlas.
// Rutas:
//   POST /verificar-identidad  -> verifica INE + selfie y, si se aprueba, CREA el perfil en Firestore (solo usuarios con sesión).
//   POST /iniciar-sesion       -> login con usuario o teléfono + contraseña; devuelve un pase de Firebase, NUNCA el correo.
//   POST /resenas              -> deja una reseña (solo entre quienes trabajaron juntos, una vez).
//   POST /firma-subida         -> da permiso firmado para subir UNA foto/archivo a Cloudinary (solo usuarios con sesión).
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  OCR_KEY: string;
  FACE_KEY: string;
  FACE_SECRET: string;
  // EL JSON COMPLETO DE LA CUENTA DE SERVICIO (SE GUARDA CON `wrangler secret put FIREBASE_SERVICE_ACCOUNT`)
  FIREBASE_SERVICE_ACCOUNT: string;
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
    if (request.method === 'POST' && url.pathname === '/verificar-identidad') return verificarIdentidad(request, env);
    if (request.method === 'POST' && url.pathname === '/iniciar-sesion') return iniciarSesion(request, env);
    if (request.method === 'POST' && url.pathname === '/resenas') return crearResena(request, env);
    if (request.method === 'POST' && url.pathname === '/firma-subida') return firmarSubida(request, env);
    return responder(404, { error: 'Ruta no encontrada' });
  },
};

// COMPRUEBA QUE QUIEN LLAMA TIENE SESIÓN EN FIREBASE Y DEVUELVE SU UID Y CORREO (SACADOS DEL TOKEN, NO DEL CUERPO)
const verificarSesion = async (request: Request, env: Env): Promise<{ uid: string; correo: string } | null> => {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return null;

  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { uid: payload.sub, correo: payload.email };
  } catch {
    return null;
  }
};

// =========================================================================
// RUTA 1: VERIFICAR IDENTIDAD Y CREAR EL PERFIL
// =========================================================================
const verificarIdentidad = async (request: Request, env: Env) => {
  // 1. COMPROBAR QUE QUIEN LLAMA TIENE SESIÓN EN FIREBASE
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });
  const { uid, correo } = sesion;

  // 2. LEER Y VALIDAR LOS DATOS QUE MANDA LA APP
  let datos: Record<string, unknown>;
  try {
    datos = await request.json();
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }

  const perfil = validarPerfil(datos);
  if (!perfil) return responder(400, { error: 'Faltan datos o tienen un formato inválido' });

  // SOLO ACEPTAMOS FOTOS QUE ESTE MISMO USUARIO SUBIÓ CON NUESTRO PERMISO FIRMADO:
  // LAS INE EN SU CARPETA PRIVADA Y LA SELFIE EN SU CARPETA PÚBLICA
  const carpetaINE = `palantemx/ine/${uid}/`;
  const prefijoSelfie = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
  if (!perfil.ineFrente.publicId.startsWith(carpetaINE) || !perfil.ineReverso.publicId.startsWith(carpetaINE)
      || !perfil.urlSelfie.startsWith(prefijoSelfie) || !perfil.urlSelfie.includes(`/palantemx/publico/${uid}/`)) {
    return responder(400, { error: 'Las imágenes no provienen de PalanteMX' });
  }

  // LA INE ES PRIVADA: SOLO EL WORKER SABE FIRMAR LA DIRECCIÓN TEMPORAL PARA QUE OCR.space Y Face++ LA LEAN
  const urlINEFrente = await urlPrivadaCloudinary(env, perfil.ineFrente.publicId, perfil.ineFrente.formato);
  const revisionINE = await fetch(urlINEFrente, { method: 'HEAD' });
  if (!revisionINE.ok) {
    console.log('No se pudo leer la INE privada en Cloudinary', revisionINE.status, perfil.ineFrente.publicId);
    return responder(502, { error: 'No se pudo leer la foto de tu INE. Vuelve a escanearla.' });
  }

  // 3. VERIFICACIÓN. EL NOMBRE QUE SE REVISA EN LA INE ES EXACTAMENTE EL QUE SE VA A GUARDAR
  try {
    await validarNombreEnINE(env, urlINEFrente, `${perfil.nombre} ${perfil.apellidos}`);
    await validarRostro(env, urlINEFrente, perfil.urlSelfie);
  } catch (error) {
    if (error instanceof ErrorKYC) return responder(200, { aprobado: false, motivo: error.message });
    console.log('Error interno de KYC', error);
    return responder(502, { error: 'El servicio de verificación no respondió. Intenta más tarde.' });
  }

  // 4. APROBADO: EL SERVIDOR (NO LA APP) CREA EL PERFIL CON kyc_aprobado = true
  try {
    const coleccion = perfil.rol === 'Contratista' ? 'Contratistas' : 'Usuarios';
    const datosUsuario: Record<string, unknown> = {
      rol_usuario: perfil.rol,
      nombre: perfil.nombre,
      apellidos: perfil.apellidos,
      correo,
      numero_telefono: perfil.telefono,
      nombre_usuario: perfil.usuario,
      foto_rostro_url: perfil.urlSelfie,
      ubicacion: perfil.ubicacion,
      kyc_aprobado: true,
      estado_cuenta: 'Activa',
      calificacion: '0.0',
      fecha_registro: new Date(),
    };
    if (perfil.rol === 'Trabajador') datosUsuario.oficio_principal = perfil.oficio;

    // LAS FOTOS DE LA INE VAN A UNA COLECCIÓN PRIVADA (SOLO LA VE EL DUEÑO Y EL ADMIN), NO AL PERFIL PÚBLICO.
    // SE GUARDA SU ID DE CLOUDINARY (NO UNA DIRECCIÓN), PORQUE PARA VERLAS HAY QUE FIRMAR UNA DIRECCIÓN NUEVA.
    // (SE SOBREESCRIBE PARA QUE, SI ALGO FALLÓ A MEDIAS ANTES, EL USUARIO PUEDA REINTENTAR)
    await guardarDocumento(env, 'Verificaciones', uid, {
      ine_frente: { public_id: perfil.ineFrente.publicId, formato: perfil.ineFrente.formato },
      ine_reverso: { public_id: perfil.ineReverso.publicId, formato: perfil.ineReverso.formato },
      foto_rostro_url: perfil.urlSelfie,
      aprobado: true,
      fecha_verificacion: new Date(),
    });
    await crearDocumento(env, coleccion, uid, datosUsuario);
  } catch (error) {
    if (error instanceof ErrorYaExiste) return responder(409, { error: 'Esta cuenta ya tiene un perfil registrado.' });
    console.log('Error guardando el perfil', error);
    return responder(502, { error: 'No se pudo guardar tu perfil. Intenta más tarde.' });
  }

  return responder(200, { aprobado: true });
};

type PerfilValidado = {
  rol: 'Trabajador' | 'Contratista';
  nombre: string;
  apellidos: string;
  telefono: string;
  usuario: string;
  oficio: string;
  ubicacion: { latitud: number; longitud: number };
  ineFrente: FotoPrivada;
  ineReverso: FotoPrivada;
  urlSelfie: string;
};

type FotoPrivada = { publicId: string; formato: string };

const textoValido = (valor: unknown, max = 100): valor is string =>
  typeof valor === 'string' && valor.trim().length > 0 && valor.length <= max;

const FORMATOS_IMAGEN = ['jpg', 'jpeg', 'png', 'webp'];

const validarFotoPrivada = (valor: unknown): FotoPrivada | null => {
  const foto = valor as { publicId?: unknown; formato?: unknown } | undefined;
  if (!foto || !textoValido(foto.publicId, 300) || !/^[\w\-/]+$/.test(foto.publicId)) return null;
  if (typeof foto.formato !== 'string' || !FORMATOS_IMAGEN.includes(foto.formato)) return null;
  return { publicId: foto.publicId, formato: foto.formato };
};

const validarPerfil = (d: Record<string, unknown>): PerfilValidado | null => {
  const ubicacion = d.ubicacion as { latitud?: unknown; longitud?: unknown } | undefined;
  if (d.rol !== 'Trabajador' && d.rol !== 'Contratista') return null;
  if (!textoValido(d.nombre) || !textoValido(d.apellidos) || !textoValido(d.telefono, 20) || !textoValido(d.usuario, 40)) return null;
  if (d.rol === 'Trabajador' && !textoValido(d.oficio)) return null;
  if (!ubicacion || typeof ubicacion.latitud !== 'number' || typeof ubicacion.longitud !== 'number') return null;
  if (!Number.isFinite(ubicacion.latitud) || !Number.isFinite(ubicacion.longitud)) return null;
  const ineFrente = validarFotoPrivada(d.ineFrente);
  const ineReverso = validarFotoPrivada(d.ineReverso);
  if (!ineFrente || !ineReverso || !textoValido(d.urlSelfie, 500)) return null;

  return {
    rol: d.rol,
    nombre: d.nombre.trim().toUpperCase(),
    apellidos: d.apellidos.trim().toUpperCase(),
    telefono: d.telefono.trim(),
    usuario: d.usuario.trim(),
    oficio: typeof d.oficio === 'string' ? d.oficio.trim() : '',
    ubicacion: { latitud: ubicacion.latitud, longitud: ubicacion.longitud },
    ineFrente,
    ineReverso,
    urlSelfie: d.urlSelfie,
  };
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

// =========================================================================
// RUTA 2: INICIAR SESIÓN CON USUARIO O TELÉFONO
// EL SERVIDOR BUSCA EL CORREO POR DENTRO, REVISA LA CONTRASEÑA CON FIREBASE Y DEVUELVE UN "PASE" (CUSTOM TOKEN).
// NUNCA DEVUELVE EL CORREO, Y RESPONDE LO MISMO SI EL USUARIO NO EXISTE O SI LA CONTRASEÑA ESTÁ MAL,
// PARA QUE NADIE PUEDA AVERIGUAR QUÉ USUARIOS O TELÉFONOS ESTÁN REGISTRADOS.
// =========================================================================
const CREDENCIALES_INCORRECTAS = 'Usuario o contraseña incorrectos.';

const iniciarSesion = async (request: Request, env: Env) => {
  let datos: { identificador?: unknown; password?: unknown };
  try {
    datos = await request.json();
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }
  const { identificador, password } = datos;
  if (!textoValido(identificador, 60) || typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return responder(400, { error: 'Escribe tu usuario o teléfono y tu contraseña.' });
  }

  try {
    let correo: string | null = null;
    const valor = identificador.trim();
    for (const coleccion of ['Usuarios', 'Contratistas']) {
      for (const campo of ['nombre_usuario', 'numero_telefono']) {
        correo = correo || await buscarCorreo(env, coleccion, campo, valor);
      }
    }
    // FIREBASE REVISA LA CONTRASEÑA (CON SUS PROPIAS PROTECCIONES CONTRA INTENTOS REPETIDOS).
    // SI EL USUARIO NO EXISTE SE PREGUNTA IGUAL CON UN CORREO INEXISTENTE, PARA QUE LA RESPUESTA TARDE LO MISMO
    // Y NO SE PUEDA SABER, MIDIENDO EL TIEMPO, SI EL USUARIO EXISTE.
    const respuesta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo || 'no-existe@palantemx.invalid', password, returnSecureToken: true }),
    });
    if (!correo) return responder(401, { error: CREDENCIALES_INCORRECTAS });
    const resultado = (await respuesta.json()) as { localId?: string; error?: { message?: string } };
    if (!respuesta.ok || !resultado.localId) {
      if (resultado.error?.message?.startsWith('TOO_MANY_ATTEMPTS')) {
        return responder(429, { error: 'Demasiados intentos. Espera unos minutos o recupera tu contraseña.' });
      }
      if (resultado.error?.message === 'USER_DISABLED') return responder(403, { error: 'Esta cuenta está deshabilitada.' });
      return responder(401, { error: CREDENCIALES_INCORRECTAS });
    }

    return responder(200, { token: await crearPaseFirebase(env, resultado.localId) });
  } catch (error) {
    console.log('Error iniciando sesión', error);
    return responder(502, { error: 'No se pudo iniciar sesión. Intenta más tarde.' });
  }
};

// "CUSTOM TOKEN" DE FIREBASE: UN PASE FIRMADO CON LA CUENTA DE SERVICIO QUE LA APP CANJEA CON signInWithCustomToken
const crearPaseFirebase = async (env: Env, uid: string) => {
  const cuenta = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as { client_email: string; private_key: string };
  const llavePrivada = await importPKCS8(cuenta.private_key, 'RS256');
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(cuenta.client_email)
    .setSubject(cuenta.client_email)
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(llavePrivada);
};

// =========================================================================
// RUTA 3: DEJAR UNA RESEÑA
// SOLO SE PUEDE CALIFICAR A ALGUIEN CON QUIEN SE TRABAJÓ (POSTULACIÓN ACEPTADA), UNA SOLA VEZ,
// Y EL PROMEDIO LO CALCULA EL SERVIDOR. LAS REGLAS DE FIRESTORE YA NO DEJAN QUE LA APP TOQUE ESTOS CAMPOS.
// =========================================================================
const ESTADO_ACEPTADA = 'Aceptada (En Proceso)';

const crearResena = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });
  const idEvaluador = sesion.uid;

  let datos: { id_evaluado?: unknown; estrellas?: unknown; comentario?: unknown };
  try {
    datos = await request.json();
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }
  const { id_evaluado: idEvaluado, estrellas, comentario } = datos;
  if (!textoValido(idEvaluado, 128) || !textoValido(comentario, 500)) {
    return responder(400, { error: 'Escribe un comentario (máximo 500 caracteres).' });
  }
  if (typeof estrellas !== 'number' || !Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return responder(400, { error: 'La calificación debe ser de 1 a 5 estrellas.' });
  }
  if (idEvaluado === idEvaluador) return responder(400, { error: 'No puedes calificarte a ti mismo.' });

  try {
    // HASTA 2 INTENTOS: SI OTRA PERSONA CALIFICA AL MISMO TIEMPO, SE VUELVE A LEER Y A CALCULAR
    for (let intento = 0; intento < 2; intento++) {
      const docs = await leerDocumentos(env, [
        `Usuarios/${idEvaluador}`, `Contratistas/${idEvaluador}`,
        `Usuarios/${idEvaluado}`, `Contratistas/${idEvaluado}`,
        `Resenas_Plataforma/${idEvaluador}_${idEvaluado}`,
      ]);
      const evaluador = docs[`Usuarios/${idEvaluador}`] || docs[`Contratistas/${idEvaluador}`];
      const rutaEvaluado = docs[`Usuarios/${idEvaluado}`] ? `Usuarios/${idEvaluado}` : `Contratistas/${idEvaluado}`;
      const evaluado = docs[rutaEvaluado];

      if (!evaluador) return responder(403, { error: 'Tu cuenta no tiene un perfil verificado.' });
      if (texto(evaluador.fields.estado_cuenta) === 'Bloqueada') return responder(403, { error: 'Tu cuenta está bloqueada.' });
      if (!evaluado) return responder(404, { error: 'No se encontró el perfil de este usuario.' });
      if (docs[`Resenas_Plataforma/${idEvaluador}_${idEvaluado}`]) {
        return responder(409, { error: 'Ya calificaste a esta persona. Solo se permite una reseña por persona.' });
      }
      if (!(await trabajaronJuntos(env, idEvaluador, idEvaluado))) {
        return responder(403, { error: 'Solo puedes calificar a alguien con quien hayas trabajado (una postulación aceptada en la plataforma).' });
      }

      const numeroActual = Number(evaluado.fields.numero_resenas?.integerValue ?? evaluado.fields.numero_resenas?.doubleValue ?? 0);
      const califActual = parseFloat(texto(evaluado.fields.calificacion) || '0') || 0;
      const nuevoNumero = numeroActual + 1;
      const nuevaCalif = ((califActual * numeroActual) + estrellas) / nuevoNumero;

      const ahora = new Date();
      const nombreEvaluador = `${texto(evaluador.fields.nombre)} ${texto(evaluador.fields.apellidos)}`.trim();
      const resena = {
        evaluador_id: idEvaluador,
        evaluador_nombre: nombreEvaluador,
        evaluador_foto: texto(evaluador.fields.foto_rostro_url) || 'https://via.placeholder.com/150',
        estrellas,
        comentario: comentario.trim(),
        fecha: ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }),
        timestamp: ahora.getTime(),
      };
      const rolEvaluado = rutaEvaluado.startsWith('Usuarios/') ? 'Trabajador' : 'Contratista';
      const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

      const guardado = await confirmarEscrituras(env, [
        // LA RESEÑA EN LA COLECCIÓN GENERAL. SU ID FIJO EVITA QUE LA MISMA PERSONA CALIFIQUE DOS VECES
        {
          update: {
            name: `${nombreBase}/Resenas_Plataforma/${idEvaluador}_${idEvaluado}`,
            fields: aCamposFirestore({
              ...resena,
              evaluado_id: idEvaluado,
              evaluado_nombre: `${texto(evaluado.fields.nombre)} ${texto(evaluado.fields.apellidos)}`.trim(),
              evaluado_rol: rolEvaluado,
            }),
          },
          currentDocument: { exists: false },
        },
        // EL PROMEDIO Y LA LISTA DE RESEÑAS EN EL PERFIL. SOLO SE GUARDA SI NADIE LO CAMBIÓ DESDE QUE LO LEÍMOS
        {
          update: {
            name: `${nombreBase}/${rutaEvaluado}`,
            fields: aCamposFirestore({ calificacion: nuevaCalif.toFixed(1), numero_resenas: nuevoNumero }),
          },
          updateMask: { fieldPaths: ['calificacion', 'numero_resenas'] },
          updateTransforms: [{ fieldPath: 'resenas', appendMissingElements: { values: [aValorFirestore(resena)] } }],
          currentDocument: { updateTime: evaluado.updateTime },
        },
      ]);
      if (guardado) return responder(200, { calificacion: nuevaCalif.toFixed(1) });
    }
    return responder(409, { error: 'Mucha gente está calificando a esta persona ahora mismo. Intenta de nuevo.' });
  } catch (error) {
    console.log('Error guardando reseña', error);
    return responder(502, { error: 'No se pudo guardar la reseña. Intenta más tarde.' });
  }
};

// ¿HAY UNA POSTULACIÓN ACEPTADA ENTRE ESTAS DOS PERSONAS? (UNA ES EL TRABAJADOR Y LA OTRA EL DUEÑO DE LA VACANTE)
const trabajaronJuntos = async (env: Env, idA: string, idB: string) => {
  for (const [trabajador, contratista] of [[idA, idB], [idB, idA]]) {
    const postulaciones = await buscarPostulacionesAceptadas(env, trabajador);
    // LAS POSTULACIONES DE CONTRATACIÓN DIRECTA YA TRAEN id_contratista
    if (postulaciones.some(p => p.idContratista === contratista)) return true;

    // LAS QUE HIZO EL TRABAJADOR DESDE LA BOLSA DE TRABAJO NO LO TRAEN: SE BUSCA EN SU VACANTE
    const vacantesPorRevisar = postulaciones.filter(p => !p.idContratista && p.idVacante).map(p => `Vacantes/${p.idVacante}`);
    if (vacantesPorRevisar.length > 0) {
      const vacantes = await leerDocumentos(env, vacantesPorRevisar);
      if (Object.values(vacantes).some(v => v && texto(v.fields.id_contratista) === contratista)) return true;
    }
  }
  return false;
};

const buscarPostulacionesAceptadas = async (env: Env, idTrabajador: string) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'Postulaciones' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'id_trabajador' }, op: 'EQUAL', value: { stringValue: idTrabajador } } },
              { fieldFilter: { field: { fieldPath: 'estado' }, op: 'EQUAL', value: { stringValue: ESTADO_ACEPTADA } } },
            ],
          },
        },
        limit: 50,
      },
    }),
  });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);

  const resultados = (await respuesta.json()) as { document?: { fields?: Record<string, ValorFirestore> } }[];
  return resultados
    .filter(r => r.document)
    .map(r => ({ idContratista: texto(r.document!.fields?.id_contratista), idVacante: texto(r.document!.fields?.id_vacante) }));
};

// =========================================================================
// RUTA 4: PERMISO FIRMADO PARA SUBIR A CLOUDINARY
// CLOUDINARY RECHAZA CUALQUIER SUBIDA SIN UNA FIRMA HECHA CON NUESTRA LLAVE SECRETA, QUE SOLO VIVE AQUÍ.
// CADA USUARIO SOLO PUEDE SUBIR A SU PROPIA CARPETA, Y LAS INE QUEDAN PRIVADAS ("authenticated").
// =========================================================================
const firmarSubida = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });

  let tipo: unknown;
  try {
    tipo = ((await request.json()) as { tipo?: unknown }).tipo;
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }
  if (tipo !== 'ine' && tipo !== 'publica') return responder(400, { error: 'Tipo de subida inválido' });

  // ESTOS PARÁMETROS QUEDAN AMARRADOS A LA FIRMA: LA APP NO PUEDE CAMBIAR LA CARPETA NI HACER PÚBLICA UNA INE
  const parametros: Record<string, string | number> = {
    folder: `palantemx/${tipo === 'ine' ? 'ine' : 'publico'}/${sesion.uid}`,
    timestamp: Math.floor(Date.now() / 1000), // CLOUDINARY SOLO ACEPTA LA FIRMA DURANTE 1 HORA
  };
  if (tipo === 'ine') parametros.type = 'authenticated';

  return responder(200, {
    ...parametros,
    signature: await firmarParametrosCloudinary(env, parametros),
    api_key: env.CLOUDINARY_API_KEY,
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
  });
};

const sha1 = async (contenido: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(contenido)));

// FIRMA DE SUBIDA DE CLOUDINARY: SHA-1 DE "clave=valor&clave=valor" (EN ORDEN ALFABÉTICO) + LLAVE SECRETA, EN HEXADECIMAL
const firmarParametrosCloudinary = async (env: Env, parametros: Record<string, string | number>) => {
  const cadena = Object.keys(parametros).sort().map(clave => `${clave}=${parametros[clave]}`).join('&');
  const bytes = await sha1(cadena + env.CLOUDINARY_API_SECRET);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

// DIRECCIÓN FIRMADA PARA VER UNA FOTO PRIVADA ("authenticated"):
// LOS PRIMEROS 8 CARACTERES DEL SHA-1 (EN BASE64 PARA URL) DE "id.formato" + LLAVE SECRETA
const urlPrivadaCloudinary = async (env: Env, publicId: string, formato: string) => {
  const recurso = `${publicId}.${formato}`;
  const bytes = await sha1(recurso + env.CLOUDINARY_API_SECRET);
  const firma = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/authenticated/s--${firma}--/${recurso}`;
};

// =========================================================================
// ACCESO A FIRESTORE CON LA CUENTA DE SERVICIO (API REST, SIN LIBRERÍAS EXTRA)
// LA CUENTA DE SERVICIO SE SALTA LAS REGLAS DE SEGURIDAD: POR ESO SOLO VIVE AQUÍ, NUNCA EN LA APP.
// =========================================================================
class ErrorYaExiste extends Error {}

let tokenEnCache: { valor: string; expira: number } | null = null;

const obtenerTokenGoogle = async (env: Env) => {
  if (tokenEnCache && tokenEnCache.expira > Date.now() + 60_000) return tokenEnCache.valor;

  const cuenta = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as { client_email: string; private_key: string };
  const llavePrivada = await importPKCS8(cuenta.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(cuenta.client_email)
    .setSubject(cuenta.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(llavePrivada);

  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!respuesta.ok) throw new Error(`Google rechazó la cuenta de servicio: ${await respuesta.text()}`);

  const { access_token, expires_in } = (await respuesta.json()) as { access_token: string; expires_in: number };
  tokenEnCache = { valor: access_token, expira: Date.now() + expires_in * 1000 };
  return access_token;
};

const urlDocumentos = (env: Env) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// CREA EL DOCUMENTO SOLO SI NO EXISTE (ASÍ NADIE PUEDE VOLVER A LLAMAR LA RUTA PARA SOBREESCRIBIR SU PERFIL)
const crearDocumento = async (env: Env, coleccion: string, id: string, datos: Record<string, unknown>) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}/${coleccion}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: aCamposFirestore(datos) }),
  });
  if (respuesta.status === 409) throw new ErrorYaExiste();
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);
};

// CREA O REEMPLAZA EL DOCUMENTO COMPLETO
const guardarDocumento = async (env: Env, coleccion: string, id: string, datos: Record<string, unknown>) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}/${coleccion}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: aCamposFirestore(datos) }),
  });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);
};

const buscarCorreo = async (env: Env, coleccion: string, campo: string, valor: string) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } },
        limit: 1,
      },
    }),
  });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);

  const resultados = (await respuesta.json()) as { document?: { fields?: Record<string, { stringValue?: string }> } }[];
  return resultados[0]?.document?.fields?.correo?.stringValue || null;
};

type ValorFirestore = { stringValue?: string; integerValue?: string; doubleValue?: number };
type DocumentoLeido = { fields: Record<string, ValorFirestore>; updateTime: string };

const texto = (valor: ValorFirestore | undefined) => valor?.stringValue || '';

// LEE VARIOS DOCUMENTOS DE UNA SOLA VEZ. DEVUELVE { 'Coleccion/id': documento | null }
const leerDocumentos = async (env: Env, rutas: string[]) => {
  const token = await obtenerTokenGoogle(env);
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const respuesta = await fetch(`${urlDocumentos(env)}:batchGet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: rutas.map(ruta => `${nombreBase}/${ruta}`) }),
  });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);

  const resultado: Record<string, DocumentoLeido | null> = Object.fromEntries(rutas.map(ruta => [ruta, null]));
  const items = (await respuesta.json()) as { found?: { name: string; fields?: DocumentoLeido['fields']; updateTime: string } }[];
  for (const item of items) {
    if (!item.found) continue;
    const ruta = item.found.name.slice(nombreBase.length + 1);
    resultado[ruta] = { fields: item.found.fields || {}, updateTime: item.found.updateTime };
  }
  return resultado;
};

// APLICA VARIAS ESCRITURAS JUNTAS: O SE GUARDAN TODAS, O NINGUNA.
// DEVUELVE false SI UNA CONDICIÓN (currentDocument) YA NO SE CUMPLE, PARA QUE SE PUEDA REINTENTAR.
const confirmarEscrituras = async (env: Env, writes: Record<string, unknown>[]) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (respuesta.ok) return true;

  const detalle = await respuesta.text();
  if (detalle.includes('FAILED_PRECONDITION') || detalle.includes('ALREADY_EXISTS')) return false;
  throw new Error(`Firestore respondió ${respuesta.status}: ${detalle}`);
};

// CONVIERTE VALORES DE JAVASCRIPT AL FORMATO QUE ESPERA LA API REST DE FIRESTORE
const aValorFirestore = (valor: unknown): Record<string, unknown> => {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };
  if (typeof valor === 'string') return { stringValue: valor };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (typeof valor === 'number') return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(aValorFirestore) } };
  if (typeof valor === 'object') return { mapValue: { fields: aCamposFirestore(valor as Record<string, unknown>) } };
  throw new Error(`Tipo no soportado para Firestore: ${typeof valor}`);
};

const aCamposFirestore = (datos: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(datos).map(([clave, valor]) => [clave, aValorFirestore(valor)]));
