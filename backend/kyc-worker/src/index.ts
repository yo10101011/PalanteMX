// Worker de verificación de identidad (KYC) de PalanteMX.
// Aquí viven las llaves de OCR.space, Face++ y la cuenta de servicio de Firebase, fuera de la app, donde nadie puede leerlas.
// Rutas:
//   POST /verificar-identidad  -> verifica INE + selfie y, si se aprueba, CREA el perfil en Firestore (solo usuarios con sesión).
//   POST /iniciar-sesion       -> login con usuario o teléfono + contraseña; devuelve un pase de Firebase, NUNCA el correo.
//   POST /resenas              -> deja una reseña (solo entre quienes trabajaron juntos, una vez).
//   POST /firma-subida         -> da permiso firmado para subir UNA foto/archivo a Cloudinary (solo usuarios con sesión).
//   POST /eliminar-cuenta      -> borra por completo una cuenta (la propia, o cualquiera si quien llama es admin).
//   POST /contratos            -> todos los pasos de un contrato (proponer, postular, aceptar, terminar, cancelar,
//                                 revisar la bitácora, reportar un problema...).
//   POST /reportes             -> el admin resuelve un reporte y se les avisa a las dos partes.
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
    if (request.method === 'POST' && url.pathname === '/eliminar-cuenta') return eliminarCuenta(request, env);
    if (request.method === 'POST' && url.pathname === '/contratos') return gestionarContrato(request, env);
    if (request.method === 'POST' && url.pathname === '/reportes') return resolverReporte(request, env);
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
// SOLO SE PUEDE CALIFICAR A ALGUIEN CON QUIEN SE TUVO UN CONTRATO YA TERMINADO (FINALIZADO, O CANCELADO/SUSPENDIDO),
// UNA SOLA VEZ, Y EL PROMEDIO LO CALCULA EL SERVIDOR. LAS REGLAS DE FIRESTORE YA NO DEJAN QUE LA APP TOQUE ESTOS CAMPOS.
// =========================================================================

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
        return responder(403, { error: 'Solo puedes calificar a alguien cuando su obra juntos ya se finalizó o se canceló.' });
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

// ¿HAY UN CONTRATO YA TERMINADO ENTRE ESTAS DOS PERSONAS? (UNA ES EL TRABAJADOR Y LA OTRA EL CONTRATISTA)
const trabajaronJuntos = async (env: Env, idA: string, idB: string) => {
  for (const [trabajador, contratista] of [[idA, idB], [idB, idA]]) {
    const contratos = await consultarDocumentos(env, 'Postulaciones', [
      ['id_trabajador', 'EQUAL', trabajador],
      ['estado', 'IN', ESTADOS_CALIFICABLES],
    ]);
    if (contratos.some(c => texto(c.fields.id_contratista) === contratista)) return true;

    // LOS CONTRATOS VIEJOS DE LA BOLSA DE TRABAJO NO TRAEN id_contratista: SE BUSCA EN SU VACANTE
    const vacantesPorRevisar = contratos.filter(c => !texto(c.fields.id_contratista) && texto(c.fields.id_vacante)).map(c => `Vacantes/${texto(c.fields.id_vacante)}`);
    if (vacantesPorRevisar.length > 0) {
      const vacantes = await leerDocumentos(env, vacantesPorRevisar);
      if (Object.values(vacantes).some(v => v && texto(v.fields.id_contratista) === contratista)) return true;
    }
  }
  return false;
};

// =========================================================================
// RUTA 6: CONTRATOS (LA COLECCIÓN SE SIGUE LLAMANDO "Postulaciones" PARA NO PERDER LOS DATOS QUE YA EXISTEN)
// TODO CAMBIO DE ESTADO PASA POR AQUÍ, PORQUE TOCA DOCUMENTOS DE LAS DOS PARTES (P. EJ. EL CUPO DE LA VACANTE
// DEL CONTRATISTA CUANDO EL TRABAJADOR ACEPTA) Y HAY QUE REVISAR QUIÉN PUEDE HACER CADA PASO.
//
//   Pendiente ──┐ (el trabajador se postuló: espera al contratista)
//   Propuesta ──┼─► Aceptada (En Proceso) ─► Por confirmar fin ─► Finalizada
//               │            │                      │
//               └─► Rechazada └──── cancelar ───────┴─► Suspendida ─► (admin) Cancelada, o reactivada
// =========================================================================
const ESTADOS = {
  PENDIENTE: 'Pendiente',
  PROPUESTA: 'Propuesta',
  ACTIVA: 'Aceptada (En Proceso)',
  POR_CONFIRMAR_FIN: 'Por confirmar fin',
  FINALIZADA: 'Finalizada',
  RECHAZADA: 'Rechazada',
  SUSPENDIDA: 'Suspendida',
  CANCELADA: 'Cancelada',
};
// UN CONTRATO "ABIERTO" BLOQUEA QUE SE CREE OTRO PARA LA MISMA VACANTE Y EL MISMO TRABAJADOR
const ESTADOS_ABIERTOS = [ESTADOS.PENDIENTE, ESTADOS.PROPUESTA, ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.SUSPENDIDA];
const ESTADOS_CALIFICABLES = [ESTADOS.FINALIZADA, ESTADOS.SUSPENDIDA, ESTADOS.CANCELADA];

