// CONTRATOS ENTRE TRABAJADOR Y CONTRATISTA (COLECCIÓN "Postulaciones").
// LOS CAMBIOS DE ESTADO LOS HACE EL SERVIDOR (backend/kyc-worker, RUTA /contratos); LA APP SOLO PIDE LA ACCIÓN.
//
//   Pendiente ──┐ (el trabajador se postuló: espera al contratista)
//   Propuesta ──┼─► Aceptada (En Proceso) ─► Por confirmar fin ─► Finalizada
//               │            │                      │
//               └─► Rechazada └──── cancelar ───────┴─► Suspendida ─► (admin) Cancelada, o reactivada
import { router } from 'expo-router';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { DIAS_SEMANA, textoDias } from '@/lib/ubicacion';

// ABRE EL CHAT CON LA OTRA PARTE (SI NO EXISTE, MENSAJES LO CREA). EL TRATO SE PLATICA Y SE ACEPTA AHÍ.
// mensaje: TEXTO YA ESCRITO EN LA CAJA (P. EJ. "HOLA, VI TU PERFIL..."); LA PERSONA LO PUEDE CAMBIAR ANTES DE ENVIARLO.
export const abrirChatCon = (persona: { id: string; nombre: string; rol: string; foto?: string }, mensaje?: string) => {
  router.replace({
    pathname: '/mensajes',
    params: { autoOpenId: persona.id, autoOpenNombre: persona.nombre, autoOpenRol: persona.rol, autoOpenFoto: persona.foto || '', autoOpenMensaje: mensaje || '' },
  } as any);
};

// MENSAJES LISTOS PARA EMPEZAR LA PLÁTICA, SEGÚN QUIÉN ESCRIBE Y POR QUÉ
export const MENSAJES_INICIALES = {
  propuesta: (nombre: string, obra: string) => `Hola ${nombre}, vi tu perfil y te propuse la obra "${obra}". ¿Te interesaría? Platiquemos los detalles.`,
  solicitud: (nombre: string, obra: string) => `Hola ${nombre}, vi tu solicitud para "${obra}". Me interesa tu perfil, ¿platicamos los detalles?`,
  postulacion: (obra: string) => `Hola, me postulé a su obra "${obra}". Me interesa mucho, ¿platicamos los detalles?`,
  responderPropuesta: (obra: string) => `Hola, vi su propuesta para "${obra}". Me interesa, ¿me da más detalles?`,
};

// RESPUESTAS RÁPIDAS QUE APARECEN ARRIBA DE LA CAJA DEL CHAT
export const RESPUESTAS_RAPIDAS: Record<string, string[]> = {
  Contratista: ['Hola, vi tu perfil. ¿Te interesaría una obra?', '¿Cuándo podrías empezar?', '¿Cuál es tu precio?', '¿Tienes herramienta propia?', 'De acuerdo, acepto el trato.'],
  Trabajador: ['Hola, me interesa esta obra.', '¿Cuándo empezaríamos?', '¿El material lo pone usted?', '¿Cuál es el horario?', 'De acuerdo, acepto el trato.'],
};

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
  | 'revisar_bitacora' | 'reportar_problema'
  | 'registrar_pago' | 'confirmar_pago'
  | 'admin_reactivar' | 'admin_cancelar' | 'cambiar_inicio';

type DatosAccion = {
  id_contrato?: string; id_vacante?: string; id_trabajador?: string; motivo?: string;
  id_entrada?: string; veredicto?: 'confirmar' | 'rechazar'; categoria?: string; nota?: string;
  fotos?: string[];                                        // EVIDENCIA DE UN REPORTE (YA SUBIDAS A CLOUDINARY)
  monto?: number; concepto?: string; comprobante?: string; // REGISTRAR UN PAGO
  id_pago?: string; recibido?: boolean;                    // CONFIRMAR UN PAGO
  devolver?: number;                                       // ADMIN CANCELA: PESOS QUE EL TRABAJADOR DEBE DEVOLVER
  inicio_obra?: string; fin_obra?: string; dias_obra?: string[]; // CAMBIAR LOS DÍAS DE TRABAJO DE LA OBRA
};

// LO QUE EL CONTRATISTA YA PAGÓ (CONFIRMADO O POR CONFIRMAR; NO CUENTA LO MARCADO COMO NO RECIBIDO)
export const dineroYaPagado = (contrato: any) => (contrato?.pagos || []).filter((p: any) => p.estado !== ESTADO_PAGO.NO_RECIBIDO).reduce((s: number, p: any) => s + (p.monto || 0), 0);

