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
//   POST /admin-perfiles       -> el admin borra una reseña u obra de un perfil, o recalcula los perfiles.
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
    if (request.method === 'POST' && url.pathname === '/admin-perfiles') return adminPerfiles(request, env);
    return responder(404, { error: 'Ruta no encontrada' });
  },

  // TAREA DIARIA (CRON DE wrangler.toml, GRATIS EN CLOUDFLARE): REVISA OBRAS TERMINADAS SIN PAGO CONFIRMADO
  async scheduled(_evento: unknown, env: Env, ctx: { waitUntil: (promesa: Promise<unknown>) => void }) {
    ctx.waitUntil(revisarPagosPendientes(env).catch(error => console.log('Error revisando pagos pendientes', error)));
    ctx.waitUntil(recordarPagosVencidos(env).catch(error => console.log('Error recordando pagos', error)));
  },
};

// CUÁNTO DEBERÍA HABER PAGADO YA EL CONTRATISTA, SEGÚN CADA CUÁNTO SE PAGA (LA MISMA CUENTA QUE HACE LA APP EN lib/pagos.ts):
//   POR DÍA     -> UN PAGO POR CADA DÍA TRABAJADO EN LA BITÁCORA (SIN LOS DESCONTADOS)
//   POR SEMANA  -> UN PAGO POR CADA SEMANA COMPLETA DESDE QUE EMPEZÓ
//   POR OBRA    -> AL TERMINAR (O LA MITAD AL INICIO SI ASÍ SE ACORDÓ)
// MÁS LOS PAGOS EXTRA QUE ORDENÓ EL ADMIN.
const deudaHastaHoy = (obra: DocumentoLeido, diasTrabajados: number) => {
  const resumen = obra.fields.vacante?.mapValue?.fields || {};
  const textoPago = texto(resumen.pago).toLowerCase();
  const monto = numero(resumen.pago_monto) || Number(textoPago.replace(/[^0-9]/g, '')) || 0;
  const periodo = texto(resumen.pago_periodo) || (textoPago.includes('día') || textoPago.includes('dia') ? 'por día' : textoPago.includes('semana') ? 'por semana' : 'por obra');
  const inicio = numero(obra.fields.timestamp_inicio);
  let debido = 0;
  if (periodo === 'por día') debido = diasTrabajados * monto;
  else if (periodo === 'por semana' && inicio) debido = Math.floor((Date.now() - inicio) / (7 * 24 * 60 * 60 * 1000)) * monto;
  else if (texto(resumen.condiciones?.mapValue?.fields?.cuando_pago) === 'Mitad al inicio y mitad al final') debido = monto / 2;
  const ajustes = (deFirestore(obra.fields.ajustes_pago) as any[]) || [];
  return debido + ajustes.filter(a => a.tipo === 'extra').reduce((s, a) => s + (a.monto || 0), 0);
};

// RECORDATORIO DIARIO AL CONTRATISTA CUANDO YA LE TOCA PAGAR Y NO HA REGISTRADO EL PAGO (UNA VEZ AL DÍA COMO MÁXIMO)
const recordarPagosVencidos = async (env: Env) => {
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
  const enCurso = await consultarDocumentos(env, 'Postulaciones', [['estado', 'IN', [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN]]], 300);
  for (const obra of enCurso) {
    if (texto(obra.fields.ultimo_recordatorio_pago) === hoy) continue;
    const dias = (await listarBitacora(env, `Postulaciones/${obra.id}`)).filter(d => d.fields.asistio?.booleanValue && texto(d.fields.revision) !== REVISION.DESCONTADA).length;
    const debido = deudaHastaHoy(obra, dias);
    const pagado = ((deFirestore(obra.fields.pagos) as any[]) || []).filter(p => p.estado !== ESTADO_PAGO.NO_RECIBIDO).reduce((s, p) => s + (p.monto || 0), 0);
    if (debido <= pagado) continue;
    const titulo = texto(obra.fields.titulo_vacante);
    await confirmarEscrituras(env, [
      {
        update: { name: `${nombreBase}/Postulaciones/${obra.id}`, fields: aCamposFirestore({ ultimo_recordatorio_pago: hoy }) },
        updateMask: { fieldPaths: ['ultimo_recordatorio_pago'] },
        currentDocument: { updateTime: obra.updateTime },
      },
      nuevaNotificacion(env, texto(obra.fields.id_contratista), 'Ya te toca pagar', `En "${titulo}" ya toca pagar $${Math.round(debido - pagado).toLocaleString('es-MX')}. Cuando pagues, registra el pago con su comprobante en la obra → Pagos.`, { tipo: 'contrato', destino: { abrir: 'pagos', id_contrato: obra.id } }),
    ]);
  }
};