const gestionarContrato = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });
  const uid = sesion.uid;

  let datos: DatosContrato;
  try {
    datos = await request.json();
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }

  try {
    const perfiles = await leerDocumentos(env, [`Usuarios/${uid}`, `Contratistas/${uid}`, `Administradores/${uid}`]);
    const esAdmin = !!perfiles[`Administradores/${uid}`];
    const miPerfil = perfiles[`Usuarios/${uid}`] || perfiles[`Contratistas/${uid}`];
    if (!esAdmin && !miPerfil) return responder(403, { error: 'Tu cuenta no tiene un perfil verificado.' });
    if (miPerfil && texto(miPerfil.fields.estado_cuenta) === 'Bloqueada') return responder(403, { error: 'Tu cuenta está bloqueada.' });

    switch (datos.accion) {
      case 'proponer': return await crearContrato(env, uid, 'contratista', datos.id_vacante, datos.id_trabajador);
      case 'postular': return await crearContrato(env, uid, 'trabajador', datos.id_vacante, uid);
      default: break;
    }

    // EL RESTO DE ACCIONES SON SOBRE UN CONTRATO QUE YA EXISTE
    if (!textoValido(datos.id_contrato, 128)) return responder(400, { error: 'Falta el contrato.' });
    const rutaContrato = `Postulaciones/${datos.id_contrato}`;

    // HASTA 2 INTENTOS: SI ALGUIEN CAMBIÓ EL CONTRATO O LA VACANTE AL MISMO TIEMPO, SE VUELVE A LEER
    for (let intento = 0; intento < 2; intento++) {
      const contrato = (await leerDocumentos(env, [rutaContrato]))[rutaContrato];
      if (!contrato) return responder(404, { error: 'No se encontró este contrato.' });

      const estado = texto(contrato.fields.estado);
      const idTrabajador = texto(contrato.fields.id_trabajador);
      const idVacante = texto(contrato.fields.id_vacante);
      const vacante = idVacante ? (await leerDocumentos(env, [`Vacantes/${idVacante}`]))[`Vacantes/${idVacante}`] : null;
      // LOS CONTRATOS VIEJOS NO TRAEN id_contratista: SE TOMA DE LA VACANTE
      const idContratista = texto(contrato.fields.id_contratista) || (vacante ? texto(vacante.fields.id_contratista) : '');
      const soyTrabajador = uid === idTrabajador;
      const soyContratista = uid === idContratista;

      const resultado = await aplicarAccion(env, {
        accion: datos.accion, motivo: datos.motivo, datos, uid, esAdmin, soyTrabajador, soyContratista,
        rutaContrato, contrato, estado, idTrabajador, idContratista, idVacante, vacante,
      });
      if (resultado) return resultado;
    }
    return responder(409, { error: 'El contrato cambió mientras lo actualizabas. Intenta de nuevo.' });
  } catch (error) {
    console.log('Error en contrato', error);
    return responder(502, { error: 'No se pudo actualizar el contrato. Intenta más tarde.' });
  }
};

// CREA UN CONTRATO NUEVO: "Propuesta" SI LO INICIA EL CONTRATISTA, "Pendiente" SI SE POSTULA EL TRABAJADOR
const crearContrato = async (env: Env, uid: string, quienInicia: 'contratista' | 'trabajador', idVacante: unknown, idTrabajador: unknown) => {
  if (!textoValido(idVacante, 128) || !textoValido(idTrabajador, 128)) return responder(400, { error: 'Faltan datos de la vacante o del trabajador.' });

  const docs = await leerDocumentos(env, [`Vacantes/${idVacante}`, `Usuarios/${idTrabajador}`]);
  const vacante = docs[`Vacantes/${idVacante}`];
  const trabajador = docs[`Usuarios/${idTrabajador}`];
  if (!vacante) return responder(404, { error: 'Esa vacante ya no existe.' });
  if (!trabajador) return responder(404, { error: 'Ese trabajador no existe.' });

  const idContratista = texto(vacante.fields.id_contratista);
  if (quienInicia === 'contratista' && idContratista !== uid) return responder(403, { error: 'Solo puedes proponer obras de tus propias vacantes.' });
  if (texto(vacante.fields.estado) !== 'Activa') return responder(409, { error: 'Esa vacante ya está cerrada.' });
  if (numero(vacante.fields.cupo_actual) >= Math.max(numero(vacante.fields.cupo_total), 1)) {
    return responder(409, { error: 'Esa vacante ya tiene todos los trabajadores que necesita.' });
  }

  const abiertos = await consultarDocumentos(env, 'Postulaciones', [
    ['id_vacante', 'EQUAL', idVacante],
    ['id_trabajador', 'EQUAL', idTrabajador],
    ['estado', 'IN', ESTADOS_ABIERTOS],
  ]);
  if (abiertos.length > 0) {
    return responder(409, { error: quienInicia === 'trabajador'
      ? 'Ya tienes una solicitud o una obra abierta en esta vacante. Revísala en "Mis Postulaciones" u "Obras".'
      : 'Ya hay una propuesta u obra abierta con este trabajador en esa vacante.' });
  }

  const ahora = new Date();
  const idContrato = crypto.randomUUID().replace(/-/g, '');
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  await confirmarEscrituras(env, [{
    update: {
      name: `${nombreBase}/Postulaciones/${idContrato}`,
      fields: aCamposFirestore({
        id_vacante: idVacante,
        titulo_vacante: texto(vacante.fields.titulo),
        id_trabajador: idTrabajador,
        nombre_trabajador: `${texto(trabajador.fields.nombre)} ${texto(trabajador.fields.apellidos)}`.trim(),
        id_contratista: idContratista,
        contratista: texto(vacante.fields.contratista),
        // RESUMEN DE LA VACANTE PARA DIBUJAR LAS TARJETAS SIN TENER QUE LEERLA
        vacante: {
          titulo: texto(vacante.fields.titulo),
          contratista: texto(vacante.fields.contratista),
          ubicacion: texto(vacante.fields.ubicacion),
          pago: texto(vacante.fields.pago),
          horario: texto(vacante.fields.horario),
          descripcion: texto(vacante.fields.descripcion),
          foto_trabajo: texto(vacante.fields.foto_trabajo),
          foto_contratista: texto(vacante.fields.foto_contratista),
        },
        estado: quienInicia === 'contratista' ? ESTADOS.PROPUESTA : ESTADOS.PENDIENTE,
        origen: quienInicia,
        fecha_postulacion: ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }),
        timestamp: ahora.getTime(),
      }),
    },
    currentDocument: { exists: false },
  }]);
  return responder(200, { id_contrato: idContrato, estado: quienInicia === 'contratista' ? ESTADOS.PROPUESTA : ESTADOS.PENDIENTE });
};