// ---------------------------------------------------------------- PAGOS
// EL DINERO SE PAGA POR FUERA (EFECTIVO O TRANSFERENCIA). EN LA APP QUEDA LA EVIDENCIA: EL CONTRATISTA SUBE EL
// COMPROBANTE Y EL TRABAJADOR CONFIRMA. (DESPUÉS SE PUEDE CAMBIAR POR UN PAGO EN GARANTÍA CON MERCADO PAGO)
export const ESTADO_PAGO = { POR_CONFIRMAR: 'Por confirmar', RECIBIDO: 'Recibido', NO_RECIBIDO: 'No recibido' };
export const COLOR_PAGO: Record<string, string> = { 'Por confirmar': '#F59E0B', Recibido: '#059669', 'No recibido': '#DC2626' };
export const CONCEPTOS_PAGO = ['Pago de la obra', 'Pago parcial / adelanto', 'Pago de la semana', 'Pago extra ordenado por el administrador', 'Material'];

export const pagosPorConfirmar = (contrato: any) => (contrato?.pagos || []).filter((p: any) => p.estado === ESTADO_PAGO.POR_CONFIRMAR);
export const totalRecibido = (contrato: any) => (contrato?.pagos || []).filter((p: any) => p.estado === ESTADO_PAGO.RECIBIDO).reduce((s: number, p: any) => s + (p.monto || 0), 0);

// AJUSTES DE DINERO QUE ORDENÓ EL ADMIN: 'extra' (EL CONTRATISTA DEBE PAGAR DE MÁS), 'descuento' (SE LE QUITA AL TRABAJADOR)
// O 'devolucion' (AL CANCELAR, EL TRABAJADOR DEVUELVE PARTE DE LO QUE YA HABÍA RECIBIDO)
export const ajustesDePago = (contrato: any): any[] => contrato?.ajustes_pago || [];

// ---------------------------------------------------------------- CONDICIONES DE LA OBRA
// LO QUE EL CONTRATISTA PROMETE AL PUBLICAR LA VACANTE. SE COPIA AL CONTRATO COMO EVIDENCIA DE LO ACORDADO.
export const CONDICIONES: { clave: string; pregunta: string; opciones: string[] }[] = [
  { clave: 'material', pregunta: '¿Quién pone el material?', opciones: ['Lo pone el contratista', 'Lo pone el trabajador', 'Se reparte entre los dos', 'No se necesita'] },
  { clave: 'herramienta', pregunta: '¿Quién pone la herramienta?', opciones: ['La pone el contratista', 'La pone el trabajador', 'Se reparte entre los dos'] },
  { clave: 'comida', pregunta: '¿Se da comida?', opciones: ['Sí, se da comida', 'No'] },
  { clave: 'transporte', pregunta: '¿Se paga el pasaje o transporte?', opciones: ['Sí, se paga el pasaje', 'No'] },
  { clave: 'seguridad', pregunta: '¿Se da equipo de seguridad (casco, guantes...)?', opciones: ['Sí', 'No', 'No se necesita'] },
  { clave: 'forma_pago', pregunta: '¿Cómo se paga?', opciones: ['Efectivo', 'Transferencia', 'Efectivo o transferencia'] },
  { clave: 'cuando_pago', pregunta: '¿Cuándo se paga?', opciones: ['Cada día', 'Cada semana', 'Al terminar la obra', 'Mitad al inicio y mitad al final'] },
];