// SI A LOS 3 DÍAS DE TERMINAR UNA OBRA EL TRABAJADOR NO HA CONFIRMADO NINGÚN PAGO, SE LEVANTA UN REPORTE AUTOMÁTICO
// (UNA SOLA VEZ POR OBRA) Y SE LES AVISA A LOS DOS. EL ADMIN REVISA Y PUEDE BLOQUEAR AL CONTRATISTA.
const DIAS_PARA_PAGAR = 3;
const revisarPagosPendientes = async (env: Env) => {
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const limite = Date.now() - DIAS_PARA_PAGAR * 24 * 60 * 60 * 1000;
  const terminadas = await consultarDocumentos(env, 'Postulaciones', [['estado', 'EQUAL', ESTADOS.FINALIZADA]], 300);
  for (const obra of terminadas) {
    if (obra.fields.aviso_sin_pago?.booleanValue) continue;
    if (!numero(obra.fields.timestamp_fin) || numero(obra.fields.timestamp_fin) > limite) continue;
    const pagos = (deFirestore(obra.fields.pagos) as any[]) || [];
    if (pagos.some(p => p.estado === ESTADO_PAGO.RECIBIDO)) continue;

    const idTrabajador = texto(obra.fields.id_trabajador);
    const idContratista = texto(obra.fields.id_contratista);
    if (!idTrabajador || !idContratista) continue;
    const nombres = await nombresDePartes(env, idTrabajador, idContratista);
    const titulo = texto(obra.fields.titulo_vacante);
    await confirmarEscrituras(env, [
      {
        update: { name: `${nombreBase}/Postulaciones/${obra.id}`, fields: aCamposFirestore({ aviso_sin_pago: true }) },
        updateMask: { fieldPaths: ['aviso_sin_pago'] },
        updateTransforms: [contadorReportes(1)],
        currentDocument: { updateTime: obra.updateTime },
      },
      {
        update: {
          name: `${nombreBase}/Quejas_Soporte/${crypto.randomUUID().replace(/-/g, '')}`,
          fields: aCamposFirestore({
            tipo: 'pago', motivo: 'Sin pago confirmado',
            descripcion: `La obra terminó el ${texto(obra.fields.fecha_fin)} y, después de ${DIAS_PARA_PAGAR} días, el trabajador no ha confirmado ningún pago. ${pagos.length ? `Hay ${pagos.length} pago(s) registrado(s) sin confirmar o marcados como no recibidos.` : 'El contratista no ha registrado ningún comprobante.'}`,
            id_reportante: idTrabajador, nombre_reportante: `${nombres.trabajador} (reporte automático de PalanteMX)`, rol_reportante: 'Trabajador',
            id_acusado: idContratista, acusado: nombres.contratista, rol_acusado: 'Contratista',
            id_contrato: obra.id, titulo_obra: titulo, estado: 'En Revisión Administrativa', fecha_reporte: new Date().toISOString(),
          }),
        },
        currentDocument: { exists: false },
      },
      nuevaNotificacion(env, idContratista, 'Falta el comprobante de pago', `Ya pasaron ${DIAS_PARA_PAGAR} días desde que terminó "${titulo}" y el trabajador no ha confirmado ningún pago. Sube tu comprobante en la obra → Pagos. El administrador ya fue avisado.`, { destino: { abrir: 'pagos', id_contrato: obra.id }, tipo: 'reporte', importante: true }),
      nuevaNotificacion(env, idTrabajador, 'Revisamos tu pago', `Ya pasaron ${DIAS_PARA_PAGAR} días desde que terminó "${titulo}" y no tienes pagos confirmados. Avisamos al administrador. Si ya te pagaron, confírmalo en la obra → Pagos.`, { destino: { abrir: 'pagos', id_contrato: obra.id }, tipo: 'reporte' }),
    ]);
  }
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
        nuevaNotificacion(env, idEvaluado, 'Te calificaron', `${nombreEvaluador} te calificó con ${'★'.repeat(estrellas)}${'☆'.repeat(5 - estrellas)}: "${comentario.trim()}"`, { destino: { abrir: 'resenas' }, tipo: 'resena' }),
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
  const titulo = texto(vacante.fields.titulo);
  const nombreTrabajador = `${texto(trabajador.fields.nombre)} ${texto(trabajador.fields.apellidos)}`.trim();
  const nombreContratista = texto(vacante.fields.contratista);
  // AVISO A LA PARTE QUE TIENE QUE RESPONDER; AL TOCARLO SE ABRE EL CHAT PARA PLATICAR ANTES DE ACEPTAR
  const aviso = quienInicia === 'contratista'
    ? nuevaNotificacion(env, idTrabajador, 'Nueva propuesta de obra', `${nombreContratista} te propone la obra "${titulo}". Toca aquí para platicar en el chat; cuando estén de acuerdo, acepta el trato ahí mismo.`, { chat_con: { id: idContratista, nombre: nombreContratista, rol: 'Contratista' } })
    : nuevaNotificacion(env, idContratista, 'Nueva solicitud', `${nombreTrabajador} se postuló a tu obra "${titulo}". Toca aquí para platicar en el chat; cuando estén de acuerdo, acepta el trato ahí mismo.`, { chat_con: { id: idTrabajador, nombre: nombreTrabajador, rol: texto(trabajador.fields.oficio_principal) || 'Trabajador' } });
  // LUGAR DE LA OBRA (SI EL CONTRATISTA LO MARCÓ EN EL MAPA) O, SI NO, LA UBICACIÓN DEL CONTRATISTA
  const coordenadas = coordenadasDe(vacante.fields.coordenadas_obra) || coordenadasDe(vacante.fields.coordenadas);
  await confirmarEscrituras(env, [aviso, {
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
          // MONTO Y CADA CUÁNTO (POR DÍA / POR SEMANA / POR OBRA): CON ESTO SE CALCULA CUÁNDO TOCA CADA PAGO
          pago_monto: numero(vacante.fields.pago_monto) || null,
          pago_periodo: texto(vacante.fields.pago_periodo),
          horario: texto(vacante.fields.horario),
          descripcion: texto(vacante.fields.descripcion),
          foto_trabajo: texto(vacante.fields.foto_trabajo),
          foto_contratista: texto(vacante.fields.foto_contratista),
          coordenadas,
          // true = EL CONTRATISTA MARCÓ EL LUGAR EXACTO; false = ES SU UBICACIÓN DE REGISTRO (MENOS PRECISA)
          lugar_exacto: !!coordenadasDe(vacante.fields.coordenadas_obra),
          lugar_texto: texto(vacante.fields.lugar_obra_texto),
          // LO QUE EL CONTRATISTA PROMETIÓ AL PUBLICAR (MATERIAL, HERRAMIENTA, COMIDA...). SE COPIA COMO EVIDENCIA:
          // AUNQUE DESPUÉS EDITE LA VACANTE, EN EL CONTRATO QUEDA LO QUE SE ACORDÓ
          condiciones: deFirestore(vacante.fields.condiciones) || {},
        },
        aceptado_por: [],
        reportes_abiertos: 0,
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
  fotos?: unknown;                                   // FOTOS DE EVIDENCIA DE UN REPORTE (DIRECCIONES DE CLOUDINARY)
  monto?: unknown; concepto?: unknown; comprobante?: unknown; // REGISTRAR UN PAGO
  id_pago?: unknown; recibido?: unknown;             // CONFIRMAR (O NO) UN PAGO
};

const noSePuedeTexto = (estado: string) => estado === 'Finalizada' || estado === 'Cancelada'
  ? `Esta obra ya está ${estado.toLowerCase()}: ya no se puede modificar.`
  : `No se puede hacer eso: la obra está en "${estado}".`;

// PAGOS DE UNA OBRA (CAMPO pagos DEL CONTRATO). EL DINERO SE PAGA POR FUERA (EFECTIVO O TRANSFERENCIA); AQUÍ QUEDA
// LA EVIDENCIA: EL CONTRATISTA SUBE EL COMPROBANTE Y EL TRABAJADOR CONFIRMA SI LO RECIBIÓ.
// (MÁS ADELANTE SE PUEDE CAMBIAR POR UN PAGO EN GARANTÍA CON MERCADO PAGO SIN TOCAR LO DEMÁS)
const ESTADO_PAGO = { POR_CONFIRMAR: 'Por confirmar', RECIBIDO: 'Recibido', NO_RECIBIDO: 'No recibido' };

// SOLO FOTOS SUBIDAS A NUESTRA CUENTA DE CLOUDINARY, MÁXIMO 4
const fotosValidas = (env: Env, valor: unknown): string[] => {
  if (!Array.isArray(valor)) return [];
  const prefijo = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
  return valor.filter((f): f is string => typeof f === 'string' && f.startsWith(prefijo) && f.length < 500).slice(0, 4);
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
  const noSePuede = () => responder(409, { error: noSePuedeTexto(c.estado) });

  // CAMBIA CAMPOS DEL CONTRATO (Y OPCIONALMENTE CONTADORES), SOLO SI NADIE LO MODIFICÓ DESDE QUE LO LEÍMOS
  const cambioContrato = (campos: Record<string, unknown>, transformaciones: Record<string, unknown>[] = []) => ({
    update: { name: `${nombreBase}/${c.rutaContrato}`, fields: aCamposFirestore(campos) },
    updateMask: { fieldPaths: Object.keys(campos) },
    ...(transformaciones.length ? { updateTransforms: transformaciones } : {}),
    currentDocument: { updateTime: c.contrato.updateTime },
  });
  // NO SE PUEDE TERMINAR UNA OBRA MIENTRAS EL ADMIN REVISA UN REPORTE SOBRE ELLA
  const bloqueadaPorReporte = async () => (await reportesAbiertosDe(env, idContrato)) > 0
    ? responder(409, { error: 'Hay un reporte de esta obra que el administrador todavía está revisando. No se puede terminar hasta que lo resuelva; les avisaremos a los dos.' })
    : null;
  const nombreDe = async (quien: 'trabajador' | 'contratista') => (await nombresDePartes(env, c.idTrabajador, c.idContratista))[quien];
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
    // LOS DOS TIENEN QUE ACEPTAR (CADA UNO CON SU BOTÓN EN EL CHAT), SIN IMPORTAR QUIÉN EMPEZÓ. LA OBRA SOLO EMPIEZA
    // CUANDO YA ACEPTARON LOS DOS: ASÍ NADIE CIERRA EL TRATO SOLO PORQUE LA OTRA PERSONA MANDÓ UN MENSAJE.
    case 'aceptar': {
      if (!c.soyTrabajador && !c.soyContratista) return prohibido('Este contrato no es tuyo.');
      if (c.estado !== ESTADOS.PROPUESTA && c.estado !== ESTADOS.PENDIENTE) return noSePuede();
      if (!c.vacante) return responder(404, { error: 'La vacante de este contrato ya no existe.' });

      const cupoActual = numero(c.vacante.fields.cupo_actual);
      const cupoTotal = Math.max(numero(c.vacante.fields.cupo_total), 1);
      if (texto(c.vacante.fields.estado) !== 'Activa' || cupoActual >= cupoTotal) {
        return responder(409, { error: 'La vacante ya está cerrada o ya tiene todos los trabajadores que necesita.' });
      }
      const aceptadoPor = (c.contrato.fields.aceptado_por?.arrayValue?.values || []).map(v => v.stringValue || '').filter(Boolean);
      if (aceptadoPor.includes(c.uid)) return responder(409, { error: 'Ya aceptaste. Falta que la otra persona acepte en el chat.' });
      const nuevosAceptados = [...aceptadoPor, c.uid];
      const quienAcepta = await nombreDe(c.soyTrabajador ? 'trabajador' : 'contratista');
      const rolQuienAcepta = c.soyTrabajador ? 'trabajador' : 'contratista';

      // TODAVÍA FALTA LA OTRA PARTE: SE GUARDA QUE YO YA ACEPTÉ Y SE LE AVISA
      if (!nuevosAceptados.includes(c.idTrabajador) || !nuevosAceptados.includes(c.idContratista)) {
        return guardar([
          cambioContrato({ aceptado_por: nuevosAceptados }),
          nuevaNotificacion(env, otraParte, 'Falta que aceptes el trato', `${quienAcepta} (${rolQuienAcepta}) ya aceptó el trato de "${tituloObra}". Entra al chat y, si están de acuerdo, acepta tú también para empezar la obra.`, { chat_con: { id: c.uid, nombre: quienAcepta, rol: c.soyTrabajador ? 'Trabajador' : 'Contratista' } }),
        ], c.estado);
      }

      const cupoNuevo = cupoActual + 1;
      const respuesta = await guardar([
        cambioContrato({ estado: ESTADOS.ACTIVA, aceptado_por: nuevosAceptados, id_contratista: c.idContratista, fecha_inicio: ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }), timestamp_inicio: ahora.getTime() }),
        nuevaNotificacion(env, otraParte, '¡Trato cerrado!', `${quienAcepta} (${rolQuienAcepta}) también aceptó "${tituloObra}". Los dos aceptaron: la obra ya está activa en tu pestaña Obras.`, { destino: { abrir: 'obra', id_contrato: idContrato } }),
        // EL CUPO SOLO SE OCUPA CUANDO LOS DOS ACEPTARON. SI SE LLENA, LA VACANTE SE CIERRA
        {
          update: { name: `${nombreBase}/Vacantes/${c.idVacante}`, fields: aCamposFirestore({ cupo_actual: cupoNuevo, estado: cupoNuevo >= cupoTotal ? 'Cerrada' : 'Activa' }) },
          updateMask: { fieldPaths: ['cupo_actual', 'estado'] },
          currentDocument: { updateTime: c.vacante.updateTime },
        },
      ], ESTADOS.ACTIVA);
      // SI CON ESTE TRATO SE LLENÓ LA VACANTE, LAS DEMÁS SOLICITUDES Y PROPUESTAS DE ESA VACANTE SE CIERRAN SOLAS
      // Y SE LES AVISA (ASÍ NADIE SE QUEDA ESPERANDO UNA OBRA QUE YA NO TIENE LUGAR)
      if (respuesta && cupoNuevo >= cupoTotal) {
        await cerrarTratosDeVacanteLlena(env, c.idVacante, idContrato, tituloObra).catch(error => console.log('No se pudieron cerrar los demás tratos', error));
      }
      return respuesta;
    }

    // ---- CUALQUIERA DE LOS DOS RECHAZA (O RETIRA) ANTES DE QUE SE CIERRE EL TRATO ----
    case 'rechazar': {
      if (!c.soyTrabajador && !c.soyContratista) return prohibido('Este contrato no es tuyo.');
      if (c.estado !== ESTADOS.PROPUESTA && c.estado !== ESTADOS.PENDIENTE) return noSePuede();
      const quienRechaza = await nombreDe(c.soyTrabajador ? 'trabajador' : 'contratista');
      return guardar([
        cambioContrato({ estado: ESTADOS.RECHAZADA, rechazado_por: c.uid }),
        nuevaNotificacion(env, otraParte, 'Trato no aceptado', `${quienRechaza} ya no siguió con "${tituloObra}".`, { destino: { abrir: 'obra', id_contrato: idContrato } }),
      ], ESTADOS.RECHAZADA);
    }

    // ---- TERMINAR: EL CONTRATISTA LA MARCA COMO TERMINADA Y EL TRABAJADOR CONFIRMA ----
    case 'solicitar_fin': {
      if (!c.soyContratista) return prohibido('Solo el contratista marca la obra como terminada; después el trabajador confirma.');
      if (c.estado !== ESTADOS.ACTIVA) return noSePuede();
      const bloqueo = await bloqueadaPorReporte();
      if (bloqueo) return bloqueo;
      return guardar([
        cambioContrato({ estado: ESTADOS.POR_CONFIRMAR_FIN }),
        nuevaNotificacion(env, c.idTrabajador, 'Obra marcada como terminada', `${await nombreDe('contratista')} marcó "${tituloObra}" como terminada. Entra a Obras y confirma si de verdad ya terminó.`, { destino: { abrir: 'obra', id_contrato: idContrato } }),
      ], ESTADOS.POR_CONFIRMAR_FIN);
    }
    case 'confirmar_fin': {
      if (!c.soyTrabajador) return prohibido('El trabajador es quien confirma que la obra terminó.');
      if (c.estado !== ESTADOS.POR_CONFIRMAR_FIN) return noSePuede();
      const bloqueo = await bloqueadaPorReporte();
      if (bloqueo) return bloqueo;
      const fechaFin = ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
      const writes: Record<string, unknown>[] = [
        cambioContrato({ estado: ESTADOS.FINALIZADA, fecha_fin: fechaFin, timestamp_fin: ahora.getTime() }),
        nuevaNotificacion(env, c.idContratista, 'Obra finalizada', `${await nombreDe('trabajador')} confirmó que "${tituloObra}" terminó. Ya pueden calificarse.`, { destino: { abrir: 'obra', id_contrato: idContrato } }),
      ];

      // LA OBRA TERMINADA SE AGREGA AL PERFIL PÚBLICO DEL TRABAJADOR (obras_realizadas), PARA QUE CUALQUIER CONTRATISTA
      // LA VEA EN SU PERFIL. LOS CONTRATOS SON PRIVADOS (SOLO LAS DOS PARTES LOS LEEN), POR ESO SE COPIA UN RESUMEN.
      const rutaTrabajador = `Usuarios/${c.idTrabajador}`;
      if ((await leerDocumentos(env, [rutaTrabajador]))[rutaTrabajador]) {
        const resumen = c.contrato.fields.vacante?.mapValue?.fields || {};
        // FOTOS DE LA BITÁCORA (LOS DÍAS QUE NO SE DESCONTARON) Y DÍAS CONFIRMADOS: SON LA PRUEBA DEL TRABAJO EN SU PORTAFOLIO
        const dias = await listarBitacora(env, c.rutaContrato);
        const validos = dias.filter(d => d.fields.asistio?.booleanValue && texto(d.fields.revision) !== REVISION.DESCONTADA);
        const obra = {
          fotos: validos.map(d => texto(d.fields.evidencia)).filter(Boolean).slice(-6),
          dias_trabajados: validos.length,
          dias_confirmados: validos.filter(d => texto(d.fields.revision) === REVISION.CONFIRMADA).length,
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
      return guardar([
        cambioContrato({ estado: ESTADOS.ACTIVA }),
        nuevaNotificacion(env, c.idContratista, 'La obra aún no termina', `${await nombreDe('trabajador')} dice que "${tituloObra}" todavía no termina. La obra sigue activa; platiquen lo que falta.`, { destino: { abrir: 'obra', id_contrato: idContrato } }),
      ], ESTADOS.ACTIVA);
    }

    // ---- CANCELAR: CUALQUIERA DE LOS DOS. SE LEVANTA UN REPORTE AUTOMÁTICO Y LA OBRA QUEDA SUSPENDIDA ----
    case 'cancelar': {
      if (!c.soyTrabajador && !c.soyContratista) return prohibido('Este contrato no es tuyo.');
      // SOLO UNA OBRA EN CURSO SE PUEDE CANCELAR: SI YA SE MARCÓ COMO TERMINADA, TERMINADA O CANCELADA, YA NO
      if (c.estado !== ESTADOS.ACTIVA) return responder(409, { error: c.estado === ESTADOS.POR_CONFIRMAR_FIN ? 'La obra ya se marcó como terminada; ya no se puede cancelar. Si hay un problema, usa "Reportar problema".' : noSePuedeTexto(c.estado) });
      if (!textoValido(c.motivo, 1000)) return responder(400, { error: 'Explica por qué cancelas la obra.' });

      const nombres = await nombresDePartes(env, c.idTrabajador, c.idContratista);
      const idQueja = crypto.randomUUID().replace(/-/g, '');
      const quienCancela = c.soyTrabajador ? nombres.trabajador : nombres.contratista;

      return guardar([
        cambioContrato({ estado: ESTADOS.SUSPENDIDA, cancelado_por: c.uid, motivo_cancelacion: c.motivo.trim(), id_queja: idQueja, timestamp_cancelacion: ahora.getTime() }, [contadorReportes(1)]),
        nuevoReporte(idQueja, nombres, { tipo: 'cancelacion', motivo: 'Cancelación de obra', descripcion: c.motivo.trim(), fotos_evidencia: fotosValidas(env, c.datos.fotos) }),
        nuevaNotificacion(env, otraParte, 'Obra suspendida', `${quienCancela} (${c.soyTrabajador ? 'trabajador' : 'contratista'}) canceló la obra "${tituloObra}". Queda suspendida mientras el administrador revisa el caso. Te avisaremos su decisión.`, { destino: { abrir: 'obra', id_contrato: idContrato }, tipo: 'reporte', importante: true }),
      ], ESTADOS.SUSPENDIDA);
    }

    // ---- EL CONTRATISTA REVISA UN DÍA DE LA BITÁCORA: CONFIRMA QUE EL TRABAJADOR SÍ LO HIZO, O LO RECHAZA ----
    // SI LO RECHAZA SE LEVANTA UN REPORTE: EL ADMIN DECIDE SI EL DÍA CUENTA O SE DESCUENTA.
    case 'revisar_bitacora': {
      if (!c.soyContratista) return prohibido('Solo el contratista revisa la bitácora del trabajador.');
      // SOLO MIENTRAS LA OBRA SIGUE ABIERTA; TERMINADA, SUSPENDIDA O CANCELADA YA NO SE MODIFICA NADA
      if (c.estado !== ESTADOS.ACTIVA && c.estado !== ESTADOS.POR_CONFIRMAR_FIN) return noSePuede();
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
        return guardar([
          cambioEntrada({ revision: REVISION.CONFIRMADA, fecha_revision: ahora.toISOString() }),
          nuevaNotificacion(env, c.idTrabajador, 'Bitácora confirmada', `${await nombreDe('contratista')} confirmó tu avance del ${texto(entrada.fields.fecha)} en "${tituloObra}".`, { destino: { abrir: 'bitacora', id_contrato: idContrato }, tipo: 'bitacora' }),
        ], c.estado);
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
          fotos_evidencia: fotosValidas(env, c.datos.fotos), // LAS QUE SUBIÓ EL CONTRATISTA COMO PRUEBA
          id_entrada: idEntrada,
          fecha_dia: fechaDia,
        }),
        nuevaNotificacion(env, c.idTrabajador, 'Bitácora rechazada', `${nombres.contratista} rechazó tu bitácora del ${fechaDia} en "${tituloObra}": "${c.motivo.trim()}". El administrador decidirá si ese día cuenta o se descuenta.`, { destino: { abrir: 'bitacora', id_contrato: idContrato }, tipo: 'bitacora', importante: true }),
        cambioContrato({}, [contadorReportes(1)]),
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
        nuevoReporte(crypto.randomUUID().replace(/-/g, ''), nombres, { tipo: 'incumplimiento', motivo: categoria, descripcion: c.motivo.trim(), fotos_evidencia: fotosValidas(env, c.datos.fotos) }),
        nuevaNotificacion(env, otraParte, 'Te reportaron', `${quienReporta} (${c.soyTrabajador ? 'trabajador' : 'contratista'}) levantó un reporte en "${tituloObra}" (${categoria}): "${c.motivo.trim()}". El administrador lo revisará y te avisaremos. Mientras tanto la obra no se puede terminar.`, { destino: { abrir: 'obra', id_contrato: idContrato }, tipo: 'reporte', importante: true }),
        cambioContrato({}, [contadorReportes(1)]),
      ], c.estado);
    }

    // ---- PAGOS: EL CONTRATISTA REGISTRA UN PAGO CON SU COMPROBANTE ----
    case 'registrar_pago': {
      if (!c.soyContratista) return prohibido('Solo el contratista registra los pagos.');
      if (![ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.FINALIZADA, ESTADOS.SUSPENDIDA, ESTADOS.CANCELADA].includes(c.estado)) return noSePuede();
      const monto = typeof c.datos.monto === 'number' && Number.isFinite(c.datos.monto) ? Math.round(c.datos.monto) : 0;
      if (monto <= 0 || monto > 1_000_000) return responder(400, { error: 'Escribe cuánto pagaste.' });
      const [comprobante] = fotosValidas(env, [c.datos.comprobante]);
      if (!comprobante) return responder(400, { error: 'Sube la foto del comprobante (ticket, captura de la transferencia o recibo firmado).' });
      const concepto = textoValido(c.datos.concepto, 80) ? c.datos.concepto.trim() : 'Pago de la obra';

      const pago = { id: crypto.randomUUID().replace(/-/g, '').slice(0, 12), monto, concepto, comprobante, estado: ESTADO_PAGO.POR_CONFIRMAR, fecha: ahora.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }), timestamp: ahora.getTime() };
      return guardar([
        cambioContrato({}, [{ fieldPath: 'pagos', appendMissingElements: { values: [aValorFirestore(pago)] } }]),
        nuevaNotificacion(env, c.idTrabajador, 'Te registraron un pago', `${await nombreDe('contratista')} (contratista) registró un pago de $${monto.toLocaleString('es-MX')} (${concepto}) en "${tituloObra}". Entra a la obra → Pagos y confirma si de verdad lo recibiste.`, { destino: { abrir: 'pagos', id_contrato: idContrato } }),
      ], c.estado);
    }

    // ---- PAGOS: EL TRABAJADOR CONFIRMA QUE SÍ LE LLEGÓ, O DICE QUE NO (Y SE LEVANTA UN REPORTE AUTOMÁTICO) ----
    case 'confirmar_pago': {
      if (!c.soyTrabajador) return prohibido('Solo el trabajador confirma si recibió el pago.');
      const pagos = (deFirestore(c.contrato.fields.pagos) as any[]) || [];
      const pago = pagos.find(p => p.id === c.datos.id_pago);
      if (!pago) return responder(404, { error: 'No se encontró ese pago.' });
      if (pago.estado !== ESTADO_PAGO.POR_CONFIRMAR) return responder(409, { error: 'Ese pago ya fue confirmado.' });
      const recibido = c.datos.recibido === true;
      if (!recibido && !textoValido(c.motivo, 1000)) return responder(400, { error: 'Explica qué pasó con el pago.' });

      const pagosNuevos = pagos.map(p => p.id === pago.id ? { ...p, estado: recibido ? ESTADO_PAGO.RECIBIDO : ESTADO_PAGO.NO_RECIBIDO, fecha_confirmacion: ahora.toISOString(), ...(recibido ? {} : { motivo: c.motivo }) } : p);
      const nombres = await nombresDePartes(env, c.idTrabajador, c.idContratista);
      const montoTexto = `$${Number(pago.monto).toLocaleString('es-MX')}`;
      if (recibido) {
        return guardar([
          cambioContrato({ pagos: pagosNuevos }),
          nuevaNotificacion(env, c.idContratista, 'Pago confirmado', `${nombres.trabajador} (trabajador) confirmó que recibió ${montoTexto} de "${tituloObra}".`, { destino: { abrir: 'pagos', id_contrato: idContrato } }),
        ], c.estado);
      }
      // NO LE LLEGÓ: REPORTE AL ADMIN CON EL COMPROBANTE QUE SUBIÓ EL CONTRATISTA COMO EVIDENCIA
      return guardar([
        cambioContrato({ pagos: pagosNuevos }, [contadorReportes(1)]),
        nuevoReporte(crypto.randomUUID().replace(/-/g, ''), nombres, {
          tipo: 'pago', motivo: 'Pago no recibido',
          descripcion: `El contratista registró un pago de ${montoTexto} (${pago.concepto}) el ${pago.fecha}, pero el trabajador dice que no lo recibió: "${String(c.motivo).trim()}"`,
          foto_evidencia: pago.comprobante,
        }),
        nuevaNotificacion(env, c.idContratista, 'Pago no recibido', `${nombres.trabajador} (trabajador) dice que no recibió el pago de ${montoTexto} de "${tituloObra}". El administrador revisará el comprobante que subiste.`, { destino: { abrir: 'pagos', id_contrato: idContrato }, tipo: 'reporte', importante: true }),
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
        cambioContrato({ estado: cancelar ? ESTADOS.CANCELADA : ESTADOS.ACTIVA, decidido_por_admin: c.uid }, [contadorReportes(-1)]),
        nuevaNotificacion(env, c.idTrabajador, 'Decisión del administrador', aviso, { destino: { abrir: 'obra', id_contrato: idContrato }, tipo: 'admin', importante: true }),
        nuevaNotificacion(env, c.idContratista, 'Decisión del administrador', aviso, { destino: { abrir: 'obra', id_contrato: idContrato }, tipo: 'admin', importante: true }),
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

// AVISO PARA UN USUARIO (COLECCIÓN Notificaciones). LA APP LOS MUESTRA EN SU PANEL DE NOTIFICACIONES (LA CAMPANA).
//   tipo: 'contrato' | 'bitacora' | 'reporte' | 'admin' | 'resena' (DEFINE EL ÍCONO Y EL COLOR)
//   importante: SE ABRE SOLO EN CUANTO LLEGA (DECISIONES DEL ADMIN, OBRA SUSPENDIDA...)
//   chat_con: AL TOCAR EL AVISO SE ABRE EL CHAT CON ESA PERSONA (P. EJ. UNA PROPUESTA NUEVA)
//   destino: A DÓNDE LLEVA AL TOCARLO ('obra' | 'bitacora' | 'pagos' | 'resenas', Y DE QUÉ CONTRATO)
type ExtraNotificacion = {
  tipo?: string; importante?: boolean;
  chat_con?: { id: string; nombre: string; rol: string };
  destino?: { abrir: 'obra' | 'bitacora' | 'pagos' | 'resenas'; id_contrato?: string };
};

const nuevaNotificacion = (env: Env, idUsuario: string, titulo: string, mensaje: string, extra: ExtraNotificacion = {}) => ({
  update: {
    name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/Notificaciones/${crypto.randomUUID().replace(/-/g, '')}`,
    fields: aCamposFirestore({
      id_usuario: idUsuario, titulo, mensaje, leida: false, fecha: new Date().toISOString(), timestamp: Date.now(),
      tipo: extra.tipo || 'contrato', importante: extra.importante || false, ...(extra.chat_con ? { chat_con: extra.chat_con } : {}),
      ...(extra.destino ? { destino: extra.destino } : {}),
    }),
  },
  currentDocument: { exists: false },
});

// COORDENADAS GUARDADAS EN FIRESTORE ({ latitud, longitud }) -> OBJETO, O null SI NO HAY
const coordenadasDe = (valor: ValorFirestore | undefined) => {
  const campos = valor?.mapValue?.fields;
  const latitud = numero(campos?.latitud);
  const longitud = numero(campos?.longitud);
  return latitud && longitud ? { latitud, longitud } : null;
};

// REPORTES DE UNA OBRA QUE EL ADMIN AÚN NO RESUELVE (MIENTRAS HAYA, NO SE PUEDE TERMINAR LA OBRA)
const reportesAbiertosDe = async (env: Env, idContrato: string) =>
  (await consultarDocumentos(env, 'Quejas_Soporte', [['id_contrato', 'EQUAL', idContrato]]))
    .filter(q => texto(q.fields.estado) !== 'Resuelta').length;

// CIERRA LOS TRATOS QUE QUEDARON ABIERTOS EN UNA VACANTE QUE YA SE LLENÓ Y LES AVISA A LAS DOS PARTES
const cerrarTratosDeVacanteLlena = async (env: Env, idVacante: string, idContratoAceptado: string, titulo: string) => {
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const abiertos = (await consultarDocumentos(env, 'Postulaciones', [['id_vacante', 'EQUAL', idVacante], ['estado', 'IN', [ESTADOS.PENDIENTE, ESTADOS.PROPUESTA]]], 100))
    .filter(t => t.id !== idContratoAceptado);
  if (abiertos.length === 0) return;
  const writes: Record<string, unknown>[] = [];
  for (const t of abiertos) {
    writes.push({
      update: { name: `${nombreBase}/Postulaciones/${t.id}`, fields: aCamposFirestore({ estado: ESTADOS.RECHAZADA, rechazado_por: 'vacante_llena' }) },
      updateMask: { fieldPaths: ['estado', 'rechazado_por'] },
      currentDocument: { updateTime: t.updateTime },
    });
    writes.push(nuevaNotificacion(env, texto(t.fields.id_trabajador), 'La vacante ya se llenó', `"${titulo}" ya tiene a todos los trabajadores que necesitaba, así que tu solicitud se cerró. ¡Sigue buscando en la Bolsa de Trabajo!`, { destino: { abrir: 'obra', id_contrato: t.id } }));
  }
  await confirmarEscrituras(env, writes);
};

// TODOS LOS DÍAS DE LA BITÁCORA DE UN CONTRATO (SUBCOLECCIÓN Postulaciones/{id}/Bitacora)
const listarBitacora = async (env: Env, rutaContrato: string) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}/${rutaContrato}/Bitacora?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);
  const { documents = [] } = (await respuesta.json()) as { documents?: { fields?: DocumentoLeido['fields']; createTime: string }[] };
  return documents.map(d => ({ fields: d.fields || {} })).sort((a, b) => numero(a.fields.timestamp) - numero(b.fields.timestamp));
};

// CAMBIA EL CONTADOR reportes_abiertos DEL CONTRATO (LA APP LO USA PARA AVISAR Y BLOQUEAR EL BOTÓN DE TERMINAR)
const contadorReportes = (n: number) => ({ fieldPath: 'reportes_abiertos', increment: { integerValue: String(n) } });

// =========================================================================
// RUTA 7: EL ADMIN RESUELVE UN REPORTE Y SE LES AVISA A QUIEN REPORTÓ Y A QUIEN FUE REPORTADO
// (LAS CANCELACIONES DE OBRA NO VAN AQUÍ: SE RESUELVEN CON admin_reactivar / admin_cancelar EN /contratos)
//   tipo 'bitacora':  decision 'a_favor_trabajador' (el día cuenta) | 'a_favor_contratista' (el día se descuenta)
//   cualquier otro:   decision 'procede' (tiene razón quien reportó) | 'no_procede'
// =========================================================================
const resolverReporte = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });

  let datos: { id_queja?: unknown; decision?: unknown; nota?: unknown; descuento?: unknown; bloquear?: unknown };
  try {
    datos = await request.json();
  } catch {
    return responder(400, { error: 'Cuerpo de la petición inválido' });
  }
  if (!textoValido(datos.id_queja, 128)) return responder(400, { error: 'Falta el reporte.' });
  if (!textoValido(datos.nota, 1000)) return responder(400, { error: 'Escribe tu decisión para que las dos partes la lean.' });
  const nota = datos.nota.trim();
  const descuento = typeof datos.descuento === 'number' && Number.isFinite(datos.descuento) ? Math.max(0, Math.round(datos.descuento)) : 0;
  if (descuento > 1_000_000) return responder(400, { error: 'El descuento es demasiado grande.' });

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
    // NOMBRES SIEMPRE CON SU ROL ("JOCELYN (TRABAJADOR)"), PARA NO CONFUNDIR A DOS PERSONAS CON EL MISMO NOMBRE
    const reportante = { id: texto(queja.fields.id_reportante), nombre: texto(queja.fields.nombre_reportante) || 'Quien reportó', rol: texto(queja.fields.rol_reportante) || 'Usuario' };
    const acusado = { id: texto(queja.fields.id_acusado), nombre: texto(queja.fields.acusado) || 'La otra persona', rol: texto(queja.fields.rol_acusado) || 'Usuario' };
    const conRol = (p: { nombre: string; rol: string }) => `${p.nombre} (${p.rol.toLowerCase()})`;

    let resolucion: string;
    let favorecido: typeof reportante;
    if (tipo === 'bitacora') {
      if (datos.decision !== 'a_favor_trabajador' && datos.decision !== 'a_favor_contratista') return responder(400, { error: 'Decisión inválida.' });
      const aFavorTrabajador = datos.decision === 'a_favor_trabajador';
      // EN UNA BITÁCORA RECHAZADA REPORTA EL CONTRATISTA Y EL REPORTADO ES EL TRABAJADOR
      favorecido = aFavorTrabajador ? acusado : reportante;
      resolucion = aFavorTrabajador
        ? `Tiene la razón ${conRol(acusado)}: el día ${texto(queja.fields.fecha_dia)} SÍ cuenta como trabajado.`
        : `Tiene la razón ${conRol(reportante)}: el día ${texto(queja.fields.fecha_dia)} NO cuenta y se descuenta.`;
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
      favorecido = datos.decision === 'procede' ? reportante : acusado;
      resolucion = `Tiene la razón ${conRol(favorecido)}.`;
    }
    const perdedor = favorecido === reportante ? acusado : reportante;

    // AJUSTE AL PAGO. EL DINERO SIEMPRE VA DEL CONTRATISTA AL TRABAJADOR, ASÍ QUE:
    //   - SI TIENE LA RAZÓN EL TRABAJADOR -> EL CONTRATISTA LE DEBE PAGAR $X EXTRA
    //   - SI TIENE LA RAZÓN EL CONTRATISTA -> SE LE DESCUENTAN $X DEL PAGO AL TRABAJADOR
    const trabajador = reportante.rol === 'Trabajador' ? reportante : acusado;
    const contratista = reportante.rol === 'Contratista' ? reportante : acusado;
    let ajuste: Record<string, unknown> | null = null;
    if (descuento > 0) {
      if (!idContrato) return responder(400, { error: 'Solo los reportes de una obra pueden llevar un ajuste de dinero.' });
      const extra = favorecido.rol === 'Trabajador';
      ajuste = {
        tipo: extra ? 'extra' : 'descuento', monto: descuento,
        texto: extra
          ? `${conRol(contratista)} debe pagarle $${descuento.toLocaleString('es-MX')} EXTRA a ${conRol(trabajador)}.`
          : `Se descuentan $${descuento.toLocaleString('es-MX')} del pago a ${conRol(trabajador)}.`,
        motivo: texto(queja.fields.motivo), id_queja: datos.id_queja,
        fecha: new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }),
      };
    }
    resolucion = `${resolucion} ${ajuste ? ajuste.texto : 'Sin ajuste de dinero.'}`;

    // BLOQUEAR LA CUENTA DE QUIEN NO TUVO LA RAZÓN (P. EJ. UN CONTRATISTA QUE NO PAGÓ)
    const esUsuario = (id: string) => /^[A-Za-z0-9]{10,128}$/.test(id);
    if (datos.bloquear === true && esUsuario(perdedor.id) && (perdedor.rol === 'Trabajador' || perdedor.rol === 'Contratista')) {
      writes.push({
        update: { name: `${nombreBase}/${perdedor.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas'}/${perdedor.id}`, fields: aCamposFirestore({ estado_cuenta: 'Bloqueada' }) },
        updateMask: { fieldPaths: ['estado_cuenta'] },
        currentDocument: { exists: true },
      });
      resolucion = `${resolucion} La cuenta de ${conRol(perdedor)} quedó BLOQUEADA.`;
    }

    // EL CONTRATO DEJA DE CONTAR ESTE REPORTE COMO ABIERTO (YA SE PUEDE TERMINAR LA OBRA SI NO HAY OTROS)
    // Y GUARDA EL AJUSTE, PARA QUE LAS DOS PARTES LO VEAN EN SU TARJETA DE LA OBRA
    if (idContrato) {
      const transformaciones: Record<string, unknown>[] = [contadorReportes(-1)];
      if (ajuste) transformaciones.push({ fieldPath: 'ajustes_pago', appendMissingElements: { values: [aValorFirestore(ajuste)] } });
      writes.push({
        update: { name: `${nombreBase}/Postulaciones/${idContrato}`, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: transformaciones,
        currentDocument: { exists: true },
      });
    }

    const admin = docs['Sistema/AdminProfile'];
    writes.push({
      update: {
        name: `${nombreBase}/${rutaQueja}`,
        fields: aCamposFirestore({ estado: 'Resuelta', resolucion, nota_admin: nota, descuento, fecha_resolucion: new Date().toISOString(), atendida_por: (admin && texto(admin.fields.nombre)) || 'Administrador' }),
      },
      updateMask: { fieldPaths: ['estado', 'resolucion', 'nota_admin', 'descuento', 'fecha_resolucion', 'atendida_por'] },
      currentDocument: { updateTime: queja.updateTime },
    });

    // AVISO A LAS DOS PARTES (LOS REPORTES VIEJOS DEL CHAT PUEDEN TRAER 'Desconocido' EN LUGAR DE UN USUARIO)
    const motivo = texto(queja.fields.motivo);
    const obra = texto(queja.fields.titulo_obra) ? ` en "${texto(queja.fields.titulo_obra)}"` : '';
    const extra: ExtraNotificacion = {
      tipo: 'admin', importante: true,
      destino: idContrato ? { abrir: tipo === 'bitacora' ? 'bitacora' : tipo === 'pago' ? 'pagos' : 'obra', id_contrato: idContrato } : undefined,
    };
    if (esUsuario(reportante.id)) writes.push(nuevaNotificacion(env, reportante.id, 'Tu reporte fue resuelto', `Reporte "${motivo}"${obra}: ${resolucion}\n\nNota del administrador: ${nota}`, extra));
    if (esUsuario(acusado.id)) writes.push(nuevaNotificacion(env, acusado.id, 'Se resolvió un reporte sobre ti', `Reporte "${motivo}"${obra}, levantado por ${conRol(reportante)}: ${resolucion}\n\nNota del administrador: ${nota}`, extra));

    if (!(await confirmarEscrituras(env, writes))) return responder(409, { error: 'El reporte cambió mientras lo resolvías. Recarga e intenta de nuevo.' });
    return responder(200, { resuelta: true });
  } catch (error) {
    console.log('Error resolviendo reporte', error);
    return responder(502, { error: 'No se pudo resolver el reporte. Intenta más tarde.' });
  }
};

// =========================================================================
// RUTA 8: EL ADMIN CORRIGE LOS DATOS PÚBLICOS DE UN PERFIL
// EL PERFIL GUARDA UNA COPIA DE SUS RESEÑAS (calificacion, numero_resenas, resenas) Y DE SUS OBRAS TERMINADAS
// (obras_realizadas) PARA CARGAR RÁPIDO. SI SE BORRA EL ORIGINAL, LA COPIA SE DEBE RECALCULAR:
//   eliminar_resena  { id_resena }               -> borra la reseña y recalcula a quien la recibió
//   eliminar_obra    { uid, id_contrato }        -> quita la obra del perfil (y no vuelve a aparecer al recalcular)
//   recalcular       { uid }                     -> rearma reseñas y obras de un perfil con lo que de verdad existe
//   recalcular_todos {}                          -> lo mismo para todos (p. ej. después de limpiar Firebase a mano)
// =========================================================================
const adminPerfiles = async (request: Request, env: Env) => {
  const sesion = await verificarSesion(request, env);
  if (!sesion) return responder(401, { error: 'Sesión inválida o expirada' });
  let datos: { accion?: unknown; uid?: unknown; id_resena?: unknown; id_contrato?: unknown };
  try { datos = await request.json(); } catch { return responder(400, { error: 'Cuerpo de la petición inválido' }); }

  try {
    if (!(await leerDocumentos(env, [`Administradores/${sesion.uid}`]))[`Administradores/${sesion.uid}`]) {
      return responder(403, { error: 'Solo un administrador puede hacer esto.' });
    }
    const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

    switch (datos.accion) {
      case 'eliminar_resena': {
        if (!textoValido(datos.id_resena, 300) || !/^[\w]+_[\w]+$/.test(datos.id_resena)) return responder(400, { error: 'Reseña inválida.' });
        const idEvaluado = datos.id_resena.split('_')[1];
        await confirmarEscrituras(env, [{ delete: `${nombreBase}/Resenas_Plataforma/${datos.id_resena}` }]);
        await recalcularPerfil(env, idEvaluado);
        return responder(200, { ok: true });
      }
      case 'eliminar_obra': {
        if (!textoValido(datos.uid, 128) || !textoValido(datos.id_contrato, 128)) return responder(400, { error: 'Faltan datos.' });
        // SE MARCA EL CONTRATO PARA QUE AL RECALCULAR NO VUELVA A APARECER EN EL PERFIL (SI EL CONTRATO AÚN EXISTE)
        const ruta = `Postulaciones/${datos.id_contrato}`;
        if ((await leerDocumentos(env, [ruta]))[ruta]) {
          await confirmarEscrituras(env, [{
            update: { name: `${nombreBase}/${ruta}`, fields: aCamposFirestore({ oculta_en_perfil: true }) },
            updateMask: { fieldPaths: ['oculta_en_perfil'] },
          }]);
        }
        await recalcularPerfil(env, datos.uid, datos.id_contrato);
        return responder(200, { ok: true });
      }
      case 'recalcular': {
        if (!textoValido(datos.uid, 128)) return responder(400, { error: 'Falta el usuario.' });
        await recalcularPerfil(env, datos.uid);
        return responder(200, { ok: true });
      }
      case 'recalcular_todos': {
        const ids = [...(await listarIds(env, 'Usuarios')), ...(await listarIds(env, 'Contratistas'))];
        for (const id of ids) await recalcularPerfil(env, id);
        return responder(200, { ok: true, perfiles: ids.length });
      }
      default:
        return responder(400, { error: 'Acción desconocida.' });
    }
  } catch (error) {
    console.log('Error corrigiendo perfiles', error);
    return responder(502, { error: 'No se pudo completar. Intenta más tarde.' });
  }
};

// IDS DE TODOS LOS DOCUMENTOS DE UNA COLECCIÓN (HASTA 300)
const listarIds = async (env: Env, coleccion: string) => {
  const token = await obtenerTokenGoogle(env);
  const respuesta = await fetch(`${urlDocumentos(env)}/${coleccion}?pageSize=300&mask.fieldPaths=nombre`, { headers: { Authorization: `Bearer ${token}` } });
  if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${await respuesta.text()}`);
  const { documents = [] } = (await respuesta.json()) as { documents?: { name: string }[] };
  return documents.map(d => d.name.split('/').pop() as string);
};

// REARMA LA COPIA DE RESEÑAS Y OBRAS TERMINADAS DE UN PERFIL CON LO QUE DE VERDAD EXISTE EN FIREBASE:
//   - RESEÑAS: LAS DE Resenas_Plataforma DIRIGIDAS A ESTA PERSONA (Y SU PROMEDIO)
//   - OBRAS: SOLO LAS QUE SIGUEN EXISTIENDO COMO CONTRATO FINALIZADO Y NO SE OCULTARON (quitarContrato SE QUITA SIEMPRE)
const recalcularPerfil = async (env: Env, uid: string, quitarContrato?: string) => {
  const nombreBase = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const perfiles = await leerDocumentos(env, [`Usuarios/${uid}`, `Contratistas/${uid}`]);
  const ruta = perfiles[`Usuarios/${uid}`] ? `Usuarios/${uid}` : perfiles[`Contratistas/${uid}`] ? `Contratistas/${uid}` : null;
  if (!ruta) return;
  const perfil = perfiles[ruta]!;

  const resenas = (await consultarDocumentos(env, 'Resenas_Plataforma', [['evaluado_id', 'EQUAL', uid]], 300))
    .map(r => ({
      evaluador_id: texto(r.fields.evaluador_id), evaluador_nombre: texto(r.fields.evaluador_nombre), evaluador_foto: texto(r.fields.evaluador_foto),
      estrellas: numero(r.fields.estrellas), comentario: texto(r.fields.comentario), fecha: texto(r.fields.fecha), timestamp: numero(r.fields.timestamp),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const promedio = resenas.length ? resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length : 0;
  const campos: Record<string, unknown> = { calificacion: promedio.toFixed(1), numero_resenas: resenas.length, resenas };

  if (ruta.startsWith('Usuarios/')) {
    const obras = ((deFirestore(perfil.fields.obras_realizadas) as any[]) || []).filter(o => o?.id_contrato && o.id_contrato !== quitarContrato);
    const contratos = obras.length ? await leerDocumentos(env, obras.map(o => `Postulaciones/${o.id_contrato}`)) : {};
    campos.obras_realizadas = obras.filter(o => {
      const c = contratos[`Postulaciones/${o.id_contrato}`];
      return c && texto(c.fields.estado) === 'Finalizada' && !c.fields.oculta_en_perfil?.booleanValue;
    });
  }

  await confirmarEscrituras(env, [{
    update: { name: `${nombreBase}/${ruta}`, fields: aCamposFirestore(campos) },
    updateMask: { fieldPaths: Object.keys(campos) },
  }]);
};

// CONSULTA DOCUMENTOS CON FILTROS (TODOS DEBEN CUMPLIRSE). op: 'EQUAL' COMPARA CON UN VALOR, 'IN' CON UNA LISTA.
const consultarDocumentos = async (env: Env, coleccion: string, filtros: [string, 'EQUAL' | 'IN', unknown][], limite = 50) => {
  const token = await obtenerTokenGoogle(env);
  const condiciones = filtros.map(([campo, op, valor]) => ({ fieldFilter: { field: { fieldPath: campo }, op, value: aValorFirestore(valor) } }));
  const respuesta = await fetch(`${urlDocumentos(env)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        where: condiciones.length === 1 ? condiciones[0] : { compositeFilter: { op: 'AND', filters: condiciones } },
        limit: limite,
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
  booleanValue?: boolean;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, ValorFirestore> };
  arrayValue?: { values?: ValorFirestore[] };
};

// CONVIERTE UN VALOR DE FIRESTORE A JAVASCRIPT (LO CONTRARIO DE aValorFirestore)
const deFirestore = (valor: ValorFirestore | undefined): unknown => {
  if (!valor) return null;
  if (valor.stringValue !== undefined) return valor.stringValue;
  if (valor.integerValue !== undefined) return Number(valor.integerValue);
  if (valor.doubleValue !== undefined) return valor.doubleValue;
  if (valor.booleanValue !== undefined) return valor.booleanValue;
  if (valor.timestampValue !== undefined) return new Date(valor.timestampValue);
  if (valor.arrayValue) return (valor.arrayValue.values || []).map(deFirestore);
  if (valor.mapValue) return Object.fromEntries(Object.entries(valor.mapValue.fields || {}).map(([k, v]) => [k, deFirestore(v)]));
  return null;
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