type DatosContrato = {
  accion?: unknown; id_contrato?: unknown; id_vacante?: unknown; id_trabajador?: unknown; motivo?: unknown;
  id_entrada?: unknown; veredicto?: unknown; nota?: unknown; categoria?: unknown;
};

type ContextoAccion = {
  accion: unknown; motivo: unknown; datos: DatosContrato; uid: string; esAdmin: boolean; soyTrabajador: boolean; soyContratista: boolean;
  rutaContrato: string; contrato: DocumentoLeido; estado: string;
  idTrabajador: string; idContratista: string; idVacante: string; vacante: DocumentoLeido | null;
};

// APLICA UNA ACCIÓN. DEVUELVE LA RESPUESTA, O null SI HAY QUE REINTENTAR (ALGUIEN CAMBIÓ LOS DATOS AL MISMO TIEMPO)
const aplicarAccion = async (env: Env, c: ContextoAccion): Promise<Response | null> => {
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const ahora = new Date();
  const prohibido = (mensaje: string) => responder(403, { error: mensaje });
  const noSePuede = () => responder(409, { error: `No se puede hacer eso: el contrato está en "${c.estado}".` });

  // CAMBIA CAMPOS DEL CONTRATO, SOLO SI NADIE LO MODIFICÓ DESDE QUE LO LEÍMOS
  const cambioContrato = (campos: Record<string, unknown>) => ({
    update: { name: `${nombreBase}/${c.rutaContrato}`, fields: aCamposFirestore(campos) },
    updateMask: { fieldPaths: Object.keys(campos) },
    currentDocument: { updateTime: c.contrato.updateTime },
  });
  const guardar = async (writes: Record<string, unknown>[], nuevoEstado: string) =>
    (await confirmarEscrituras(env, writes)) ? responder(200, { estado: nuevoEstado }) : null;
  const tituloObra = texto(c.contrato.fields.titulo_vacante);
  const idContrato = c.rutaContrato.split('/')[1];
  // REPORTE NUEVO PARA EL ADMIN SOBRE ESTA OBRA, LEVANTADO POR UNA DE LAS DOS PARTES CONTRA LA OTRA
  const nuevoReporte = (idQueja: string, nombres: NombresPartes, campos: Record<string, unknown>) => ({
    update: {
      name: `${nombreBase}/Quejas_Soporte/${idQueja}`,
      fields: aCamposFirestore({
        id_reportante: c.uid,
        nombre_reportante: c.soyTrabajador ? nombres.trabajador : nombres.contratista,
        rol_reportante: c.soyTrabajador ? 'Trabajador' : 'Contratista',
        id_acusado: c.soyTrabajador ? c.idContratista : c.idTrabajador,
        acusado: c.soyTrabajador ? nombres.contratista : nombres.trabajador,
        rol_acusado: c.soyTrabajador ? 'Contratista' : 'Trabajador',
        id_contrato: idContrato,
        titulo_obra: tituloObra,
        estado: 'En Revisión Administrativa',
        fecha_reporte: ahora.toISOString(),
        ...campos,
      }),
    },
    currentDocument: { exists: false },
  });
  const otraParte = c.soyTrabajador ? c.idContratista : c.idTrabajador;

  switch (c.accion) {
    // ---- LA PARTE QUE ESPERA ACEPTA: EL TRABAJADOR UNA PROPUESTA, O EL CONTRATISTA UNA SOLICITUD ----
    case 'aceptar': {
      if (c.estado === ESTADOS.PROPUESTA && !c.soyTrabajador) return prohibido('Esta propuesta la tiene que aceptar el trabajador.');
      if (c.estado === ESTADOS.PENDIENTE && !c.soyContratista) return prohibido('Esta solicitud la tiene que aceptar el contratista.');
      if (c.estado !== ESTADOS.PROPUESTA && c.estado !== ESTADOS.PENDIENTE) return noSePuede();
      if (!c.vacante) return responder(404, { error: 'La vacante de este contrato ya no existe.' });

      const cupoActual = numero(c.vacante.fields.cupo_actual);
      const cupoTotal = Math.max(numero(c.vacante.fields.cupo_total), 1);
      if (texto(c.vacante.fields.estado) !== 'Activa' || cupoActual >= cupoTotal) {
        return responder(409, { error: 'La vacante ya está cerrada o ya tiene todos los trabajadores que necesita.' });
      }
      const cupoNuevo = cupoActual + 1;
      return guardar([
        cambioContrato({ estado: ESTADOS.ACTIVA, id_contratista: c.idContratista, fecha_inicio: ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }), timestamp_inicio: ahora.getTime() }),
        // EL CUPO SOLO SE OCUPA CUANDO LOS DOS ACEPTARON. SI SE LLENA, LA VACANTE SE CIERRA
        {
          update: { name: `${nombreBase}/Vacantes/${c.idVacante}`, fields: aCamposFirestore({ cupo_actual: cupoNuevo, estado: cupoNuevo >= cupoTotal ? 'Cerrada' : 'Activa' }) },
          updateMask: { fieldPaths: ['cupo_actual', 'estado'] },
          currentDocument: { updateTime: c.vacante.updateTime },
        },
      ], ESTADOS.ACTIVA);
    }

    // ---- CUALQUIERA DE LOS DOS RECHAZA (O RETIRA) ANTES DE QUE SE CIERRE EL TRATO ----
    case 'rechazar': {
      if (!c.soyTrabajador && !c.soyContratista) return prohibido('Este contrato no es tuyo.');
      if (c.estado !== ESTADOS.PROPUESTA && c.estado !== ESTADOS.PENDIENTE) return noSePuede();
      return guardar([cambioContrato({ estado: ESTADOS.RECHAZADA, rechazado_por: c.uid })], ESTADOS.RECHAZADA);
    }

    // ---- TERMINAR: EL CONTRATISTA LA MARCA COMO TERMINADA Y EL TRABAJADOR CONFIRMA ----
    case 'solicitar_fin': {
      if (!c.soyContratista) return prohibido('Solo el contratista marca la obra como terminada; después el trabajador confirma.');
      if (c.estado !== ESTADOS.ACTIVA) return noSePuede();
      return guardar([cambioContrato({ estado: ESTADOS.POR_CONFIRMAR_FIN })], ESTADOS.POR_CONFIRMAR_FIN);
    }
    case 'confirmar_fin': {
      if (!c.soyTrabajador) return prohibido('El trabajador es quien confirma que la obra terminó.');
      if (c.estado !== ESTADOS.POR_CONFIRMAR_FIN) return noSePuede();
      const fechaFin = ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
      const writes: Record<string, unknown>[] = [cambioContrato({ estado: ESTADOS.FINALIZADA, fecha_fin: fechaFin, timestamp_fin: ahora.getTime() })];

      // LA OBRA TERMINADA SE AGREGA AL PERFIL PÚBLICO DEL TRABAJADOR (obras_realizadas), PARA QUE CUALQUIER CONTRATISTA
      // LA VEA EN SU PERFIL. LOS CONTRATOS SON PRIVADOS (SOLO LAS DOS PARTES LOS LEEN), POR ESO SE COPIA UN RESUMEN.
      const rutaTrabajador = `Usuarios/${c.idTrabajador}`;
      if ((await leerDocumentos(env, [rutaTrabajador]))[rutaTrabajador]) {
        const resumen = c.contrato.fields.vacante?.mapValue?.fields || {};
        const obra = {
          id_contrato: idContrato,
          titulo: tituloObra,
          contratista: texto(c.contrato.fields.contratista) || texto(resumen.contratista),
          ubicacion: texto(resumen.ubicacion),
          pago: texto(resumen.pago),
          foto_trabajo: texto(resumen.foto_trabajo) || (c.vacante ? texto(c.vacante.fields.foto_trabajo) : ''),
          fecha_inicio: texto(c.contrato.fields.fecha_inicio),
          fecha_fin: fechaFin,
        };
        writes.push({ transform: { document: `${nombreBase}/${rutaTrabajador}`, fieldTransforms: [{ fieldPath: 'obras_realizadas', appendMissingElements: { values: [aValorFirestore(obra)] } }] } });
      }
      return guardar(writes, ESTADOS.FINALIZADA);
    }
    case 'rechazar_fin': {
      if (!c.soyTrabajador) return prohibido('Solo el trabajador puede decir que la obra aún no termina.');
      if (c.estado !== ESTADOS.POR_CONFIRMAR_FIN) return noSePuede();
      return guardar([cambioContrato({ estado: ESTADOS.ACTIVA })], ESTADOS.ACTIVA);
    }

    // ---- CANCELAR: CUALQUIERA DE LOS DOS. SE LEVANTA UN REPORTE AUTOMÁTICO Y LA OBRA QUEDA SUSPENDIDA ----
    case 'cancelar': {
      if (!c.soyTrabajador && !c.soyContratista) return prohibido('Este contrato no es tuyo.');
      if (c.estado !== ESTADOS.ACTIVA && c.estado !== ESTADOS.POR_CONFIRMAR_FIN) return noSePuede();
      if (!textoValido(c.motivo, 1000)) return responder(400, { error: 'Explica por qué cancelas la obra.' });

      const nombres = await nombresDePartes(env, c.idTrabajador, c.idContratista);
      const idQueja = crypto.randomUUID().replace(/-/g, '');
      const quienCancela = c.soyTrabajador ? nombres.trabajador : nombres.contratista;

      return guardar([
        cambioContrato({ estado: ESTADOS.SUSPENDIDA, cancelado_por: c.uid, motivo_cancelacion: c.motivo.trim(), id_queja: idQueja, timestamp_cancelacion: ahora.getTime() }),
        nuevoReporte(idQueja, nombres, { tipo: 'cancelacion', motivo: 'Cancelación de obra', descripcion: c.motivo.trim() }),
        nuevaNotificacion(env, otraParte, 'Obra suspendida', `${quienCancela} canceló la obra "${tituloObra}". Queda suspendida mientras el administrador revisa el caso. Te avisaremos su decisión.`),
      ], ESTADOS.SUSPENDIDA);
    }

    // ---- EL CONTRATISTA REVISA UN DÍA DE LA BITÁCORA: CONFIRMA QUE EL TRABAJADOR SÍ LO HIZO, O LO RECHAZA ----
    // SI LO RECHAZA SE LEVANTA UN REPORTE: EL ADMIN DECIDE SI EL DÍA CUENTA O SE DESCUENTA.
    case 'revisar_bitacora': {
      if (!c.soyContratista) return prohibido('Solo el contratista revisa la bitácora del trabajador.');
      if (![ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.SUSPENDIDA, ESTADOS.FINALIZADA].includes(c.estado)) return noSePuede();
      const idEntrada = c.datos.id_entrada;
      if (!textoValido(idEntrada, 128) || !/^[\w-]+$/.test(idEntrada)) return responder(400, { error: 'Falta el día de la bitácora.' });

      const rutaEntrada = `${c.rutaContrato}/Bitacora/${idEntrada}`;
      const entrada = (await leerDocumentos(env, [rutaEntrada]))[rutaEntrada];
      if (!entrada) return responder(404, { error: 'No se encontró ese día en la bitácora.' });
      const revision = texto(entrada.fields.revision);
      if (revision && revision !== REVISION.PENDIENTE) return responder(409, { error: 'Ese día ya fue revisado.' });

      const cambioEntrada = (campos: Record<string, unknown>) => ({
        update: { name: `${nombreBase}/${rutaEntrada}`, fields: aCamposFirestore(campos) },
        updateMask: { fieldPaths: Object.keys(campos) },
        currentDocument: { updateTime: entrada.updateTime },
      });

      if (c.datos.veredicto === 'confirmar') {
        return guardar([cambioEntrada({ revision: REVISION.CONFIRMADA, fecha_revision: ahora.toISOString() })], c.estado);
      }
      if (c.datos.veredicto !== 'rechazar') return responder(400, { error: 'Veredicto inválido.' });
      if (!textoValido(c.motivo, 1000)) return responder(400, { error: 'Explica qué no es cierto de lo que escribió el trabajador.' });

      const nombres = await nombresDePartes(env, c.idTrabajador, c.idContratista);
      const idQueja = crypto.randomUUID().replace(/-/g, '');
      const fechaDia = texto(entrada.fields.fecha);
      return guardar([
        cambioEntrada({ revision: REVISION.EN_DISPUTA, motivo_rechazo: c.motivo.trim(), id_queja: idQueja, fecha_revision: ahora.toISOString() }),
        nuevoReporte(idQueja, nombres, {
          tipo: 'bitacora',
          motivo: 'Bitácora rechazada',
          descripcion: `Día ${fechaDia}. El contratista dice: ${c.motivo.trim()}\n\nEl trabajador había escrito: "${texto(entrada.fields.nota)}"`,
          foto_evidencia: texto(entrada.fields.evidencia),
          id_entrada: idEntrada,
          fecha_dia: fechaDia,
        }),
        nuevaNotificacion(env, c.idTrabajador, 'Bitácora rechazada', `${nombres.contratista} rechazó tu bitácora del ${fechaDia} en "${tituloObra}": "${c.motivo.trim()}". El administrador decidirá si ese día cuenta o se descuenta.`),
      ], c.estado);
    }

    // ---- CUALQUIERA DE LOS DOS REPORTA UN INCUMPLIMIENTO SIN CANCELAR LA OBRA (P. EJ. NO LLEGÓ EL MATERIAL) ----
    case 'reportar_problema': {
      if (!c.soyTrabajador && !c.soyContratista) return prohibido('Este contrato no es tuyo.');
      if (c.estado !== ESTADOS.ACTIVA && c.estado !== ESTADOS.POR_CONFIRMAR_FIN) return noSePuede();
      if (!textoValido(c.motivo, 1000)) return responder(400, { error: 'Explica qué pasó.' });
      const categoria = textoValido(c.datos.categoria, 60) ? c.datos.categoria.trim() : 'Incumplimiento';

      const nombres = await nombresDePartes(env, c.idTrabajador, c.idContratista);
      const quienReporta = c.soyTrabajador ? nombres.trabajador : nombres.contratista;
      return guardar([
        nuevoReporte(crypto.randomUUID().replace(/-/g, ''), nombres, { tipo: 'incumplimiento', motivo: categoria, descripcion: c.motivo.trim() }),
        nuevaNotificacion(env, otraParte, 'Reporte sobre tu obra', `${quienReporta} levantó un reporte en "${tituloObra}" (${categoria}): "${c.motivo.trim()}". El administrador lo revisará y te avisaremos.`),
      ], c.estado);
    }

    // ---- EL ADMIN DECIDE QUÉ PASA CON UNA OBRA SUSPENDIDA (SE CIERRA SU REPORTE Y SE LES AVISA A LOS DOS) ----
    case 'admin_reactivar':
    case 'admin_cancelar': {
      if (!c.esAdmin) return prohibido('Solo un administrador puede decidir sobre una obra suspendida.');
      if (c.estado !== ESTADOS.SUSPENDIDA) return noSePuede();

      const cancelar = c.accion === 'admin_cancelar';
      const nota = textoValido(c.datos.nota, 1000) ? c.datos.nota.trim() : '';
      const aviso = `${cancelar ? `La obra "${tituloObra}" quedó cancelada definitivamente. Ya pueden calificarse.` : `La obra "${tituloObra}" fue reactivada: sigue en curso y ya se puede llenar la bitácora.`}${nota ? `\n\nNota del administrador: ${nota}` : ''}`;
      const writes: Record<string, unknown>[] = [
        cambioContrato({ estado: cancelar ? ESTADOS.CANCELADA : ESTADOS.ACTIVA, decidido_por_admin: c.uid }),
        nuevaNotificacion(env, c.idTrabajador, 'Decisión del administrador', aviso),
        nuevaNotificacion(env, c.idContratista, 'Decisión del administrador', aviso),
      ];
      // AL CANCELAR DEFINITIVAMENTE, SE LIBERA EL LUGAR QUE OCUPABA EN LA VACANTE
      if (cancelar && c.vacante) {
        writes.push({
          update: { name: `${nombreBase}/Vacantes/${c.idVacante}`, fields: aCamposFirestore({ cupo_actual: Math.max(numero(c.vacante.fields.cupo_actual) - 1, 0) }) },
          updateMask: { fieldPaths: ['cupo_actual'] },
          currentDocument: { updateTime: c.vacante.updateTime },
        });
      }
      const idQueja = texto(c.contrato.fields.id_queja);
      if (idQueja) {
        writes.push({
          update: { name: `${nombreBase}/Quejas_Soporte/${idQueja}`, fields: aCamposFirestore({ estado: 'Resuelta', fecha_resolucion: ahora.toISOString(), resolucion: cancelar ? 'Obra cancelada definitivamente' : 'Obra reactivada', nota_admin: nota }) },
          updateMask: { fieldPaths: ['estado', 'fecha_resolucion', 'resolucion', 'nota_admin'] },
        });
      }
      return guardar(writes, cancelar ? ESTADOS.CANCELADA : ESTADOS.ACTIVA);
    }

    default:
      return responder(400, { error: 'Acción desconocida.' });
  }
};