// LLAMA A UNA RUTA DEL SERVIDOR CON LA SESIÓN. SI NO SE PUEDE, LANZA UN ERROR CON EL MOTIVO (LISTO PARA UN Alert)
const llamarServidor = async (ruta: string, cuerpo: Record<string, unknown>, errorPorDefecto: string) => {
  const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
  if (!KYC_API_URL) throw new Error("Falta configurar EXPO_PUBLIC_KYC_API_URL en el archivo .env");

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

  const response = await fetch(`${KYC_API_URL}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(cuerpo),
  });
  const resultado = await response.json();
  if (!response.ok) throw new Error(resultado.error || errorPorDefecto);
  return resultado;
};

// PIDE UNA ACCIÓN SOBRE UN CONTRATO AL SERVIDOR
export const accionContrato = async (accion: AccionContrato, datos: DatosAccion = {}) =>
  (await llamarServidor('/contratos', { accion, ...datos }, "No se pudo actualizar el contrato.")) as { estado?: string; id_contrato?: string };

// EL ADMIN RESUELVE UN REPORTE (QUE NO SEA UNA CANCELACIÓN DE OBRA). EL SERVIDOR LES AVISA A LAS DOS PARTES.
//   bitácora: 'a_favor_trabajador' | 'a_favor_contratista'      otros: 'procede' | 'no_procede'
//   ajuste: PESOS A FAVOR DE QUIEN TUVO LA RAZÓN (EXTRA PARA EL TRABAJADOR, O DESCUENTO AL TRABAJADOR). 0 = NADA
//   bloquear: BLOQUEAR LA CUENTA DE QUIEN NO TUVO LA RAZÓN
export const resolverReporte = (idQueja: string, decision: string, nota: string, ajuste = 0, bloquear = false) =>
  llamarServidor('/reportes', { id_queja: idQueja, decision, nota, descuento: ajuste, bloquear }, "No se pudo resolver el reporte.");

// EL ADMIN CORRIGE LA COPIA DE RESEÑAS Y OBRAS TERMINADAS QUE GUARDA CADA PERFIL (VER /admin-perfiles EN EL SERVIDOR)
export const adminPerfiles = (accion: 'eliminar_resena' | 'eliminar_obra' | 'recalcular' | 'recalcular_todos', datos: { uid?: string; id_resena?: string; id_contrato?: string } = {}) =>
  llamarServidor('/admin-perfiles', { accion, ...datos }, "No se pudo completar.") as Promise<{ ok: boolean; perfiles?: number }>;

// PERSONAL DE MONITOREO (SOLO EL ADMIN PRINCIPAL): DAR DE ALTA (LE LLEGA UN CORREO PARA CREAR SU CONTRASEÑA),
// REENVIAR ESE CORREO, O QUITARLO
export const gestionarEquipo = (accion: 'invitar' | 'reenviar' | 'quitar', datos: { nombre?: string; correo?: string; puesto?: string; uid?: string }) =>
  llamarServidor('/equipo', { accion, ...datos }, "No se pudo completar.") as Promise<{ ok?: boolean; uid?: string }>;

// ¿HAY REPORTES DE ESTA OBRA QUE EL ADMIN AÚN NO RESUELVE? MIENTRAS LOS HAYA, NO SE PUEDE TERMINAR LA OBRA
export const tieneReporteAbierto = (contrato: any) => (contrato?.reportes_abiertos || 0) > 0;

// ---------------------------------------------------------------- BITÁCORA

// REVISIÓN DE CADA DÍA: EL CONTRATISTA CONFIRMA QUE SÍ SE TRABAJÓ, O LO RECHAZA Y EL ADMIN DECIDE
export const REVISION = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  EN_DISPUTA: 'En disputa',
  DESCONTADA: 'Descontada',
};

// TEXTO Y COLOR DE CADA DÍA (EN LA LISTA Y EN EL CALENDARIO). UNA FALTA NO SE REVISA: YA NO CUENTA.
export const estiloDia = (dia: any): { texto: string; color: string } => {
  if (!dia.asistio) return { texto: 'Faltó', color: '#9CA3AF' };
  switch (dia.revision) {
    case REVISION.CONFIRMADA: return { texto: 'Confirmado', color: '#00D06C' };
    case REVISION.EN_DISPUTA: return { texto: 'En disputa (lo revisa el admin)', color: '#EA580C' };
    case REVISION.DESCONTADA: return { texto: 'Descontado', color: '#DC2626' };
    default: return { texto: 'Por revisar', color: '#F59E0B' };
  }
};

// CLAVE "AAAA-MM-DD" DEL DÍA (HORA DEL TELÉFONO). ES EL ID DE CADA DÍA DE LA BITÁCORA
export const claveDia = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

// DÍAS DE TRABAJO DE LA OBRA, ELEGIDOS AL PUBLICAR LA VACANTE (Y COPIADOS AL CONTRATO):
//   inicio_obra / fin_obra: 'AAAA-MM-DD' (fin VACÍO = SIN FECHA DE FIN; IGUAL AL INICIO = OBRA DE UN SOLO DÍA)
//   dias_obra: DÍAS DE LA SEMANA QUE SE TRABAJA ('Lun', 'Mar'...; VACÍO = TODOS)
// (NO CONFUNDIR CON fecha_inicio, QUE ES CUÁNDO SE ACEPTÓ EL TRATO.) LAS OBRAS VIEJAS NO LOS TIENEN: NO TIENEN LÍMITE.
export type DiasObra = { inicio: string; fin: string; dias: string[] };
export const diasObraDe = (c: any): DiasObra => ({ inicio: c?.inicio_obra || '', fin: c?.fin_obra || '', dias: c?.dias_obra || [] });

// 'AAAA-MM-DD' -> 'Lun', 'Mar'... (COMO EN DIAS_SEMANA)
export const diaDeSemana = (clave: string) => {
  const [a, m, d] = clave.split('-').map(Number);
  return DIAS_SEMANA[(new Date(a, m - 1, d).getDay() + 6) % 7];
};

// POR QUÉ HOY NO SE PUEDE LLENAR LA BITÁCORA ('' = SÍ SE PUEDE)
export const motivoSinBitacora = (contrato: any) => {
  const { inicio, fin, dias } = diasObraDe(contrato);
  const hoy = claveDia(new Date());
  if (inicio && hoy < inicio) return `La obra empieza el ${textoFecha(inicio)}. Desde ese día podrás llenar tu bitácora.`;
  if (fin && hoy > fin) return fin === inicio
    ? `Esta obra era solo del ${textoFecha(fin)}. Ya no hay días por registrar.`
    : `La obra era hasta el ${textoFecha(fin)}. Ya no hay días por registrar; si siguió, pide al contratista que cambie los días de trabajo.`;
  if (dias.length && !dias.includes(diaDeSemana(hoy))) return `Hoy no es día de trabajo en esta obra (se trabaja: ${textoDias(dias)}). La bitácora solo se llena los días de trabajo.`;
  return '';
};

// "Solo el lunes 10 de noviembre" / "Del lunes 10 de noviembre al viernes 14 de noviembre · Lun a Vie" / "Desde el ... · Lun, Mié"
export const textoDiasObra = (c: any) => {
  const { inicio, fin, dias } = diasObraDe(c);
  if (!inicio) return '';
  if (fin === inicio) return `Solo el ${textoFecha(inicio)}`;
  const rango = fin ? `Del ${textoFecha(inicio)} al ${textoFecha(fin)}` : `Desde el ${textoFecha(inicio)}`;
  return dias.length ? `${rango} · ${textoDias(dias)}` : rango;
};

// 'AAAA-MM-DD' -> "lunes 10 de noviembre"
export const textoFecha = (clave?: string) => {
  if (!clave || !/^\d{4}-\d{2}-\d{2}$/.test(clave)) return '';
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
};

// BITÁCORA DIARIA: VIVE DENTRO DE CADA CONTRATO (Postulaciones/{id}/Bitacora), ASÍ LAS DOS PARTES VEN LA MISMA
export const leerBitacora = async (idContrato: string) => {
  const snap = await getDocs(collection(db, 'Postulaciones', idContrato, 'Bitacora'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .map(d => ({ ...d, dia: claveDia(new Date(d.timestamp || 0)) }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

// UN SOLO REGISTRO POR DÍA: EL DOCUMENTO SE LLAMA COMO LA FECHA Y LAS REGLAS NO DEJAN REESCRIBIRLO
export const agregarABitacora = async (idContrato: string, entrada: {
  asistio: boolean; nota: string; evidencia: string | null;
  // CHECK DE UBICACIÓN: DÓNDE ESTABA EL TELÉFONO AL REGISTRAR Y A CUÁNTOS KM DE LA OBRA (null SI LA OBRA NO TIENE MAPA)
  ubicacion_registro: { latitud: number; longitud: number; precision: number | null; simulada: boolean } | null;
  distancia_obra_km: number | null;
  lugar_registro: string; // NOMBRE DEL LUGAR DONDE ESTABA ("Palmillas, San Felipe del Progreso")
}) => {
  const ahora = new Date();
  try {
    await setDoc(doc(db, 'Postulaciones', idContrato, 'Bitacora', claveDia(ahora)), {
      ...entrada,
      autor_id: auth.currentUser?.uid,
      fecha: ahora.toLocaleDateString('es-MX'),
      timestamp: ahora.getTime(),
    });
  } catch (error: any) {
    if (error?.code === 'permission-denied') throw new Error("Ya registraste el avance de hoy (solo se permite uno por día), o la obra ya no está activa.");
    throw error;
  }
};