// REVISIÓN DE CADA DÍA DE LA BITÁCORA (CAMPO "revision" DE Postulaciones/{id}/Bitacora/{día})
const REVISION = {
  PENDIENTE: 'Pendiente',     // EL CONTRATISTA AÚN NO LA REVISA
  CONFIRMADA: 'Confirmada',   // EL CONTRATISTA (O EL ADMIN) CONFIRMÓ QUE SÍ SE TRABAJÓ
  EN_DISPUTA: 'En disputa',   // EL CONTRATISTA LA RECHAZÓ: EL ADMIN DECIDE
  DESCONTADA: 'Descontada',   // EL ADMIN LE DIO LA RAZÓN AL CONTRATISTA: ESE DÍA NO CUENTA
};

type NombresPartes = { trabajador: string; contratista: string };

const nombresDePartes = async (env: Env, idTrabajador: string, idContratista: string): Promise<NombresPartes> => {
  const perfiles = await leerDocumentos(env, [`Usuarios/${idTrabajador}`, `Contratistas/${idContratista}`]);
  const nombreDe = (ruta: string) => {
    const perfil = perfiles[ruta];
    return perfil ? `${texto(perfil.fields.nombre)} ${texto(perfil.fields.apellidos)}`.trim() : 'Usuario';
  };
  return { trabajador: nombreDe(`Usuarios/${idTrabajador}`), contratista: nombreDe(`Contratistas/${idContratista}`) };
};

// AVISO PARA UN USUARIO (COLECCIÓN Notificaciones). LA APP LOS MUESTRA AL ENTRAR Y LOS MARCA COMO LEÍDOS.
const nuevaNotificacion = (env: Env, idUsuario: string, titulo: string, mensaje: string) => ({
  update: {
    name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/Notificaciones/${crypto.randomUUID().replace(/-/g, '')}`,
    fields: aCamposFirestore({ id_usuario: idUsuario, titulo, mensaje, leida: false, fecha: new Date().toISOString(), timestamp: Date.now() }),
  },
  currentDocument: { exists: false },
});

// =========================================================================
// RUTA 7: EL ADMIN RESUELVE UN REPORTE Y SE LES AVISA A QUIEN REPORTÓ Y A QUIEN FUE REPORTADO
// (LAS CANCELACIONES DE OBRA NO VAN AQUÍ: SE RESUELVEN CON admin_reactivar / admin_cancelar EN /contratos)
//   tipo 'bitacora':  decision 'a_favor_trabajador' (el día cuenta) | 'a_favor_contratista' (el día se descuenta)
//   cualquier otro:   decision 'procede' (tiene razón quien reportó) | 'no_procede'
// =========================================================================
const resolverReporte = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });

  let datos: { id_queja?: unknown; decision?: unknown; nota?: unknown };
  try {
    datos = await request.json();
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }
  if (!textoValido(datos.id_queja, 128)) return responder(400, { error: 'Falta el reporte.' });
  if (!textoValido(datos.nota, 1000)) return responder(400, { error: 'Escribe tu decisión para que las dos partes la lean.' });
  const nota = datos.nota.trim();

  try {
    const rutaQueja = `Quejas_Soporte/${datos.id_queja}`;
    const docs = await leerDocumentos(env, [`Administradores/${sesion.uid}`, rutaQueja, 'Sistema/AdminProfile']);
    if (!docs[`Administradores/${sesion.uid}`]) return responder(403, { error: 'Solo un administrador puede resolver reportes.' });
    const queja = docs[rutaQueja];
    if (!queja) return responder(404, { error: 'No se encontró ese reporte.' });
    if (texto(queja.fields.estado) === 'Resuelta') return responder(409, { error: 'Ese reporte ya fue resuelto.' });

    const tipo = texto(queja.fields.tipo);
    const idContrato = texto(queja.fields.id_contrato);
    if (tipo === 'cancelacion' || (!tipo && idContrato && texto(queja.fields.motivo) === 'Cancelación de obra')) {
      return responder(400, { error: 'Una cancelación se resuelve reactivando o cancelando la obra.' });
    }

    const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const writes: Record<string, unknown>[] = [];
    let resolucion: string;
    if (tipo === 'bitacora') {
      if (datos.decision !== 'a_favor_trabajador' && datos.decision !== 'a_favor_contratista') return responder(400, { error: 'Decisión inválida.' });
      const aFavorTrabajador = datos.decision === 'a_favor_trabajador';
      resolucion = aFavorTrabajador
        ? `El día ${texto(queja.fields.fecha_dia)} SÍ cuenta como trabajado.`
        : `El día ${texto(queja.fields.fecha_dia)} NO cuenta: se descuenta.`;
      writes.push({
        update: {
          name: `${nombreBase}/Postulaciones/${idContrato}/Bitacora/${texto(queja.fields.id_entrada)}`,
          fields: aCamposFirestore({ revision: aFavorTrabajador ? REVISION.CONFIRMADA : REVISION.DESCONTADA, nota_admin: nota }),
        },
        updateMask: { fieldPaths: ['revision', 'nota_admin'] },
        currentDocument: { exists: true },
      });
    } else {
      if (datos.decision !== 'procede' && datos.decision !== 'no_procede') return responder(400, { error: 'Decisión inválida.' });
      resolucion = datos.decision === 'procede' ? 'El administrador le dio la razón a quien reportó.' : 'El administrador determinó que el reporte no procede.';
    }

    const admin = docs['Sistema/AdminProfile'];
    writes.push({
      update: {
        name: `${nombreBase}/${rutaQueja}`,
        fields: aCamposFirestore({ estado: 'Resuelta', resolucion, nota_admin: nota, fecha_resolucion: new Date().toISOString(), atendida_por: (admin && texto(admin.fields.nombre)) || 'Administrador' }),
      },
      updateMask: { fieldPaths: ['estado', 'resolucion', 'nota_admin', 'fecha_resolucion', 'atendida_por'] },
      currentDocument: { updateTime: queja.updateTime },
    });

    // AVISO A LAS DOS PARTES (LOS REPORTES VIEJOS DEL CHAT PUEDEN TRAER 'Desconocido' EN LUGAR DE UN USUARIO)
    const motivo = texto(queja.fields.motivo);
    const obra = texto(queja.fields.titulo_obra) ? ` en "${texto(queja.fields.titulo_obra)}"` : '';
    const esUsuario = (id: string) => /^[A-Za-z0-9]{10,128}$/.test(id);
    const idReportante = texto(queja.fields.id_reportante);
    const idAcusado = texto(queja.fields.id_acusado);
    if (esUsuario(idReportante)) writes.push(nuevaNotificacion(env, idReportante, 'Tu reporte fue resuelto', `Reporte "${motivo}"${obra}: ${resolucion}\n\nNota del administrador: ${nota}`));
    if (esUsuario(idAcusado)) writes.push(nuevaNotificacion(env, idAcusado, 'Se resolvió un reporte sobre ti', `Reporte "${motivo}"${obra}, levantado por ${texto(queja.fields.nombre_reportante) || 'otro usuario'}: ${resolucion}\n\nNota del administrador: ${nota}`));

    if (!(await confirmarEscrituras(env, writes))) return responder(409, { error: 'El reporte cambió mientras lo resolvías. Recarga e intenta de nuevo.' });
    return responder(200, { resuelta: true });
  } catch (error) {
    console.log('Error resolviendo reporte', error);
    return responder(502, { error: 'No se pudo resolver el reporte. Intenta más tarde.' });
  }
};

// CONSULTA DOCUMENTOS CON FILTROS (TODOS DEBEN CUMPLIRSE). op: 'EQUAL' COMPARA CON UN VALOR, 'IN' CON UNA LISTA.
const consultarDocumentos = async (env: Env, coleccion: string, filtros: [string, 'EQUAL' | 'IN', unknown][]) => {
  const token = await obtenerTokenGoogle(env);
  const condiciones = filtros.map(([campo, op, valor]) => ({ fieldFilter: { field: { fieldPath: campo }, op, value: aValorFirestore(valor) } }));
  const respuesta = await fetch(`${urlDocumentos(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        where: condiciones.length === 1 ? condiciones[0] : { compositeFilter: { op: 'AND', filters: condiciones } },
        limit: 50,
      },
    }),
  });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);

  const resultados = (await respuesta.json()) as { document?: { name: string; fields?: DocumentoLeido['fields']; updateTime: string } }[];
  return resultados
    .filter(r => r.document)
    .map(r => ({ id: r.document!.name.split('/').pop() as string, fields: r.document!.fields || {}, updateTime: r.document!.updateTime }));
};

const numero = (valor: ValorFirestore | undefined) => Number(valor?.integerValue ?? valor?.doubleValue ?? 0) || 0;

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

// =========================================================================
// RUTA 5: ELIMINAR UNA CUENTA POR COMPLETO
// DESDE LA APP NO SE PUEDE HACER BIEN: FIREBASE PIDE UN LOGIN RECIENTE PARA BORRAR EL USUARIO, Y SI SE BORRA PRIMERO
// EL USUARIO, LAS REGLAS YA NO DEJAN BORRAR EL PERFIL. AQUÍ SE BORRA TODO JUNTO CON PERMISOS DE ADMINISTRADOR.
// =========================================================================
const eliminarCuenta = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });

  let uidObjetivo = sesion.uid;
  try {
    const datos = (await request.json().catch(() => ({}))) as { uid?: unknown };
    if (datos.uid !== undefined && datos.uid !== sesion.uid) {
      // BORRAR LA CUENTA DE OTRA PERSONA: SOLO UN ADMIN
      if (!textoValido(datos.uid, 128)) return responder(400, { error: 'Cuenta inválida' });
      const admin = await leerDocumentos(env, [`Administradores/${sesion.uid}`]);
      if (!admin[`Administradores/${sesion.uid}`]) return responder(403, { error: 'Solo un administrador puede eliminar otras cuentas.' });
      uidObjetivo = datos.uid;
    }

    // 1. FOTOS PRIVADAS DE LA INE EN CLOUDINARY (SI FALLA, SE REGISTRA PERO NO DETIENE EL BORRADO DE LA CUENTA)
    const verificacion = (await leerDocumentos(env, [`Verificaciones/${uidObjetivo}`]))[`Verificaciones/${uidObjetivo}`];
    for (const campo of ['ine_frente', 'ine_reverso']) {
      const publicId = verificacion?.fields[campo]?.mapValue?.fields?.public_id?.stringValue;
      if (publicId) await borrarDeCloudinary(env, publicId, 'authenticated').catch(error => console.log('No se pudo borrar de Cloudinary', publicId, error));
    }

    // 2. PERFIL Y DATOS PRIVADOS EN FIRESTORE (TODO EN UNA SOLA OPERACIÓN)
    const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    await confirmarEscrituras(env, ['Usuarios', 'Contratistas', 'Verificaciones'].map(coleccion => ({ delete: `${nombreBase}/${coleccion}/${uidObjetivo}` })));

    // 3. EL USUARIO DE FIREBASE AUTHENTICATION
    const token = await obtenerTokenGoogle(env);
    const respuesta = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uidObjetivo }),
    });
    if (!respuesta.ok) throw new Error(`Authentication respondió ${respuesta.status}: ${await respuesta.text()}`);

    return responder(200, { eliminada: true });
  } catch (error) {
    console.log('Error eliminando cuenta', error);
    return responder(502, { error: 'No se pudo eliminar la cuenta. Intenta más tarde.' });
  }
};

const borrarDeCloudinary = async (env: Env, publicId: string, tipo: 'upload' | 'authenticated') => {
  const parametros = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), type: tipo };
  const form = new FormData();
  Object.entries(parametros).forEach(([clave, valor]) => form.append(clave, String(valor)));
  form.append('api_key', env.CLOUDINARY_API_KEY);
  form.append('signature', await firmarParametrosCloudinary(env, parametros));

  const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form });
  if (!respuesta.ok) throw new Error(`Cloudinary respondió ${respuesta.status}: ${await respuesta.text()}`);
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
  // PERMISOS QUE SE PIDEN: LA BASE DE DATOS (FIRESTORE) Y LOS USUARIOS (AUTHENTICATION, PARA ELIMINAR CUENTAS)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit' })
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

type ValorFirestore = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  mapValue?: { fields?: Record<string, ValorFirestore> };
};
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
