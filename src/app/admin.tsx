// PANEL DEL ADMINISTRADOR. 6 PESTAÑAS ABAJO, CADA UNA CON UNA SOLA COSA (SIN REPETIR INFORMACIÓN):
//   INICIO   = BUSCADOR GENERAL (PERSONAS, OBRAS, VACANTES Y REPORTES A LA VEZ) Y LO QUE HAY QUE ATENDER
//   REPORTES = TODOS LOS REPORTES, CON LAS DOS VERSIONES; CADA ADMIN "TOMA" SUS CASOS PARA NO PISARSE CON OTRO
//   USUARIOS = TRABAJADORES Y CONTRATISTAS (BUSCAR, FILTRAR POR ESTADO, ORDENAR)
//   OBRAS    = CONTRATOS (CADA UNO ABRE SU EXPEDIENTE: DINERO, REPORTES Y BITÁCORA) Y VACANTES
// LAS LISTAS SE MUESTRAN DE 20 EN 20 ("VER MÁS") PARA QUE EL PANEL SIGA RÁPIDO CON MUCHOS USUARIOS.
//   DATOS    = ANALÍTICA: GRÁFICAS DE USO DÍA CON DÍA (USUARIOS ACTIVOS, VACANTES, REPORTES, OFICIOS...)
//   MI CUENTA= MI PERFIL Y EL EQUIPO
// CÓDIGO DE COLORES FIJO:
//   REPORTES:  ROJO = CANCELACIÓN · NARANJA = BITÁCORA · MORADO = INCUMPLIMIENTO · VERDE AZULADO = PAGOS · AZUL = CHAT / OTROS
//   ESTADO:    ÁMBAR = POR RESOLVER · VERDE = RESUELTO
//   USUARIOS:  VERDE = TRABAJADOR · AZUL = CONTRATISTA · ROJO = CUENTA BLOQUEADA
// LAS PERSONAS SIEMPRE SE NOMBRAN CON SU ROL ("JOCELYN (TRABAJADOR)") PARA NO CONFUNDIR NOMBRES IGUALES.
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LogBox,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// IGNORAR EL ERROR FALSO DE FIREBASE WEBCHANNEL EN EXPO
LogBox.ignoreLogs(['@firebase/firestore', "WebChannelConnection RPC", "Name: undefined Message: undefined", "Could not reach Cloud Firestore backend"]);

// FIREBASE
// @ts-ignore
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { subirFotoACloudinary } from '@/lib/cloudinary';
import { eliminarCuentaEnServidor } from '@/lib/cuenta';
import { coincide } from '@/lib/busqueda';
import { accionContrato, adminPerfiles, gestionarEquipo, ajustesDePago, dineroYaPagado, ESTADOS, estiloDia, estiloEstado, leerBitacora, pagosPorConfirmar, resolverReporte, textoDiasObra, totalRecibido } from '@/lib/contratos';
import { ESTADOS_MEXICO } from '@/lib/ubicacion';
import { AnaliticaAdmin } from '@/components/analitica-admin';
import { ReporteFinanciero } from '@/components/reporte-financiero';
import { PerfilTrabajador, quitarUnaObra } from '@/components/perfil-trabajador';
import { VisorFoto } from '@/components/visor-foto';

// ---------------------------------------------------------------- COLORES Y TIPOS

const COLOR = {
  marino: '#0D2340',
  pendiente: '#F59E0B',
  resuelto: '#059669',
  trabajador: '#00A355',
  contratista: '#2563EB',
  bloqueada: '#DC2626',
};

type TipoReporte = 'cancelacion' | 'cierre' | 'bitacora' | 'incumplimiento' | 'pago' | 'otro';
const TIPOS_REPORTE: Record<TipoReporte, { texto: string; explicacion: string; color: string; icono: keyof typeof Ionicons.glyphMap }> = {
  cancelacion: { texto: 'Obras canceladas', explicacion: 'Alguien canceló una obra. Está detenida hasta que decidas si sigue o se cancela.', color: '#DC2626', icono: 'close-circle' },
  cierre: { texto: 'Faltas al cerrar obra', explicacion: 'La obra llegó a su último día con faltas. Decide si se descuentan; al resolver, la obra se da por terminada sola.', color: '#B45309', icono: 'calendar' },
  bitacora: { texto: 'Bitácora rechazada', explicacion: 'El contratista dice que un día de la bitácora no es cierto. Decide si el día cuenta.', color: '#EA580C', icono: 'reader' },
  incumplimiento: { texto: 'No cumplió lo acordado', explicacion: 'Una de las partes no cumplió (material, pago, horario...). Decide quién tiene razón.', color: '#7C3AED', icono: 'flag' },
  pago: { texto: 'Pagos', explicacion: 'Un trabajador dice que no le pagaron, o una obra terminó sin pago confirmado.', color: '#0D9488', icono: 'cash' },
  otro: { texto: 'Chat y otros', explicacion: 'Reportes del chat o del menú de ajustes (insultos, fraude, etc.).', color: '#2563EB', icono: 'chatbubbles' },
};

const esCancelacion = (q: any) => !!q?.id_contrato && (q.tipo === 'cancelacion' || (!q.tipo && q.motivo === 'Cancelación de obra'));
const tipoDe = (q: any): TipoReporte => esCancelacion(q) ? 'cancelacion' : (['cierre', 'bitacora', 'incumplimiento', 'pago'].includes(q.tipo) ? q.tipo : 'otro');

// LOS REPORTES VIEJOS DEL CHAT PUEDEN TRAER 'Desconocido' EN LUGAR DE UN USUARIO
const esUsuarioReal = (id?: string) => /^[A-Za-z0-9]{10,128}$/.test(id || '');

// FECHA DE UN REGISTRO EN MILISEGUNDOS (LOS USUARIOS TRAEN fecha_registro; LOS REPORTES, fecha_reporte)
const tiempo = (fecha?: string) => (fecha ? new Date(fecha).getTime() || 0 : 0);

// "JOCELYN (TRABAJADOR)"
const conRol =(nombre?: string, rol?: string) => `${nombre || 'Sin nombre'} (${(rol || 'usuario').toLowerCase()})`;

// QUÉ PUEDE DECIDIR EL ADMIN EN CADA TIPO DE REPORTE. favorece = QUIÉN TIENE LA RAZÓN CON ESA DECISIÓN
type Opcion = { valor: string; texto: string; color: string; favorece: 'reportante' | 'acusado' | null };
const opcionesDeReporte = (q: any): Opcion[] => {
  const reporta = conRol(q.nombre_reportante, q.rol_reportante);
  const reportado = conRol(q.acusado, q.rol_acusado);
  if (esCancelacion(q)) return [
    { valor: 'admin_reactivar', texto: 'Que la obra SIGA (reactivarla)', color: '#059669', favorece: null },
    { valor: 'admin_cancelar', texto: 'Cancelar la obra para siempre', color: '#DC2626', favorece: null },
  ];
  if (q.tipo === 'bitacora') return [
    { valor: 'a_favor_trabajador', texto: `Tiene razón ${reportado}: el día SÍ cuenta`, color: '#059669', favorece: 'acusado' },
    { valor: 'a_favor_contratista', texto: `Tiene razón ${reporta}: el día NO cuenta`, color: '#DC2626', favorece: 'reportante' },
  ];
  // FALTAS AL CERRAR LA OBRA: EN CUALQUIER CASO, AL RESOLVER LA OBRA SE DA POR TERMINADA
  if (q.tipo === 'cierre') return [
    { valor: 'procede', texto: `Las faltas son ciertas (puedes descontar del pago a ${reportado})`, color: '#DC2626', favorece: 'reportante' },
    { valor: 'no_procede', texto: `${reportado} sí trabajó esos días (no se descuenta)`, color: '#059669', favorece: 'acusado' },
  ];
  return [
    { valor: 'procede', texto: `Tiene razón ${reporta}`, color: '#059669', favorece: 'reportante' },
    { valor: 'no_procede', texto: `Tiene razón ${reportado}`, color: '#6B7280', favorece: 'acusado' },
  ];
};

// GRUPOS SENCILLOS PARA FILTRAR OBRAS (EN LUGAR DE LOS 8 ESTADOS TÉCNICOS)
const GRUPOS_OBRA: { clave: string; texto: string; color: string; estados: string[] }[] = [
  { clave: 'curso', texto: 'En curso', color: '#00D06C', estados: [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN] },
  { clave: 'detenidas', texto: 'Detenidas', color: '#DC2626', estados: [ESTADOS.SUSPENDIDA] },
  { clave: 'sin_aceptar', texto: 'Sin aceptar', color: '#3B82F6', estados: [ESTADOS.PROPUESTA, ESTADOS.PENDIENTE] },
  { clave: 'terminadas', texto: 'Terminadas', color: COLOR.marino, estados: [ESTADOS.FINALIZADA] },
  { clave: 'canceladas', texto: 'Canceladas', color: '#6B7280', estados: [ESTADOS.CANCELADA, ESTADOS.RECHAZADA] },
];

const PESTAÑAS = [
  { clave: 'Inicio', icono: 'home' },
  { clave: 'Reportes', icono: 'shield' },
  { clave: 'Usuarios', icono: 'people' },
  { clave: 'Obras', icono: 'construct' },
  { clave: 'Datos', icono: 'bar-chart' },
  { clave: 'Mi cuenta', icono: 'person-circle' },
] as const;

export default function AdminDashboard() {
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [pestañaActiva, setPestañaActiva] = useState('Inicio');
  // ADMIN PRINCIPAL (EL QUE SE CREÓ EN LA CONSOLA) O PERSONAL DE MONITOREO (LO DIO DE ALTA EL PRINCIPAL)
  const [esPrincipal, setEsPrincipal] = useState(true);
  const esPrincipalRef = useRef(true);
  const miRegistroRef = useRef<any>(null);

  // FILTROS DE CADA PESTAÑA
  const [vistaReportes, setVistaReportes] = useState<'Pendientes' | 'Historial'>('Pendientes');
  const [filtroTipo, setFiltroTipo] = useState<TipoReporte | 'todos'>('todos');
  const [vistaUsuarios, setVistaUsuarios] = useState<'Trabajadores' | 'Contratistas'>('Trabajadores');
  const [busquedaUsuarios, setBusquedaUsuarios] = useState('');
  const [soloBloqueadas, setSoloBloqueadas] = useState(false);
  const [vistaObras, setVistaObras] = useState<'Contratos' | 'Vacantes'>('Contratos');
  const [grupoObra, setGrupoObra] = useState('curso');
  // BUSCADORES Y FILTROS (PENSADOS PARA MUCHOS USUARIOS: SE BUSCA SIN IMPORTAR ACENTOS NI UNA LETRA EQUIVOCADA)
  const [busquedaGlobal, setBusquedaGlobal] = useState('');          // INICIO: BUSCA EN TODO A LA VEZ
  const [busquedaReportes, setBusquedaReportes] = useState('');
  const [asignacion, setAsignacion] = useState<'todos' | 'mios' | 'sin_asignar'>('todos');
  const [periodoReportes, setPeriodoReportes] = useState<'todo' | '7' | '30'>('todo');
  const [ordenReportes, setOrdenReportes] = useState<'antiguos' | 'recientes'>('antiguos'); // LOS QUE MÁS LLEVAN ESPERANDO PRIMERO
  const [estadoUsuarios, setEstadoUsuarios] = useState('');          // ESTADO DE LA REPÚBLICA ('' = TODOS)
  const [ordenUsuarios, setOrdenUsuarios] = useState<'recientes' | 'calificacion' | 'reportes' | 'nombre'>('recientes');
  const [busquedaObras, setBusquedaObras] = useState('');
  const [busquedaVacantes, setBusquedaVacantes] = useState('');
  const [filtroVacantes, setFiltroVacantes] = useState<'todas' | 'Activa' | 'Cerrada'>('todas');
  // CUÁNTOS SE MUESTRAN DE CADA LISTA (DE 20 EN 20, CON "VER MÁS"): CON MILES DE REGISTROS LA PANTALLA SIGUE RÁPIDA
  const [limites, setLimites] = useState<Record<string, number>>({});
  // EXPEDIENTE DE UNA OBRA: TODO JUNTO (PARTES, DÍAS, PAGOS, BITÁCORA Y REPORTES)
  const [obraExpandida, setObraExpandida] = useState<any>(null);
  const [bitacoraObra, setBitacoraObra] = useState<any[] | null>(null);

  // DATOS DEL SISTEMA
  const [adminData, setAdminData] = useState<any>({ nombre: 'Administrador Principal', cargo: 'Super Admin', foto: '' });
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [contratistas, setContratistas] = useState<any[]>([]);
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  // PESTAÑA DATOS: ANALÍTICA DE USO O ESTADO DE RESULTADOS
  const [vistaDatos, setVistaDatos] = useState<'Uso de la app' | 'Reporte financiero'>('Uso de la app');
  const [quejas, setQuejas] = useState<any[]>([]);
  const [personalSoporte, setPersonalSoporte] = useState<any[]>([]);

  const [usuarioExpandido, setUsuarioExpandido] = useState<any>(null);
  const [vacanteExpandida, setVacanteExpandida] = useState<any>(null);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);

  // VENTANA PARA RESOLVER UN REPORTE: DECISIÓN, AJUSTE DE DINERO, BLOQUEO Y NOTA PARA LAS DOS PARTES
  const [quejaResolviendo, setQuejaResolviendo] = useState<any>(null);
  const [decision, setDecision] = useState('');
  const [notaAdmin, setNotaAdmin] = useState('');
  const [ajuste, setAjuste] = useState('');
  const [devolver, setDevolver] = useState(''); // AL CANCELAR UNA OBRA: PESOS QUE EL TRABAJADOR DEVUELVE DE LO YA PAGADO
  const [bloquear, setBloquear] = useState(false);
  const [responsable, setResponsable] = useState<'quien_cancelo' | 'otra_parte' | 'nadie' | ''>(''); // CULPA DE UNA CANCELACIÓN

  const [modalEditarAdmin, setModalEditarAdmin] = useState(false);
  const [editAdminNombre, setEditAdminNombre] = useState('');
  const [editAdminCargo, setEditAdminCargo] = useState('');

  const [modalCrear, setModalCrear] = useState(false);
  const [nuevoRol, setNuevoRol] = useState('Soporte Técnico');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCorreo, setNuevoCorreo] = useState('');

  const cargarDatosAdmin = async () => {
    try {
      // TODAS LAS LECTURAS AL MISMO TIEMPO PARA QUE CARGUE RÁPIDO
      const adminRef = doc(db, 'Sistema', 'AdminProfile');
      const [adminDoc, snapTrabajadores, snapContratistas, snapVacantes, snapContratos, snapQuejas, snapSoporte] = await Promise.all([
        getDoc(adminRef),
        getDocs(collection(db, 'Usuarios')),
        getDocs(collection(db, 'Contratistas')),
        getDocs(collection(db, 'Vacantes')),
        getDocs(collection(db, 'Postulaciones')),
        getDocs(collection(db, 'Quejas_Soporte')),
        getDocs(collection(db, 'Equipo_Soporte')),
      ]);

      // EL PRINCIPAL VE Y EDITA EL PERFIL DEL PANEL (Sistema/AdminProfile); EL PERSONAL VE SUS PROPIOS DATOS
      if (!esPrincipalRef.current) {
        setAdminData({ nombre: miRegistroRef.current?.nombre || 'Personal', cargo: miRegistroRef.current?.puesto || 'Monitoreo', foto: '' });
      } else if (adminDoc.exists()) {
        setAdminData(adminDoc.data());
        setEditAdminNombre(adminDoc.data().nombre || '');
        setEditAdminCargo(adminDoc.data().cargo || 'Super Admin');
      } else {
        await setDoc(adminRef, { nombre: 'Administrador Principal', cargo: 'Super Admin', foto: '' });
        setEditAdminNombre('Administrador Principal');
        setEditAdminCargo('Super Admin');
      }

      setTrabajadores(snapTrabajadores.docs.map(d => ({ id: d.id, rol: 'Trabajador', ...d.data() })));
      setContratistas(snapContratistas.docs.map(d => ({ id: d.id, rol: 'Contratista', ...d.data() })));
      setVacantes(snapVacantes.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime()));
      setContratos(snapContratos.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      setQuejas(snapQuejas.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => new Date(b.fecha_reporte).getTime() - new Date(a.fecha_reporte).getTime()));
      setPersonalSoporte(snapSoporte.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { console.log("Error cargando panel admin:", error); } finally { setCargando(false); }
  };

  const refrescar = async () => { setRefrescando(true); await cargarDatosAdmin(); setRefrescando(false); };

  // SOLO ENTRA QUIEN TIENE SESIÓN Y UN DOCUMENTO EN /Administradores/{uid} (SE CREA A MANO EN LA CONSOLA DE FIREBASE).
  // LAS REGLAS DE FIRESTORE HACEN LA MISMA REVISIÓN DEL LADO DEL SERVIDOR; ESTO SOLO EVITA MOSTRAR UNA PANTALLA VACÍA.
  useEffect(() => {
    const verificarAccesoAdmin = async () => {
      const usuarioActual = auth.currentUser;
      if (!usuarioActual) { router.replace('/' as any); return; }
      try {
        const adminDoc = await getDoc(doc(db, 'Administradores', usuarioActual.uid));
        if (!adminDoc.exists()) { await signOut(auth); router.replace('/' as any); return; }
        // ¿PRINCIPAL O PERSONAL DE MONITOREO? (EL PERSONAL TIENE principal: false Y NO PUEDE AGREGAR A OTROS NI BORRAR CUENTAS)
        const principal = adminDoc.data().principal !== false;
        esPrincipalRef.current = principal;
        miRegistroRef.current = adminDoc.data();
        setEsPrincipal(principal);
        if (!principal) {
          // QUEDA REGISTRADO QUE LA PERSONA YA ENTRÓ (YA CREÓ SU CONTRASEÑA CON EL CORREO)
          updateDoc(doc(db, 'Equipo_Soporte', usuarioActual.uid), { estado_cuenta: 'Activa', ultimo_acceso: new Date().toISOString() }).catch(() => {});
        }
        await cargarDatosAdmin();
      } catch (error) {
        console.log("Error verificando acceso de administrador:", error);
        router.replace('/' as any);
      }
    };
    verificarAccesoAdmin();
  }, []);

  const cerrarSesionAdmin = () => {
    Alert.alert("Cerrar sesión", "¿Salir del panel de administración?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", onPress: async () => { await signOut(auth); router.replace('/' as any); } },
    ]);
  };

  const cambiarFotoAdmin = async () => {
    // SIN allowsEditing: NO APARECE LA PANTALLA DE RECORTE ("CORTAR")
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      Alert.alert("Actualizar Foto", "¿Deseas cambiar tu foto de administrador?", [
        { text: "Cancelar", style: "cancel" },
        { text: "OK", onPress: async () => {
            setProcesando(true);
            try {
              const urlSegura = await subirFotoACloudinary(`data:image/jpeg;base64,${result.assets[0].base64}`);
              await updateDoc(doc(db, 'Sistema', 'AdminProfile'), { foto: urlSegura });
              await cargarDatosAdmin();
            } catch (error: any) { Alert.alert("No se pudo cambiar la foto", error?.message || "Intenta de nuevo."); }
            setProcesando(false);
          }
        }
      ]);
    }
  };

  const guardarPerfilAdmin = async () => {
    setProcesando(true);
    await updateDoc(doc(db, 'Sistema', 'AdminProfile'), { nombre: editAdminNombre, cargo: editAdminCargo });
    await cargarDatosAdmin();
    setProcesando(false);
    setModalEditarAdmin(false);
  };

  // DA DE ALTA A UNA PERSONA DEL PERSONAL: EL SERVIDOR LE CREA SU CUENTA (SIN INE) Y FIREBASE LE MANDA UN CORREO
  // PARA QUE CREE SU CONTRASEÑA. SOLO QUIEN TIENE ACCESO A ESE CORREO PUEDE ENTRAR.
  const crearPersonalMonitoreo = async () => {
    if (!nuevoNombre.trim() || !nuevoCorreo.trim()) { Alert.alert("Faltan datos", "Escribe el nombre y el correo."); return; }
    setProcesando(true);
    try {
      await gestionarEquipo('invitar', { nombre: nuevoNombre.trim(), correo: nuevoCorreo.trim(), puesto: nuevoRol });
      Alert.alert("Invitación enviada", `Le llegó un correo a ${nuevoCorreo.trim()} para crear su contraseña (que revise también "Spam"). Después entra a PalanteMX con ese correo y su contraseña, y verá el panel de administración.`);
      setModalCrear(false); setNuevoNombre(''); setNuevoCorreo('');
      await cargarDatosAdmin();
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  const accionEquipo = (s: any, accion: 'reenviar' | 'quitar') => {
    const quitar = accion === 'quitar';
    Alert.alert(quitar ? "Quitar del personal" : "Reenviar correo", quitar
      ? `¿Quitarle el acceso a ${s.nombre}? Su cuenta se borra y ya no podrá entrar al panel.`
      : `¿Volver a mandar a ${s.correo} el correo para crear su contraseña?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí", style: quitar ? 'destructive' : 'default', onPress: async () => {
          setProcesando(true);
          try {
            await gestionarEquipo(accion, { uid: s.id });
            if (quitar) await cargarDatosAdmin();
            Alert.alert("Listo", quitar ? "Se le quitó el acceso." : "Se volvió a mandar el correo.");
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  const alternarBloqueoUsuario = (usuario: any) => {
    const coleccion = usuario.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas';
    const nuevoEstado = usuario.estado_cuenta === 'Bloqueada' ? 'Activa' : 'Bloqueada';
    Alert.alert(nuevoEstado === 'Bloqueada' ? "Bloquear cuenta" : "Desbloquear cuenta", `¿${nuevoEstado === 'Bloqueada' ? 'Bloquear' : 'Desbloquear'} la cuenta de ${conRol(usuario.nombre, usuario.rol)}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí", style: nuevoEstado === 'Bloqueada' ? 'destructive' : 'default', onPress: async () => {
          setProcesando(true);
          try {
            await updateDoc(doc(db, coleccion, usuario.id), { estado_cuenta: nuevoEstado });
            await cargarDatosAdmin();
            setUsuarioExpandido({ ...usuario, estado_cuenta: nuevoEstado });
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // BORRA LA CUENTA COMPLETA DE UN USUARIO (PERFIL, DATOS PRIVADOS, FOTOS DE INE Y SU USUARIO DE FIREBASE)
  const eliminarUsuarioCompleto = (usuario: any) => {
    Alert.alert("ELIMINAR CUENTA", `¿Eliminar a ${conRol(usuario.nombre, usuario.rol)} para siempre? Se borra su perfil, sus datos de verificación y su acceso.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: 'destructive', onPress: async () => {
          setProcesando(true);
          try {
            await eliminarCuentaEnServidor(usuario.id);
            setUsuarioExpandido(null);
            await cargarDatosAdmin();
          } catch (error: any) { Alert.alert("Error", error?.message || "No se pudo eliminar la cuenta."); }
          setProcesando(false);
        }
      }
    ]);
  };

  const eliminarVacante = (id: string) => {
    Alert.alert("Eliminar vacante", "¿Eliminar esta vacante del sistema?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: 'destructive', onPress: async () => {
          setProcesando(true);
          try { await deleteDoc(doc(db, 'Vacantes', id)); setVacanteExpandida(null); await cargarDatosAdmin(); }
          catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  const eliminarObraDeUsuario = (idUsuario: string, obra: any) => {
    Alert.alert("Borrar obra del portafolio", `¿Eliminar "${obra.titulo}" del portafolio de este usuario?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          setProcesando(true);
          try {
            const userRef = doc(db, 'Usuarios', idUsuario);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
              const portafolioActualizado = quitarUnaObra(userDoc.data().portafolio || [], obra);
              await updateDoc(userRef, { portafolio: portafolioActualizado });
              await cargarDatosAdmin();
              setUsuarioExpandido({ ...usuarioExpandido, portafolio: portafolioActualizado });
            }
          } catch (error) { Alert.alert("Error", "No se pudo borrar."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // CORRIGE LA COPIA DE RESEÑAS Y OBRAS DE UN PERFIL (BORRAR UNA RESEÑA U OBRA, O RECALCULAR TODO) Y LO VUELVE A MOSTRAR
  const corregirPerfil = (titulo: string, pregunta: string, accion: 'eliminar_resena' | 'eliminar_obra' | 'recalcular', datos: { uid?: string; id_resena?: string; id_contrato?: string }) => {
    Alert.alert(titulo, pregunta, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí", style: accion === 'recalcular' ? 'default' : 'destructive', onPress: async () => {
          setProcesando(true);
          try {
            await adminPerfiles(accion, datos);
            await cargarDatosAdmin();
            const u = usuarioExpandido;
            const fresco = await getDoc(doc(db, u.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas', u.id));
            if (fresco.exists()) setUsuarioExpandido({ id: fresco.id, rol: u.rol, ...fresco.data() });
            Alert.alert("Listo", accion === 'recalcular' ? "Se recalcularon sus reseñas, su calificación y sus obras." : "Se quitó y la calificación se recalculó.");
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // DESPUÉS DE BORRAR COSAS A MANO EN FIREBASE (P. EJ. PARA EMPEZAR PRUEBAS DE CERO), REARMA TODOS LOS PERFILES
  const recalcularTodos = () => {
    Alert.alert("Recalcular todos los perfiles", "Se vuelven a calcular las reseñas, calificaciones y obras terminadas de todos los usuarios, con lo que de verdad existe en Firebase. Úsalo después de borrar reseñas u obras directo en Firebase.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Recalcular", onPress: async () => {
          setProcesando(true);
          try {
            const r = await adminPerfiles('recalcular_todos');
            await cargarDatosAdmin();
            Alert.alert("Listo", `Se recalcularon ${r.perfiles || 0} perfiles.`);
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // ABRE EL PERFIL DE QUIEN REPORTA O DE QUIEN FUE REPORTADO (PARA NO CONFUNDIR PERSONAS CON EL MISMO NOMBRE)
  const verPerfilDe = (id: string) => {
    const usuario = [...trabajadores, ...contratistas].find(u => u.id === id);
    if (usuario) setUsuarioExpandido(usuario);
    else Alert.alert("Perfil no encontrado", "Esta cuenta ya no existe o fue eliminada.");
  };

  const abrirResolucion = (queja: any) => { setQuejaResolviendo(queja); setDecision(''); setNotaAdmin(''); setAjuste(''); setDevolver(''); setBloquear(false); setResponsable(''); };

  // QUIÉN SOY (PARA "TOMAR EL CASO" Y QUE DOS ADMINS NO ATIENDAN EL MISMO REPORTE A LA VEZ)
  const miUid = auth.currentUser?.uid || '';
  const miNombre = esPrincipal ? (adminData.nombre || 'Administrador Principal') : (miRegistroRef.current?.nombre || 'Personal');
  const tomarCaso = async (queja: any, tomar: boolean) => {
    if (tomar && queja.asignado_a?.uid && queja.asignado_a.uid !== miUid) {
      const seguir = await new Promise<boolean>(r => Alert.alert("Caso tomado", `Este caso ya lo está atendiendo ${queja.asignado_a.nombre}. ¿Lo tomas tú?`, [
        { text: "No", style: "cancel", onPress: () => r(false) }, { text: "Sí, tomarlo", onPress: () => r(true) },
      ]));
      if (!seguir) return;
    }
    setProcesando(true);
    try {
      const asignado_a = tomar ? { uid: miUid, nombre: miNombre, fecha: new Date().toISOString() } : null;
      await updateDoc(doc(db, 'Quejas_Soporte', queja.id), { asignado_a });
      setQuejas(lista => lista.map(q => q.id === queja.id ? { ...q, asignado_a } : q));
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  // EXPEDIENTE DE UNA OBRA: SE LEE SU BITÁCORA AL ABRIRLO (LO DEMÁS YA ESTÁ CARGADO)
  const abrirExpediente = async (contrato: any) => {
    setObraExpandida(contrato);
    setBitacoraObra(null);
    try { setBitacoraObra(await leerBitacora(contrato.id)); } catch { setBitacoraObra([]); }
  };
  const abrirExpedientePorId = (idContrato?: string) => {
    const contrato = contratos.find(c => c.id === idContrato);
    if (contrato) abrirExpediente(contrato);
    else Alert.alert("Obra no encontrada", "Esta obra ya no existe.");
  };

  // "VER MÁS" DE CADA LISTA
  const limiteDe = (clave: string) => limites[clave] || 20;
  const verMas = (clave: string) => setLimites(l => ({ ...l, [clave]: limiteDe(clave) + 20 }));

  // QUIÉN TIENE LA RAZÓN CON LA DECISIÓN ELEGIDA, Y QUIÉN NO
  const opcionElegida = quejaResolviendo ? opcionesDeReporte(quejaResolviendo).find(o => o.valor === decision) : undefined;
  const ganador = opcionElegida?.favorece === 'reportante' ? { nombre: quejaResolviendo?.nombre_reportante, rol: quejaResolviendo?.rol_reportante }
    : opcionElegida?.favorece === 'acusado' ? { nombre: quejaResolviendo?.acusado, rol: quejaResolviendo?.rol_acusado } : null;
  const perdedor = opcionElegida?.favorece === 'reportante' ? { nombre: quejaResolviendo?.acusado, rol: quejaResolviendo?.rol_acusado }
    : opcionElegida?.favorece === 'acusado' ? { nombre: quejaResolviendo?.nombre_reportante, rol: quejaResolviendo?.rol_reportante } : null;
  // EL AJUSTE DE DINERO SOLO EXISTE EN REPORTES DE UNA OBRA (HAY UN PAGO DEL CONTRATISTA AL TRABAJADOR QUE AJUSTAR)
  const permiteAjuste = !!quejaResolviendo?.id_contrato && !esCancelacion(quejaResolviendo) && !!ganador;
  const trabajadorDeQueja = quejaResolviendo?.rol_reportante === 'Trabajador' ? quejaResolviendo?.nombre_reportante : quejaResolviendo?.acusado;
  const contratistaDeQueja = quejaResolviendo?.rol_reportante === 'Contratista' ? quejaResolviendo?.nombre_reportante : quejaResolviendo?.acusado;
  // DINERO QUE YA SE HABÍA PAGADO AL CANCELARSE LA OBRA (LOS REPORTES NUEVOS LO TRAEN)
  const montoPagado: number = esCancelacion(quejaResolviendo) ? quejaResolviendo?.monto_pagado || 0 : 0;

  // RESUELVE EL REPORTE EN EL SERVIDOR: CAMBIA LA OBRA O EL DÍA DE BITÁCORA SI TOCA, APLICA EL AJUSTE, BLOQUEA SI SE PIDIÓ,
  // ARCHIVA EL REPORTE Y LES MANDA UNA NOTIFICACIÓN CON LA NOTA A LAS DOS PARTES
  const confirmarResolucion = async () => {
    if (!decision) { Alert.alert("Aviso", "Elige tu decisión."); return; }
    if (esCancelacion(quejaResolviendo) && !responsable) { Alert.alert("Aviso", "Indica quién tuvo la culpa de la cancelación (o que nadie)."); return; }
    if (esCancelacion(quejaResolviendo) && decision === 'admin_cancelar' && montoPagado > 0 && devolver === '') { Alert.alert("Aviso", `Ya se habían pagado $${montoPagado.toLocaleString('es-MX')}. Indica cuánto debe devolver el trabajador (0 si se lo queda).`); return; }
    if (!notaAdmin.trim()) { Alert.alert("Aviso", "Escribe una nota explicando tu decisión. Les llegará a las dos partes."); return; }
    // LO JUSTO ES ESCUCHAR A LOS DOS: SI LA PERSONA REPORTADA NO HA DADO SU VERSIÓN, SE PIDE CONFIRMAR
    if (!quejaResolviendo.version_acusado && esUsuarioReal(quejaResolviendo.id_acusado)) {
      const seguir = await new Promise<boolean>(r => Alert.alert("Falta una versión", `${conRol(quejaResolviendo.acusado, quejaResolviendo.rol_acusado)} todavía no da su versión. ¿Decidir de todos modos?`, [
        { text: "Esperar", style: "cancel", onPress: () => r(false) }, { text: "Decidir ya", style: 'destructive', onPress: () => r(true) },
      ]));
      if (!seguir) return;
    }
    setProcesando(true);
    try {
      let obraTerminada = false;
      if (esCancelacion(quejaResolviendo)) {
        await accionContrato(decision as 'admin_reactivar' | 'admin_cancelar', {
          id_contrato: quejaResolviendo.id_contrato, nota: notaAdmin.trim(), devolver: decision === 'admin_cancelar' ? parseInt(devolver) || 0 : 0,
          responsable: responsable || 'nadie', bloquear: bloquear && responsable !== 'nadie',
        });
      } else {
        obraTerminada = !!(await resolverReporte(quejaResolviendo.id, decision, notaAdmin.trim(), permiteAjuste ? parseInt(ajuste) || 0 : 0, bloquear))?.obra_terminada;
      }
      setQuejaResolviendo(null);
      await cargarDatosAdmin();
      Alert.alert("Reporte resuelto", `Se guardó en el historial y se les avisó a las dos partes.${obraTerminada ? ' La obra ya no tenía más pendientes: quedó terminada y pasó al portafolio de los dos.' : ''}`);
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  if (cargando) { return ( <View style={styles.loadingCenter}><ActivityIndicator size="large" color={COLOR.marino} /><Text style={styles.loadingText}>Cargando el panel...</Text></View> ); }

  // ---------------------------------------------------------------- CÁLCULOS

  const quejasPendientes = quejas.filter(q => q.estado !== 'Resuelta');
  const quejasResueltas = quejas.filter(q => q.estado === 'Resuelta');
  const pendientesDe = (t: TipoReporte) => quejasPendientes.filter(q => tipoDe(q) === t).length;
  const misCasos = quejasPendientes.filter(q => q.asignado_a?.uid === miUid).length;

  // TEXTO EN EL QUE SE BUSCA CADA COSA (NOMBRES, CORREOS, TELÉFONOS, TÍTULOS, IDS...)
  const textoUsuario = (u: any) => `${u.nombre} ${u.apellidos} ${u.correo || ''} ${u.numero_telefono || ''} ${u.nombre_usuario || ''} ${u.oficio_principal || ''} ${u.empresa || ''} ${u.ubicacion_texto || ''} ${u.ubicacion_estado || ''} ${u.id}`;
  const textoContrato = (c: any) => `${c.titulo_vacante || c.vacante?.titulo || ''} ${c.nombre_trabajador || ''} ${c.contratista || c.vacante?.contratista || ''} ${c.vacante?.ubicacion || ''} ${c.vacante?.oficio || ''} ${c.id}`;
  const textoVacante = (v: any) => `${v.titulo} ${v.contratista || ''} ${v.empresa || ''} ${v.categoria || ''} ${v.ubicacion || ''} ${v.estado_republica || ''} ${v.id}`;
  const textoReporte = (q: any) => `${q.motivo || ''} ${q.titulo_obra || ''} ${q.nombre_reportante || ''} ${q.acusado || ''} ${q.descripcion || ''} ${q.asignado_a?.nombre || ''} ${q.id} ${q.id_contrato || ''}`;

  const desde = periodoReportes === 'todo' ? 0 : Date.now() - parseInt(periodoReportes) * 24 * 60 * 60 * 1000;
  const reportesVisibles = (vistaReportes === 'Pendientes' ? quejasPendientes : quejasResueltas)
    .filter(q => filtroTipo === 'todos' || tipoDe(q) === filtroTipo)
    .filter(q => asignacion === 'todos' || (asignacion === 'mios' ? q.asignado_a?.uid === miUid : !q.asignado_a?.uid))
    .filter(q => tiempo(q.fecha_reporte) >= desde)
    .filter(q => coincide(textoReporte(q), busquedaReportes))
    // POR RESOLVER: LOS MÁS VIEJOS PRIMERO (LLEVAN MÁS TIEMPO ESPERANDO); YA RESUELTOS: LOS MÁS NUEVOS PRIMERO
    .sort((a, b) => {
      const antiguos = vistaReportes === 'Pendientes' ? ordenReportes === 'antiguos' : ordenReportes !== 'antiguos';
      return antiguos ? tiempo(a.fecha_reporte) - tiempo(b.fecha_reporte) : tiempo(b.fecha_reporte) - tiempo(a.fecha_reporte);
    });

  const reportesContra = (id: string) => quejas.filter(q => q.id_acusado === id);
  // CANCELACIONES TARDÍAS (CON MENOS DE 48 HORAS DE AVISO) QUE HIZO CADA PERSONA: SIRVEN PARA DECIDIR SANCIONES
  const cancelacionesTardiasDe = (id: string) => contratos.filter(c => c.cancelado_por === id && c.cancelacion_tardia).length;
  const usuariosVisibles = (vistaUsuarios === 'Trabajadores' ? trabajadores : contratistas)
    .filter(u => !soloBloqueadas || u.estado_cuenta === 'Bloqueada')
    .filter(u => !estadoUsuarios || u.ubicacion_estado === estadoUsuarios)
    .filter(u => coincide(textoUsuario(u), busquedaUsuarios))
    .sort((a, b) => {
      if (ordenUsuarios === 'calificacion') return (parseFloat(b.calificacion) || 0) - (parseFloat(a.calificacion) || 0);
      if (ordenUsuarios === 'reportes') return reportesContra(b.id).length - reportesContra(a.id).length;
      if (ordenUsuarios === 'nombre') return `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`, 'es');
      return tiempo(b.fecha_registro) - tiempo(a.fecha_registro);
    });
  const estadosConUsuarios = [...new Set([...trabajadores, ...contratistas].map(u => u.ubicacion_estado).filter(Boolean))].sort((a, b) => ESTADOS_MEXICO.indexOf(a) - ESTADOS_MEXICO.indexOf(b));

  const grupo = GRUPOS_OBRA.find(g => g.clave === grupoObra) || GRUPOS_OBRA[0];
  const contratosVisibles = contratos.filter(c => grupo.estados.includes(c.estado)).filter(c => coincide(textoContrato(c), busquedaObras));
  const enGrupo = (g: typeof GRUPOS_OBRA[number]) => contratos.filter(c => g.estados.includes(c.estado)).length;
  const vacantesVisibles = vacantes.filter(v => filtroVacantes === 'todas' || v.estado === filtroVacantes).filter(v => coincide(textoVacante(v), busquedaVacantes));

  // BUSCADOR GENERAL DEL INICIO: LO PRIMERO QUE COINCIDE EN CADA LUGAR (CON 2 LETRAS O MÁS)
  const hayBusquedaGlobal = busquedaGlobal.trim().length >= 2;
  const encontrados = hayBusquedaGlobal ? {
    usuarios: [...trabajadores, ...contratistas].filter(u => coincide(textoUsuario(u), busquedaGlobal)),
    obras: contratos.filter(c => coincide(textoContrato(c), busquedaGlobal)),
    vacantes: vacantes.filter(v => coincide(textoVacante(v), busquedaGlobal)),
    reportes: quejas.filter(q => coincide(textoReporte(q), busquedaGlobal)),
  } : null;
  const reportesDeObra = (idContrato: string) => quejas.filter(q => q.id_contrato === idContrato);
  const obrasEnCursoDe = (idTrabajador: string) => contratos.filter(c => c.id_trabajador === idTrabajador && [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.SUSPENDIDA].includes(c.estado));

  // ---------------------------------------------------------------- PIEZAS DE INTERFAZ

  const Segmentos = <T extends string>({ opciones, valor, onCambio }: { opciones: { valor: T; texto: string }[]; valor: T; onCambio: (v: T) => void }) => (
    <View style={styles.segmentos}>
      {opciones.map(o => (
        <TouchableOpacity key={o.valor} style={[styles.segmento, valor === o.valor && styles.segmentoActivo]} onPress={() => onCambio(o.valor)}>
          <Text style={[styles.segmentoTexto, valor === o.valor && styles.segmentoTextoActivo]}>{o.texto}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const Chip = ({ texto, color, activo, onPress }: { texto: string; color: string; activo: boolean; onPress: () => void }) => (
    <TouchableOpacity style={[styles.chip, { borderColor: color }, activo && { backgroundColor: color }]} onPress={onPress}>
      <Text style={[styles.chipTexto, { color: activo ? '#FFF' : color }]}>{texto}</Text>
    </TouchableOpacity>
  );

  const Etiqueta = ({ texto, color, fondo }: { texto: string; color: string; fondo?: string }) => (
    <View style={[styles.etiqueta, { backgroundColor: fondo || color }]}><Text style={[styles.etiquetaTexto, { color: fondo ? color : '#FFF' }]}>{texto}</Text></View>
  );

  // OJO: SE LLAMA COMO FUNCIÓN (NO COMO <Buscador />) PARA QUE EL TECLADO NO SE CIERRE AL ESCRIBIR CADA LETRA
  const buscador = (valor: string, onCambio: (t: string) => void, placeholder: string) => (
    <View style={styles.buscador}>
      <Ionicons name="search" size={18} color="#9CA3AF" />
      <TextInput style={styles.buscadorInput} placeholder={placeholder} value={valor} onChangeText={onCambio} autoCorrect={false} />
      {valor ? <TouchableOpacity onPress={() => onCambio('')}><Ionicons name="close-circle" size={18} color="#9CA3AF" /></TouchableOpacity> : null}
    </View>
  );

  // MUESTRA LOS PRIMEROS 20 DE UNA LISTA Y UN BOTÓN "VER MÁS" PARA LOS SIGUIENTES
  const paginado = <T,>(clave: string, lista: T[], dibujar: (x: T) => React.ReactNode, vacio: string) => (
    <>
      {lista.length > 0 && <Text style={styles.conteo}>{lista.length} resultado{lista.length === 1 ? '' : 's'}</Text>}
      {lista.slice(0, limiteDe(clave)).map(dibujar)}
      {lista.length > limiteDe(clave) && (
        <TouchableOpacity style={styles.verMas} onPress={() => verMas(clave)}>
          <Text style={styles.verMasTexto}>Ver más (faltan {lista.length - limiteDe(clave)})</Text>
        </TouchableOpacity>
      )}
      {lista.length === 0 && <Text style={styles.vacioTexto}>{vacio}</Text>}
    </>
  );

  const fotosDe = (q: any): string[] => [...new Set([q.foto_evidencia, ...(q.fotos_evidencia || [])].filter(Boolean))];

  const TarjetaReporte = ({ queja }: { queja: any }) => {
    const tipo = TIPOS_REPORTE[tipoDe(queja)];
    const resuelta = queja.estado === 'Resuelta';
    return (
      <View style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: tipo.color }]}>
        <View style={styles.filaEntre}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Ionicons name={tipo.icono} size={16} color={tipo.color} />
            <Text style={[styles.tipoTexto, { color: tipo.color }]}>{tipo.texto}</Text>
          </View>
          <Etiqueta texto={resuelta ? 'RESUELTO' : 'POR RESOLVER'} color={resuelta ? COLOR.resuelto : COLOR.pendiente} />
        </View>
        <Text style={styles.tituloTarjeta}>{queja.motivo}</Text>
        {queja.titulo_obra ? (
          <TouchableOpacity onPress={() => abrirExpedientePorId(queja.id_contrato)}><Text style={styles.obraTexto}>Obra: "{queja.titulo_obra}" · Ver expediente ›</Text></TouchableOpacity>
        ) : null}
        <Text style={styles.fecha}>{new Date(queja.fecha_reporte).toLocaleString('es-MX')}{!resuelta ? ` · lleva ${Math.max(Math.floor((Date.now() - tiempo(queja.fecha_reporte)) / 86400000), 0)} día(s) esperando` : ''}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          {queja.cancelacion_tardia && <Etiqueta texto="CANCELACIÓN TARDÍA (MENOS DE 48 H)" color="#B91C1C" fondo="#FEE2E2" />}
          {queja.monto_pagado > 0 && <Etiqueta texto={`YA SE HABÍAN PAGADO $${Number(queja.monto_pagado).toLocaleString('es-MX')}`} color="#92400E" fondo="#FEF3C7" />}
          {queja.asignado_a?.uid && <Etiqueta texto={queja.asignado_a.uid === miUid ? 'LO ATIENDES TÚ' : `LO ATIENDE ${String(queja.asignado_a.nombre).toUpperCase()}`} color="#1D4ED8" fondo="#DBEAFE" />}
        </View>

        {/* QUIÉN REPORTA Y A QUIÉN: SE TOCA PARA VER SU PERFIL COMPLETO */}
        <View style={styles.partes}>
          <TouchableOpacity style={styles.parte} onPress={() => verPerfilDe(queja.id_reportante)}>
            <Text style={styles.parteEtiqueta}>QUIÉN REPORTA</Text>
            <Text style={styles.parteNombre} numberOfLines={2}>{queja.nombre_reportante}</Text>
            <Text style={[styles.parteRol, { color: queja.rol_reportante === 'Contratista' ? COLOR.contratista : COLOR.trabajador }]}>{queja.rol_reportante || 'Usuario'} · Ver perfil ›</Text>
          </TouchableOpacity>
          <Ionicons name="arrow-forward" size={18} color="#9CA3AF" style={{ alignSelf: 'center' }} />
          <TouchableOpacity style={styles.parte} onPress={() => verPerfilDe(queja.id_acusado)}>
            <Text style={styles.parteEtiqueta}>A QUIÉN REPORTA</Text>
            <Text style={styles.parteNombre} numberOfLines={2}>{queja.acusado}</Text>
            <Text style={[styles.parteRol, { color: queja.rol_acusado === 'Contratista' ? COLOR.contratista : COLOR.trabajador }]}>{queja.rol_acusado || 'Usuario'} · Ver perfil ›</Text>
          </TouchableOpacity>
        </View>

        {/* LAS DOS VERSIONES: LA DE QUIEN REPORTA Y LA DE QUIEN FUE REPORTADO */}
        <View style={styles.descripcion}>
          <Text style={styles.versionTitulo}>Versión de {conRol(queja.nombre_reportante, queja.rol_reportante)}</Text>
          <Text style={styles.descripcionTexto}>{queja.descripcion}</Text>
          {fotosDe(queja).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {fotosDe(queja).map((f, i) => (
                <TouchableOpacity key={i} onPress={() => setFotoGrande(f)}><Image source={{ uri: f }} style={styles.miniatura} /></TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
        {esUsuarioReal(queja.id_acusado) && (
          <View style={[styles.descripcion, { backgroundColor: '#EFF6FF' }]}>
            <Text style={styles.versionTitulo}>Versión de {conRol(queja.acusado, queja.rol_acusado)}</Text>
            {queja.version_acusado ? (
              <>
                <Text style={[styles.versionTitulo, { color: queja.version_acusado.de_acuerdo ? COLOR.resuelto : COLOR.bloqueada }]}>
                  {queja.version_acusado.de_acuerdo ? 'Está de acuerdo con lo que se pide' : 'No está de acuerdo'}
                </Text>
                <Text style={styles.descripcionTexto}>{queja.version_acusado.texto}</Text>
                {(queja.version_acusado.fotos || []).length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {queja.version_acusado.fotos.map((f: string, i: number) => (
                      <TouchableOpacity key={i} onPress={() => setFotoGrande(f)}><Image source={{ uri: f }} style={styles.miniatura} /></TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            ) : (
              <Text style={[styles.descripcionTexto, { fontStyle: 'italic', color: '#B45309' }]}>{resuelta ? 'No dio su versión.' : 'Todavía no da su versión. Ya se le avisó.'}</Text>
            )}
          </View>
        )}

        {!resuelta ? (
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, marginRight: 6, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#1D4ED8' }]} disabled={procesando}
              onPress={() => tomarCaso(queja, queja.asignado_a?.uid !== miUid)}>
              <Ionicons name={queja.asignado_a?.uid === miUid ? 'person-remove-outline' : 'person-add-outline'} size={16} color="#1D4ED8" />
              <Text style={[styles.botonPrincipalTexto, { color: '#1D4ED8' }]}>{queja.asignado_a?.uid === miUid ? 'Soltar caso' : 'Tomar caso'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonPrincipal, { flex: 1.4, backgroundColor: tipo.color }]} disabled={procesando} onPress={() => abrirResolucion(queja)}>
              <Ionicons name="hammer" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Decidir</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.resolucion}>
            {queja.resolucion ? <Text style={styles.resolucionTexto}>Decisión: {queja.resolucion}</Text> : null}
            {queja.nota_admin ? <Text style={styles.resolucionNota}>Nota: "{queja.nota_admin}"</Text> : null}
            <Text style={styles.resolucionPie}>Guardado para siempre · Lo resolvió: {queja.atendida_por || 'Admin'}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ENCABEZADO */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitulo}>{PESTAÑAS.find(p => p.clave === pestañaActiva)?.clave === 'Inicio' ? `Hola, ${String(adminData.nombre || '').split(' ')[0]}` : pestañaActiva}</Text>
          <Text style={styles.headerSub}>Panel de administración de PalanteMX</Text>
        </View>
        <TouchableOpacity onPress={refrescar} style={{ marginRight: 16 }}><Ionicons name="refresh" size={24} color="#FFF" /></TouchableOpacity>
        <TouchableOpacity onPress={cerrarSesionAdmin}><Ionicons name="log-out-outline" size={26} color="#FFF" /></TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[COLOR.marino]} />}>

        {/* ---------------------------------------------------------------- INICIO: SOLO LO QUE HAY QUE ATENDER */}
        {pestañaActiva === 'Inicio' && (
          <View>
            {/* BUSCADOR GENERAL: UNA PERSONA, OBRA, VACANTE O REPORTE, POR NOMBRE, CORREO, TELÉFONO, TÍTULO O ID */}
            {buscador(busquedaGlobal, setBusquedaGlobal, 'Buscar en todo: nombre, correo, teléfono, obra, ID...')}
            {encontrados && (
              <View style={{ marginBottom: 10 }}>
                {encontrados.usuarios.length + encontrados.obras.length + encontrados.vacantes.length + encontrados.reportes.length === 0 && (
                  <Text style={styles.vacioTexto}>No se encontró nada con "{busquedaGlobal}".</Text>
                )}
                {encontrados.usuarios.length > 0 && <Text style={styles.seccionChica}>PERSONAS ({encontrados.usuarios.length})</Text>}
                {encontrados.usuarios.slice(0, 5).map(u => (
                  <TouchableOpacity key={u.id} style={styles.resultado} onPress={() => setUsuarioExpandido(u)}>
                    <Ionicons name="person-circle-outline" size={20} color={u.rol === 'Trabajador' ? COLOR.trabajador : COLOR.contratista} />
                    <Text style={styles.resultadoTexto} numberOfLines={1}>{u.nombre} {u.apellidos} · {u.rol}{u.estado_cuenta === 'Bloqueada' ? ' · BLOQUEADA' : ''}</Text>
                  </TouchableOpacity>
                ))}
                {encontrados.usuarios.length > 5 && <TouchableOpacity onPress={() => { setPestañaActiva('Usuarios'); setBusquedaUsuarios(busquedaGlobal); }}><Text style={styles.verTodos}>Ver las {encontrados.usuarios.length} personas ›</Text></TouchableOpacity>}

                {encontrados.obras.length > 0 && <Text style={styles.seccionChica}>OBRAS ({encontrados.obras.length})</Text>}
                {encontrados.obras.slice(0, 5).map(c => (
                  <TouchableOpacity key={c.id} style={styles.resultado} onPress={() => abrirExpediente(c)}>
                    <Ionicons name="construct-outline" size={20} color={estiloEstado(c.estado).color} />
                    <Text style={styles.resultadoTexto} numberOfLines={1}>{c.titulo_vacante || c.vacante?.titulo} · {estiloEstado(c.estado).texto}</Text>
                  </TouchableOpacity>
                ))}
                {encontrados.obras.length > 5 && <TouchableOpacity onPress={() => { setPestañaActiva('Obras'); setVistaObras('Contratos'); setBusquedaObras(busquedaGlobal); }}><Text style={styles.verTodos}>Ver las {encontrados.obras.length} obras ›</Text></TouchableOpacity>}

                {encontrados.vacantes.length > 0 && <Text style={styles.seccionChica}>VACANTES ({encontrados.vacantes.length})</Text>}
                {encontrados.vacantes.slice(0, 5).map(v => (
                  <TouchableOpacity key={v.id} style={styles.resultado} onPress={() => setVacanteExpandida(v)}>
                    <Ionicons name="briefcase-outline" size={20} color="#7C3AED" />
                    <Text style={styles.resultadoTexto} numberOfLines={1}>{v.titulo} · {v.contratista} · {v.estado === 'Activa' ? 'Abierta' : 'Cerrada'}</Text>
                  </TouchableOpacity>
                ))}
                {encontrados.vacantes.length > 5 && <TouchableOpacity onPress={() => { setPestañaActiva('Obras'); setVistaObras('Vacantes'); setBusquedaVacantes(busquedaGlobal); }}><Text style={styles.verTodos}>Ver las {encontrados.vacantes.length} vacantes ›</Text></TouchableOpacity>}

                {encontrados.reportes.length > 0 && <Text style={styles.seccionChica}>REPORTES ({encontrados.reportes.length})</Text>}
                {encontrados.reportes.slice(0, 5).map(q => (
                  <TouchableOpacity key={q.id} style={styles.resultado} onPress={() => { setPestañaActiva('Reportes'); setVistaReportes(q.estado === 'Resuelta' ? 'Historial' : 'Pendientes'); setFiltroTipo('todos'); setBusquedaReportes(q.id); }}>
                    <Ionicons name={TIPOS_REPORTE[tipoDe(q)].icono} size={20} color={TIPOS_REPORTE[tipoDe(q)].color} />
                    <Text style={styles.resultadoTexto} numberOfLines={1}>{q.motivo} · {q.nombre_reportante} · {q.estado === 'Resuelta' ? 'Resuelto' : 'Por resolver'}</Text>
                  </TouchableOpacity>
                ))}
                {encontrados.reportes.length > 5 && <TouchableOpacity onPress={() => { setPestañaActiva('Reportes'); setFiltroTipo('todos'); setBusquedaReportes(busquedaGlobal); }}><Text style={styles.verTodos}>Ver los {encontrados.reportes.length} reportes ›</Text></TouchableOpacity>}
              </View>
            )}

            {misCasos > 0 && (
              <TouchableOpacity style={[styles.tarjeta, styles.filaAtender, { borderLeftColor: '#1D4ED8' }]} activeOpacity={0.8}
                onPress={() => { setPestañaActiva('Reportes'); setVistaReportes('Pendientes'); setFiltroTipo('todos'); setAsignacion('mios'); }}>
                <View style={[styles.iconoAtender, { backgroundColor: '#1D4ED8' }]}><Ionicons name="person" size={20} color="#FFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tituloTarjeta}>Mis casos: {misCasos}</Text>
                  <Text style={styles.datoChico}>Reportes que tomaste y todavía no resuelves.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}

            {quejasPendientes.length === 0 ? (
              <View style={[styles.tarjeta, { alignItems: 'center', paddingVertical: 30 }]}>
                <Ionicons name="checkmark-circle" size={56} color={COLOR.resuelto} />
                <Text style={styles.vacioTitulo}>Todo en orden</Text>
                <Text style={styles.vacioTexto}>No hay reportes por resolver.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.seccion}>Tienes {quejasPendientes.length} reporte{quejasPendientes.length > 1 ? 's' : ''} por resolver</Text>
                {(Object.keys(TIPOS_REPORTE) as TipoReporte[]).filter(t => pendientesDe(t) > 0).map(t => (
                  <TouchableOpacity key={t} style={[styles.tarjeta, styles.filaAtender, { borderLeftColor: TIPOS_REPORTE[t].color }]} activeOpacity={0.8}
                    onPress={() => { setPestañaActiva('Reportes'); setVistaReportes('Pendientes'); setFiltroTipo(t); setAsignacion('todos'); setBusquedaReportes(''); }}>
                    <View style={[styles.iconoAtender, { backgroundColor: TIPOS_REPORTE[t].color }]}><Ionicons name={TIPOS_REPORTE[t].icono} size={20} color="#FFF" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tituloTarjeta}>{TIPOS_REPORTE[t].texto}: {pendientesDe(t)}</Text>
                      <Text style={styles.datoChico}>{TIPOS_REPORTE[t].explicacion}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
              </>
            )}
            <Text style={styles.resumenTexto}>
              En PalanteMX hay {trabajadores.length} trabajadores, {contratistas.length} contratistas y {enGrupo(GRUPOS_OBRA[0])} obras en curso.
            </Text>
          </View>
        )}

        {/* ---------------------------------------------------------------- DATOS: ANALÍTICA CON GRÁFICAS */}
        {pestañaActiva === 'Datos' && (
          <View>
            <View style={styles.selectorDatos}>
              {(['Uso de la app', 'Reporte financiero'] as const).map(v => (
                <TouchableOpacity key={v} style={[styles.selectorDatosBoton, vistaDatos === v && styles.selectorDatosActivo]} onPress={() => setVistaDatos(v)}>
                  <Text style={[styles.selectorDatosTexto, vistaDatos === v && { color: COLOR.marino }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {vistaDatos === 'Uso de la app'
              ? <AnaliticaAdmin trabajadores={trabajadores} contratistas={contratistas} vacantes={vacantes} contratos={contratos} quejas={quejas} />
              : <ReporteFinanciero trabajadores={trabajadores} contratistas={contratistas} contratos={contratos} esPrincipal={esPrincipal} />}
          </View>
        )}

        {/* ---------------------------------------------------------------- REPORTES */}
        {pestañaActiva === 'Reportes' && (
          <View>
            <Segmentos opciones={[{ valor: 'Pendientes', texto: `Por resolver (${quejasPendientes.length})` }, { valor: 'Historial', texto: `Ya resueltos (${quejasResueltas.length})` }]} valor={vistaReportes} onCambio={setVistaReportes} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <Chip texto="Todos" color={COLOR.marino} activo={filtroTipo === 'todos'} onPress={() => setFiltroTipo('todos')} />
              {(Object.keys(TIPOS_REPORTE) as TipoReporte[]).map(t => (
                <Chip key={t} texto={TIPOS_REPORTE[t].texto} color={TIPOS_REPORTE[t].color} activo={filtroTipo === t} onPress={() => setFiltroTipo(t)} />
              ))}
            </ScrollView>
            {buscador(busquedaReportes, setBusquedaReportes, 'Buscar por persona, obra, motivo o ID...')}
            {/* QUIÉN LO ATIENDE (VARIOS ADMINS SIN PISARSE), DE CUÁNDO Y EN QUÉ ORDEN */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {vistaReportes === 'Pendientes' && <>
                <Chip texto="Todos" color="#1D4ED8" activo={asignacion === 'todos'} onPress={() => setAsignacion('todos')} />
                <Chip texto={`Mis casos (${misCasos})`} color="#1D4ED8" activo={asignacion === 'mios'} onPress={() => setAsignacion('mios')} />
                <Chip texto="Sin asignar" color="#1D4ED8" activo={asignacion === 'sin_asignar'} onPress={() => setAsignacion('sin_asignar')} />
              </>}
              <Chip texto="Cualquier fecha" color="#6B7280" activo={periodoReportes === 'todo'} onPress={() => setPeriodoReportes('todo')} />
              <Chip texto="Últimos 7 días" color="#6B7280" activo={periodoReportes === '7'} onPress={() => setPeriodoReportes('7')} />
              <Chip texto="Últimos 30 días" color="#6B7280" activo={periodoReportes === '30'} onPress={() => setPeriodoReportes('30')} />
              <Chip texto={ordenReportes === 'antiguos' ? (vistaReportes === 'Pendientes' ? 'Más viejos primero' : 'Más nuevos primero') : (vistaReportes === 'Pendientes' ? 'Más nuevos primero' : 'Más viejos primero')} color={COLOR.marino} activo={false}
                onPress={() => setOrdenReportes(ordenReportes === 'antiguos' ? 'recientes' : 'antiguos')} />
            </ScrollView>
            {paginado(`reportes-${vistaReportes}`, reportesVisibles, q => <TarjetaReporte key={q.id} queja={q} />,
              vistaReportes === 'Pendientes' ? 'No hay reportes por resolver con estos filtros.' : 'No hay reportes resueltos con estos filtros.')}
          </View>
        )}

        {/* ---------------------------------------------------------------- USUARIOS */}
        {pestañaActiva === 'Usuarios' && (
          <View>
            <Segmentos opciones={[{ valor: 'Trabajadores', texto: `Trabajadores (${trabajadores.length})` }, { valor: 'Contratistas', texto: `Contratistas (${contratistas.length})` }]} valor={vistaUsuarios} onCambio={setVistaUsuarios} />
            {buscador(busquedaUsuarios, setBusquedaUsuarios, 'Nombre, correo, teléfono, usuario, oficio, ciudad o ID...')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <Chip texto={soloBloqueadas ? 'Solo bloqueadas ✓' : 'Solo bloqueadas'} color={COLOR.bloqueada} activo={soloBloqueadas} onPress={() => setSoloBloqueadas(!soloBloqueadas)} />
              {([['recientes', 'Más recientes'], ['calificacion', 'Mejor calificados'], ['reportes', 'Más reportados'], ['nombre', 'Por nombre']] as const).map(([valor, textoOrden]) => (
                <Chip key={valor} texto={textoOrden} color={COLOR.marino} activo={ordenUsuarios === valor} onPress={() => setOrdenUsuarios(valor)} />
              ))}
            </ScrollView>
            {/* FILTRO POR ESTADO DE LA REPÚBLICA (SOLO LOS ESTADOS DONDE HAY USUARIOS) */}
            <View style={styles.pickerCaja}>
              <Picker selectedValue={estadoUsuarios} onValueChange={setEstadoUsuarios}>
                <Picker.Item label="Todos los estados" value="" />
                {estadosConUsuarios.map(e => <Picker.Item key={e} label={e} value={e} />)}
              </Picker>
            </View>
            {paginado(`usuarios-${vistaUsuarios}`, usuariosVisibles, u => {
              const colorRol = u.rol === 'Trabajador' ? COLOR.trabajador : COLOR.contratista;
              const reportes = reportesContra(u.id);
              const tardias = cancelacionesTardiasDe(u.id);
              return (
                <TouchableOpacity key={u.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: u.estado_cuenta === 'Bloqueada' ? COLOR.bloqueada : colorRol }]} activeOpacity={0.8} onPress={() => setUsuarioExpandido(u)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: u.foto_rostro_url || undefined }} style={styles.avatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tituloTarjeta}>{u.nombre} {u.apellidos}</Text>
                      <Text style={styles.datoChico}>{u.rol === 'Trabajador' ? (u.oficio_principal || 'Sin oficio') : (u.empresa || 'Independiente')} · {[u.ubicacion_texto, u.ubicacion_estado].filter(Boolean).join(', ') || 'Sin ubicación'}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                        <Etiqueta texto={u.rol.toUpperCase()} color={colorRol} fondo={`${colorRol}1A`} />
                        <Etiqueta texto={`★ ${u.calificacion || '0.0'}`} color="#B45309" fondo="#FEF3C7" />
                        {reportes.length > 0 && <Etiqueta texto={`${reportes.length} reporte${reportes.length > 1 ? 's' : ''} en contra`} color="#DC2626" fondo="#FEE2E2" />}
                        {tardias > 0 && <Etiqueta texto={`${tardias} cancelación${tardias > 1 ? 'es' : ''} tardía${tardias > 1 ? 's' : ''}`} color="#B45309" fondo="#FEF3C7" />}
                        {u.estado_cuenta === 'Bloqueada' && <Etiqueta texto="BLOQUEADA" color={COLOR.bloqueada} />}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>
              );
            }, 'No hay usuarios con esa búsqueda.')}
          </View>
        )}

        {/* ---------------------------------------------------------------- OBRAS (CONTRATOS Y VACANTES) */}
        {pestañaActiva === 'Obras' && (
          <View>
            <Segmentos opciones={[{ valor: 'Contratos', texto: `Obras (${contratos.length})` }, { valor: 'Vacantes', texto: `Vacantes (${vacantes.length})` }]} valor={vistaObras} onCambio={setVistaObras} />

            {vistaObras === 'Contratos' ? (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {GRUPOS_OBRA.map(g => <Chip key={g.clave} texto={`${g.texto} (${enGrupo(g)})`} color={g.color} activo={grupoObra === g.clave} onPress={() => setGrupoObra(g.clave)} />)}
                </ScrollView>
                {buscador(busquedaObras, setBusquedaObras, 'Obra, trabajador, contratista, lugar o ID...')}
                {paginado(`obras-${grupoObra}`, contratosVisibles, c => {
                  const estilo = estiloEstado(c.estado);
                  const ajustes = ajustesDePago(c);
                  return (
                    <TouchableOpacity key={c.id} activeOpacity={0.85} onPress={() => abrirExpediente(c)} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: estilo.color }]}>
                      <View style={styles.filaEntre}>
                        <Text style={[styles.tituloTarjeta, { flex: 1 }]} numberOfLines={2}>{c.titulo_vacante || c.vacante?.titulo}</Text>
                        <Etiqueta texto={estilo.texto} color={estilo.color} />
                      </View>
                      <TouchableOpacity onPress={() => verPerfilDe(c.id_trabajador)}><Text style={styles.datoChico}><Text style={{ color: COLOR.trabajador, fontWeight: 'bold' }}>Trabajador:</Text> {c.nombre_trabajador || '—'} ›</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => verPerfilDe(c.id_contratista)}><Text style={styles.datoChico}><Text style={{ color: COLOR.contratista, fontWeight: 'bold' }}>Contratista:</Text> {c.contratista || c.vacante?.contratista || '—'} ›</Text></TouchableOpacity>
                      <Text style={styles.datoChico}>Pago acordado: {c.vacante?.pago || 'A convenir'}{c.fecha_inicio ? ` · Empezó: ${c.fecha_inicio}` : ''}{c.fecha_fin ? ` · Terminó: ${c.fecha_fin}` : ''}</Text>
                      <Text style={styles.datoChico}>Pagado y confirmado: ${totalRecibido(c).toLocaleString('es-MX')}{pagosPorConfirmar(c).length ? ` · ${pagosPorConfirmar(c).length} pago(s) sin confirmar` : ''}</Text>
                      {ajustes.map((a: any, i: number) => <Text key={i} style={[styles.datoChico, { color: a.tipo === 'extra' ? '#047857' : '#B91C1C', fontWeight: 'bold' }]}>{a.tipo === 'extra' ? '+' : '−'} {a.texto}</Text>)}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                        {(c.reportes_abiertos || 0) > 0 && <Etiqueta texto={`${c.reportes_abiertos} reporte(s) por resolver`} color={COLOR.pendiente} fondo="#FEF3C7" />}
                        {c.cancelacion_tardia && <Etiqueta texto="CANCELACIÓN TARDÍA" color="#B91C1C" fondo="#FEE2E2" />}
                        {c.republicada && <Etiqueta texto="EL CONTRATISTA LA VOLVIÓ A PUBLICAR" color="#1D4ED8" fondo="#DBEAFE" />}
                      </View>
                      <Text style={[styles.datoChico, { color: COLOR.marino, fontWeight: 'bold' }]}>Ver expediente completo ›</Text>
                    </TouchableOpacity>
                  );
                }, 'No hay obras aquí con esa búsqueda.')}
              </View>
            ) : (
              <View>
                {buscador(busquedaVacantes, setBusquedaVacantes, 'Título, contratista, oficio, lugar o ID...')}
                <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                  <Chip texto="Todas" color="#7C3AED" activo={filtroVacantes === 'todas'} onPress={() => setFiltroVacantes('todas')} />
                  <Chip texto="Abiertas" color="#7C3AED" activo={filtroVacantes === 'Activa'} onPress={() => setFiltroVacantes('Activa')} />
                  <Chip texto="Cerradas" color="#6B7280" activo={filtroVacantes === 'Cerrada'} onPress={() => setFiltroVacantes('Cerrada')} />
                </View>
                {paginado('vacantes', vacantesVisibles, v => (
                  <TouchableOpacity key={v.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: v.estado === 'Activa' ? '#7C3AED' : '#9CA3AF' }]} activeOpacity={0.8} onPress={() => setVacanteExpandida(v)}>
                    <View style={styles.filaEntre}>
                      <Text style={[styles.tituloTarjeta, { flex: 1 }]} numberOfLines={2}>{v.titulo}</Text>
                      <Etiqueta texto={v.estado === 'Activa' ? 'ABIERTA' : 'CERRADA'} color={v.estado === 'Activa' ? '#7C3AED' : '#6B7280'} />
                    </View>
                    <Text style={styles.datoChico}>Publicó: {conRol(v.contratista, 'contratista')} · {new Date(v.fecha_publicacion).toLocaleDateString('es-MX')}</Text>
                    <Text style={styles.datoChico}>{[v.ubicacion, v.estado_republica].filter(Boolean).join(', ')} · {v.pago} · {v.cupo_actual || 0}/{v.cupo_total || 1} contratados</Text>
                  </TouchableOpacity>
                ), 'No hay vacantes con esa búsqueda.')}
              </View>
            )}
          </View>
        )}

        {/* ---------------------------------------------------------------- MI CUENTA Y EQUIPO */}
        {pestañaActiva === 'Mi cuenta' && (
          <View>
            <View style={[styles.tarjeta, { alignItems: 'center' }]}>
              <TouchableOpacity onPress={cambiarFotoAdmin} disabled={!esPrincipal}>
                <Image source={{ uri: adminData.foto || undefined }} style={styles.fotoAdmin} />
                {esPrincipal && <View style={styles.camara}><Ionicons name="camera" size={14} color="#FFF" /></View>}
              </TouchableOpacity>
              <Text style={styles.nombreAdmin}>{adminData.nombre}</Text>
              <Text style={styles.cargoAdmin}>{adminData.cargo}</Text>
              <View style={[styles.etiqueta, { backgroundColor: esPrincipal ? COLOR.marino : '#DBEAFE', alignSelf: 'center', marginTop: 8 }]}>
                <Text style={[styles.etiquetaTexto, { color: esPrincipal ? '#FFF' : '#1D4ED8' }]}>{esPrincipal ? 'ADMINISTRADOR PRINCIPAL' : 'PERSONAL AUTORIZADO POR EL ADMINISTRADOR'}</Text>
              </View>
              {esPrincipal ? (
                <TouchableOpacity style={[styles.botonPrincipal, { backgroundColor: COLOR.marino, alignSelf: 'stretch' }]} onPress={() => setModalEditarAdmin(true)}>
                  <Ionicons name="pencil" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Editar mi perfil</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.datoChico, { textAlign: 'center', marginTop: 8 }]}>Puedes revisar reportes, usuarios y obras, y bloquear cuentas. Agregar personal y eliminar cuentas solo lo puede hacer el administrador principal.</Text>
              )}
            </View>

            {/* HERRAMIENTA PARA DESPUÉS DE LIMPIAR DATOS A MANO EN FIREBASE (SOLO EL PRINCIPAL) */}
            {esPrincipal && <TouchableOpacity style={[styles.tarjeta, { flexDirection: 'row', alignItems: 'center' }]} disabled={procesando} onPress={recalcularTodos}>
              <View style={[styles.iconoEquipo, { backgroundColor: '#DBEAFE' }]}><Ionicons name="refresh" size={20} color="#2563EB" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tituloTarjeta}>Recalcular todos los perfiles</Text>
                <Text style={styles.datoChico}>Úsalo si borraste reseñas u obras directo en Firebase: las calificaciones y obras de cada perfil se vuelven a armar.</Text>
              </View>
              {procesando ? <ActivityIndicator color="#2563EB" /> : <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />}
            </TouchableOpacity>}

            <View style={styles.filaEntre}>
              <Text style={styles.seccion}>Personal de monitoreo ({personalSoporte.length})</Text>
              {esPrincipal && <TouchableOpacity style={styles.botonChico} onPress={() => setModalCrear(true)}><Ionicons name="person-add" size={14} color="#FFF" /><Text style={styles.botonChicoTexto}>Agregar</Text></TouchableOpacity>}
            </View>
            {personalSoporte.map(s => {
              const activo = s.estado_cuenta === 'Activa';
              return (
                <View key={s.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: !s.con_cuenta ? '#9CA3AF' : activo ? COLOR.resuelto : COLOR.pendiente }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.iconoEquipo}><Ionicons name="headset" size={20} color={COLOR.resuelto} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tituloTarjeta}>{s.nombre}</Text>
                      <Text style={styles.datoChico}>{s.rol_usuario} · {s.correo}</Text>
                      <Text style={[styles.datoChico, { fontWeight: 'bold', color: !s.con_cuenta ? '#6B7280' : activo ? COLOR.resuelto : '#B45309' }]}>
                        {!s.con_cuenta ? 'Registro viejo, sin cuenta: quítalo y vuelve a agregarlo' : activo ? `Ya entró${s.ultimo_acceso ? ` (último acceso: ${new Date(s.ultimo_acceso).toLocaleDateString('es-MX')})` : ''}` : 'Falta que cree su contraseña con el correo'}
                      </Text>
                    </View>
                  </View>
                  {esPrincipal && (
                    <View style={{ flexDirection: 'row', marginTop: 4 }}>
                      {s.con_cuenta && !activo && (
                        <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, backgroundColor: '#2563EB', marginRight: 6, paddingVertical: 8 }]} disabled={procesando} onPress={() => accionEquipo(s, 'reenviar')}>
                          <Ionicons name="mail" size={14} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Reenviar correo</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, backgroundColor: COLOR.bloqueada, paddingVertical: 8 }]} disabled={procesando} onPress={() => accionEquipo(s, 'quitar')}>
                        <Ionicons name="person-remove" size={14} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Quitar acceso</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            {personalSoporte.length === 0 && <Text style={styles.vacioTexto}>Todavía no hay personal de monitoreo.</Text>}
          </View>
        )}
      </ScrollView>

      {/* BARRA DE ABAJO */}
      <View style={styles.barra}>
        {PESTAÑAS.map(p => {
          const activa = pestañaActiva === p.clave;
          return (
            <TouchableOpacity key={p.clave} style={styles.barraBoton} onPress={() => setPestañaActiva(p.clave)}>
              <View>
                <Ionicons name={activa ? p.icono : `${p.icono}-outline`} size={24} color={activa ? COLOR.marino : '#9CA3AF'} />
                {p.clave === 'Reportes' && quejasPendientes.length > 0 && <View style={styles.globo}><Text style={styles.globoTexto}>{quejasPendientes.length}</Text></View>}
              </View>
              <Text style={[styles.barraTexto, activa && { color: COLOR.marino, fontWeight: 'bold' }]}>{p.clave}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ---------------------------------------------------------------- VENTANAS */}

      {/* DECIDIR QUIÉN TIENE LA RAZÓN */}
      <Modal visible={!!quejaResolviendo} animationType="fade" transparent onRequestClose={() => setQuejaResolviendo(null)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior="padding">
          <View style={[styles.modalCaja, { maxHeight: '92%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {quejaResolviendo && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Ionicons name={TIPOS_REPORTE[tipoDe(quejaResolviendo)].icono} size={22} color={TIPOS_REPORTE[tipoDe(quejaResolviendo)].color} />
                    <Text style={[styles.modalTitulo, { marginLeft: 8, marginBottom: 0 }]}>Decidir quién tiene razón</Text>
                  </View>
                  <Text style={styles.datoChico}>{quejaResolviendo.motivo}{quejaResolviendo.titulo_obra ? ` · "${quejaResolviendo.titulo_obra}"` : ''}</Text>
                  <Text style={[styles.datoChico, { marginBottom: 12, fontWeight: 'bold' }]}>
                    {conRol(quejaResolviendo.nombre_reportante, quejaResolviendo.rol_reportante)} reportó a {conRol(quejaResolviendo.acusado, quejaResolviendo.rol_acusado)}
                  </Text>

                  {/* ANTES DE DECIDIR: ¿YA HABLARON LOS DOS? */}
                  {esUsuarioReal(quejaResolviendo.id_acusado) && (
                    <View style={[styles.descripcion, { marginTop: 0, marginBottom: 12, backgroundColor: quejaResolviendo.version_acusado ? '#ECFDF5' : '#FFFBEB' }]}>
                      <Text style={[styles.versionTitulo, { color: quejaResolviendo.version_acusado ? '#065F46' : '#92400E' }]}>
                        {quejaResolviendo.version_acusado
                          ? `${conRol(quejaResolviendo.acusado, quejaResolviendo.rol_acusado)} ya dio su versión y ${quejaResolviendo.version_acusado.de_acuerdo ? 'ESTÁ de acuerdo' : 'NO está de acuerdo'}.`
                          : `${conRol(quejaResolviendo.acusado, quejaResolviendo.rol_acusado)} todavía no da su versión. Lo justo es esperarla, salvo que el caso sea urgente.`}
                      </Text>
                    </View>
                  )}
                  {quejaResolviendo.cancelacion_tardia && (
                    <Text style={[styles.datoChico, { color: '#B91C1C', fontWeight: 'bold', marginBottom: 10 }]}>
                      Cancelación tardía: se canceló con menos de 48 horas de aviso{quejaResolviendo.horas_aviso < 0 ? ' (la obra ya había empezado)' : ''}.
                    </Text>
                  )}

                  <Text style={styles.modalEtiqueta}>1. Tu decisión</Text>
                  {opcionesDeReporte(quejaResolviendo)
                    // SI EL CONTRATISTA YA VOLVIÓ A PUBLICAR LA OBRA, YA NO SE PUEDE REGRESAR A ESTE TRABAJADOR
                    .filter(op => op.valor !== 'admin_reactivar' || !contratos.find(c => c.id === quejaResolviendo.id_contrato)?.republicada)
                    .map(op => (
                    <TouchableOpacity key={op.valor} style={[styles.opcion, decision === op.valor && { borderColor: op.color, backgroundColor: `${op.color}14` }]} onPress={() => setDecision(op.valor)}>
                      <Ionicons name={decision === op.valor ? 'radio-button-on' : 'radio-button-off'} size={20} color={op.color} />
                      <Text style={styles.opcionTexto}>{op.texto}</Text>
                    </TouchableOpacity>
                  ))}

                  {/* DINERO: SI TIENE LA RAZÓN EL TRABAJADOR, EL CONTRATISTA LE PAGA DE MÁS; SI LA TIENE EL CONTRATISTA, SE DESCUENTA AL TRABAJADOR */}
                  {permiteAjuste && (
                    <>
                      <Text style={[styles.modalEtiqueta, { marginTop: 8 }]}>2. Dinero (opcional)</Text>
                      <Text style={[styles.datoChico, { marginBottom: 6 }]}>
                        {ganador?.rol === 'Trabajador'
                          ? `¿Cuánto dinero EXTRA debe pagarle ${conRol(contratistaDeQueja, 'contratista')} a ${conRol(trabajadorDeQueja, 'trabajador')}?`
                          : `¿Cuánto se le DESCUENTA del pago a ${conRol(trabajadorDeQueja, 'trabajador')}?`}
                      </Text>
                      <TextInput style={styles.modalInput} keyboardType="numeric" placeholder="0 = nada de dinero" value={ajuste} onChangeText={t => setAjuste(t.replace(/[^0-9]/g, ''))} />
                    </>
                  )}

                  {/* CANCELACIÓN CON DINERO YA PAGADO (P. EJ. LA MITAD AL INICIO): ¿EL TRABAJADOR LO DEVUELVE O SE LO QUEDA? */}
                  {decision === 'admin_cancelar' && montoPagado > 0 && (
                    <>
                      <Text style={[styles.modalEtiqueta, { marginTop: 8 }]}>2. Dinero ya pagado: ${montoPagado.toLocaleString('es-MX')}</Text>
                      <Text style={[styles.datoChico, { marginBottom: 6 }]}>¿Cuánto debe devolverle {conRol(trabajadorDeQueja, 'trabajador')} a {conRol(contratistaDeQueja, 'contratista')}? Si ya trabajó una parte, puede quedarse con lo que corresponde.</Text>
                      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                        <TouchableOpacity style={[styles.opcion, { flex: 1, marginRight: 4 }, devolver === String(montoPagado) && { borderColor: '#B91C1C', backgroundColor: '#FEE2E2' }]} onPress={() => setDevolver(String(montoPagado))}>
                          <Text style={[styles.opcionTexto, { marginLeft: 0 }]}>Devolver todo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.opcion, { flex: 1, marginLeft: 4 }, devolver === '0' && { borderColor: '#047857', backgroundColor: '#ECFDF5' }]} onPress={() => setDevolver('0')}>
                          <Text style={[styles.opcionTexto, { marginLeft: 0 }]}>Se lo queda</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput style={styles.modalInput} keyboardType="numeric" placeholder="O escribe otra cantidad" value={devolver} onChangeText={t => setDevolver(t.replace(/[^0-9]/g, ''))} />
                    </>
                  )}

                  {/* CANCELACIÓN: ¿QUIÉN TUVO LA CULPA? (QUIEN CANCELÓ, LA OTRA PARTE O NADIE) Y SI SE LE BLOQUEA */}
                  {esCancelacion(quejaResolviendo) && (
                    <>
                      <Text style={[styles.modalEtiqueta, { marginTop: 8 }]}>¿Quién tuvo la culpa de la cancelación?</Text>
                      {([
                        ['quien_cancelo', `${conRol(quejaResolviendo.nombre_reportante, quejaResolviendo.rol_reportante)}, quien canceló`],
                        ['otra_parte', `${conRol(quejaResolviendo.acusado, quejaResolviendo.rol_acusado)} (la otra parte lo provocó)`],
                        ['nadie', 'Nadie (causa de fuerza mayor o de común acuerdo)'],
                      ] as const).map(([valor, textoOpcion]) => (
                        <TouchableOpacity key={valor} style={[styles.opcion, responsable === valor && { borderColor: COLOR.marino, backgroundColor: '#EEF2FF' }]} onPress={() => { setResponsable(valor); if (valor === 'nadie') setBloquear(false); }}>
                          <Ionicons name={responsable === valor ? 'radio-button-on' : 'radio-button-off'} size={20} color={COLOR.marino} />
                          <Text style={styles.opcionTexto}>{textoOpcion}</Text>
                        </TouchableOpacity>
                      ))}
                      {(responsable === 'quien_cancelo' || responsable === 'otra_parte') && (
                        <View style={styles.filaBloquear}>
                          <Text style={[styles.opcionTexto, { marginLeft: 0 }]}>
                            Bloquear la cuenta de {responsable === 'quien_cancelo' ? conRol(quejaResolviendo.nombre_reportante, quejaResolviendo.rol_reportante) : conRol(quejaResolviendo.acusado, quejaResolviendo.rol_acusado)}
                            {cancelacionesTardiasDe(responsable === 'quien_cancelo' ? quejaResolviendo.id_reportante : quejaResolviendo.id_acusado) > 1 ? ` (ya lleva ${cancelacionesTardiasDe(responsable === 'quien_cancelo' ? quejaResolviendo.id_reportante : quejaResolviendo.id_acusado)} cancelaciones tardías)` : ''}
                          </Text>
                          <Switch value={bloquear} onValueChange={setBloquear} trackColor={{ true: '#FCA5A5', false: '#E5E7EB' }} thumbColor={bloquear ? COLOR.bloqueada : '#FFF'} />
                        </View>
                      )}
                    </>
                  )}

                  {perdedor && !esCancelacion(quejaResolviendo) && (
                    <View style={styles.filaBloquear}>
                      <Text style={[styles.opcionTexto, { marginLeft: 0 }]}>Bloquear la cuenta de {conRol(perdedor.nombre, perdedor.rol)}</Text>
                      <Switch value={bloquear} onValueChange={setBloquear} trackColor={{ true: '#FCA5A5', false: '#E5E7EB' }} thumbColor={bloquear ? COLOR.bloqueada : '#FFF'} />
                    </View>
                  )}

                  <Text style={[styles.modalEtiqueta, { marginTop: 8 }]}>{permiteAjuste || (decision === 'admin_cancelar' && montoPagado > 0) ? '3' : '2'}. Nota para las dos partes (obligatoria)</Text>
                  <TextInput style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]} multiline value={notaAdmin} onChangeText={setNotaAdmin} placeholder="Ej. Revisamos las fotos: el contratista no entregó el material acordado..." />
                  <Text style={[styles.datoChico, { marginBottom: 10 }]}>A los dos les llega una notificación con tu decisión y esta nota.</Text>

                  <View style={styles.modalBotones}>
                    <TouchableOpacity style={styles.modalCancelar} onPress={() => setQuejaResolviendo(null)}><Text style={styles.modalCancelarTexto}>Volver</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalGuardar, { backgroundColor: COLOR.marino }]} onPress={confirmarResolucion} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalGuardarTexto}>Guardar decisión</Text>}</TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PERFIL DE UN USUARIO */}
      <Modal visible={!!usuarioExpandido} animationType="slide" transparent onRequestClose={() => setUsuarioExpandido(null)}>
        <View style={styles.modalFondoOscuro}>
          {usuarioExpandido && (
            <SafeAreaView style={styles.panelCompleto}>
              <View style={[styles.panelEncabezado, { backgroundColor: usuarioExpandido.rol === 'Trabajador' ? COLOR.trabajador : COLOR.contratista }]}>
                <Text style={styles.panelTitulo}>Perfil de {usuarioExpandido.rol.toLowerCase()}</Text>
                <TouchableOpacity onPress={() => setUsuarioExpandido(null)}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* DATOS QUE SOLO VE EL ADMIN */}
                <View style={styles.tarjeta}>
                  <View style={styles.filaEntre}>
                    <Text style={styles.seccionChica}>DATOS DE LA CUENTA</Text>
                    <Etiqueta texto={usuarioExpandido.estado_cuenta === 'Bloqueada' ? 'BLOQUEADA' : 'ACTIVA'} color={usuarioExpandido.estado_cuenta === 'Bloqueada' ? COLOR.bloqueada : COLOR.resuelto} />
                  </View>
                  <Text style={styles.datoChico}>Correo: {usuarioExpandido.correo}</Text>
                  <Text style={styles.datoChico}>Teléfono: {usuarioExpandido.numero_telefono}</Text>
                  <Text style={styles.datoChico}>Usuario: {usuarioExpandido.nombre_usuario}</Text>
                  <Text style={styles.datoChico}>Identidad (INE + rostro): {usuarioExpandido.kyc_aprobado ? 'Verificada' : 'No verificada'}</Text>
                </View>

                {usuarioExpandido.rol === 'Trabajador' ? (
                  <PerfilTrabajador
                    trabajador={usuarioExpandido}
                    obrasEnCurso={obrasEnCursoDe(usuarioExpandido.id)}
                    onEliminarObra={(obra) => eliminarObraDeUsuario(usuarioExpandido.id, obra)}
                    onEliminarObraPalante={(obra) => corregirPerfil("Quitar obra terminada", `¿Quitar "${obra.titulo}" de las obras terminadas de ${usuarioExpandido.nombre}? Ya no aparecerá en su perfil.`, 'eliminar_obra', { uid: usuarioExpandido.id, id_contrato: obra.id_contrato })}
                    onEliminarResena={(r) => corregirPerfil("Borrar reseña", `¿Borrar la reseña de ${r.evaluador_nombre}? Su calificación se recalculará.`, 'eliminar_resena', { id_resena: `${r.evaluador_id}_${usuarioExpandido.id}` })}
                  />
                ) : (
                  <View style={[styles.tarjeta, { alignItems: 'center' }]}>
                    <TouchableOpacity onPress={() => usuarioExpandido.foto_rostro_url && setFotoGrande(usuarioExpandido.foto_rostro_url)}>
                      <Image source={{ uri: usuarioExpandido.foto_rostro_url || undefined }} style={styles.fotoAdmin} />
                    </TouchableOpacity>
                    <Text style={styles.nombreAdmin}>{usuarioExpandido.nombre} {usuarioExpandido.apellidos}</Text>
                    <Text style={styles.datoChico}>{usuarioExpandido.empresa || 'Contratista independiente'}</Text>
                    <Text style={styles.datoChico}>{[usuarioExpandido.ubicacion_texto, usuarioExpandido.ubicacion_estado].filter(Boolean).join(', ') || 'Sin ubicación'}</Text>
                    <Text style={[styles.datoChico, { color: '#B45309', fontWeight: 'bold' }]}>★ {usuarioExpandido.calificacion || '0.0'} ({usuarioExpandido.numero_resenas || 0} reseñas)</Text>
                    <Text style={styles.datoChico}>
                      {vacantes.filter(v => v.id_contratista === usuarioExpandido.id).length} vacantes · {contratos.filter(c => c.id_contratista === usuarioExpandido.id && [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN].includes(c.estado)).length} obras en proceso · {contratos.filter(c => c.id_contratista === usuarioExpandido.id && c.estado === ESTADOS.FINALIZADA).length} terminadas
                    </Text>
                  </View>
                )}

                {/* RESEÑAS DEL CONTRATISTA (EL DEL TRABAJADOR YA LAS MUESTRA SU PERFIL), CON BOTÓN PARA BORRAR */}
                {usuarioExpandido.rol === 'Contratista' && (
                  <>
                    <Text style={styles.seccion}>Reseñas que recibió ({usuarioExpandido.resenas?.length || 0})</Text>
                    {(usuarioExpandido.resenas || []).length === 0 ? <Text style={styles.vacioTexto}>No tiene reseñas.</Text>
                      : [...usuarioExpandido.resenas].reverse().map((r: any, i: number) => (
                        <View key={i} style={[styles.tarjeta, { flexDirection: 'row', alignItems: 'center' }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tituloTarjeta}>{r.evaluador_nombre} · {'★'.repeat(r.estrellas)}</Text>
                            <Text style={[styles.datoChico, { fontStyle: 'italic' }]}>"{r.comentario}" · {r.fecha}</Text>
                          </View>
                          <TouchableOpacity onPress={() => corregirPerfil("Borrar reseña", `¿Borrar la reseña de ${r.evaluador_nombre}? Su calificación se recalculará.`, 'eliminar_resena', { id_resena: `${r.evaluador_id}_${usuarioExpandido.id}` })}>
                            <Ionicons name="trash" size={22} color={COLOR.bloqueada} />
                          </TouchableOpacity>
                        </View>
                      ))}
                  </>
                )}

                <TouchableOpacity style={[styles.botonPrincipal, { backgroundColor: '#2563EB' }]} disabled={procesando} onPress={() => corregirPerfil("Recalcular este perfil", `Se vuelven a calcular las reseñas, la calificación y las obras terminadas de ${usuarioExpandido.nombre} con lo que de verdad existe en Firebase.`, 'recalcular', { uid: usuarioExpandido.id })}>
                  <Ionicons name="refresh" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Recalcular reseñas y obras</Text>
                </TouchableOpacity>

                <Text style={styles.seccion}>Reportes en su contra ({reportesContra(usuarioExpandido.id).length})</Text>
                {reportesContra(usuarioExpandido.id).length === 0 ? <Text style={styles.vacioTexto}>No tiene reportes en su contra.</Text>
                  : reportesContra(usuarioExpandido.id).map(q => {
                    const tipo = TIPOS_REPORTE[tipoDe(q)];
                    return (
                      <View key={q.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: tipo.color }]}>
                        <View style={styles.filaEntre}>
                          <Text style={[styles.tipoTexto, { color: tipo.color, marginLeft: 0 }]}>{tipo.texto}</Text>
                          <Etiqueta texto={q.estado === 'Resuelta' ? 'RESUELTO' : 'POR RESOLVER'} color={q.estado === 'Resuelta' ? COLOR.resuelto : COLOR.pendiente} />
                        </View>
                        <Text style={styles.tituloTarjeta}>{q.motivo}</Text>
                        <Text style={styles.datoChico}>Lo reportó: {conRol(q.nombre_reportante, q.rol_reportante)} · {new Date(q.fecha_reporte).toLocaleDateString('es-MX')}</Text>
                        <Text style={[styles.datoChico, { fontStyle: 'italic' }]} numberOfLines={3}>{q.descripcion}</Text>
                      </View>
                    );
                  })}

                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, backgroundColor: usuarioExpandido.estado_cuenta === 'Bloqueada' ? COLOR.resuelto : COLOR.pendiente, marginRight: 6 }]} disabled={procesando} onPress={() => alternarBloqueoUsuario(usuarioExpandido)}>
                    <Ionicons name={usuarioExpandido.estado_cuenta === 'Bloqueada' ? 'lock-open' : 'lock-closed'} size={16} color="#FFF" />
                    <Text style={styles.botonPrincipalTexto}>{usuarioExpandido.estado_cuenta === 'Bloqueada' ? 'Desbloquear' : 'Bloquear'}</Text>
                  </TouchableOpacity>
                  {/* BORRAR CUENTAS: SOLO EL ADMINISTRADOR PRINCIPAL */}
                  {esPrincipal && (
                    <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, backgroundColor: COLOR.bloqueada, marginLeft: 6 }]} disabled={procesando} onPress={() => eliminarUsuarioCompleto(usuarioExpandido)}>
                      <Ionicons name="trash" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Eliminar cuenta</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            </SafeAreaView>
          )}
        </View>
      </Modal>

      {/* DETALLE DE UNA VACANTE */}
      <Modal visible={!!vacanteExpandida} animationType="slide" transparent onRequestClose={() => setVacanteExpandida(null)}>
        <View style={styles.modalFondo}>
          {vacanteExpandida && (
            <View style={[styles.modalCaja, { maxHeight: '90%', padding: 0, overflow: 'hidden' }]}>
              <View style={[styles.panelEncabezado, { backgroundColor: '#7C3AED' }]}>
                <Text style={styles.panelTitulo}>Detalle de la vacante</Text>
                <TouchableOpacity onPress={() => setVacanteExpandida(null)}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 18 }}>
                <Text style={styles.nombreAdmin}>{vacanteExpandida.titulo}</Text>
                <TouchableOpacity onPress={() => verPerfilDe(vacanteExpandida.id_contratista)}><Text style={[styles.datoChico, { color: COLOR.contratista, fontWeight: 'bold' }]}>{conRol(vacanteExpandida.contratista, 'contratista')} · {vacanteExpandida.empresa} ›</Text></TouchableOpacity>
                {vacanteExpandida.foto_trabajo ? (
                  <TouchableOpacity onPress={() => setFotoGrande(vacanteExpandida.foto_trabajo)}><Image source={{ uri: vacanteExpandida.foto_trabajo }} style={styles.fotoVacante} /></TouchableOpacity>
                ) : null}
                <Text style={styles.datoChico}>{[vacanteExpandida.ubicacion, vacanteExpandida.estado_republica].filter(Boolean).join(', ')}</Text>
                {vacanteExpandida.lugar_obra_texto ? <Text style={styles.datoChico}>Lugar de la obra: {vacanteExpandida.lugar_obra_texto}</Text> : null}
                <Text style={styles.datoChico}>{vacanteExpandida.pago}</Text>
                <Text style={styles.datoChico}>{vacanteExpandida.horario}</Text>
                <Text style={[styles.descripcionTexto, { marginTop: 8 }]}>{vacanteExpandida.descripcion}</Text>
                <Text style={[styles.datoChico, { marginTop: 8, fontWeight: 'bold' }]}>{vacanteExpandida.cupo_actual || 0} de {vacanteExpandida.cupo_total || 1} contratados</Text>
                <TouchableOpacity style={[styles.botonPrincipal, { backgroundColor: COLOR.bloqueada, marginTop: 16 }]} onPress={() => eliminarVacante(vacanteExpandida.id)} disabled={procesando}>
                  <Ionicons name="trash" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Eliminar esta vacante</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* EXPEDIENTE DE UNA OBRA: PARTES, DÍAS, CANCELACIÓN, DINERO, REPORTES Y BITÁCORA, TODO EN UN LUGAR */}
      <Modal visible={!!obraExpandida} animationType="slide" transparent onRequestClose={() => setObraExpandida(null)}>
        <View style={styles.modalFondoOscuro}>
          {obraExpandida && (() => {
            const c = obraExpandida;
            const estilo = estiloEstado(c.estado);
            const reportesObra = reportesDeObra(c.id);
            const canceloTrabajador = c.cancelado_por === c.id_trabajador;
            return (
              <SafeAreaView style={styles.panelCompleto}>
                <View style={[styles.panelEncabezado, { backgroundColor: estilo.color }]}>
                  <Text style={[styles.panelTitulo, { flex: 1 }]} numberOfLines={1}>Expediente de la obra</Text>
                  <TouchableOpacity onPress={() => setObraExpandida(null)}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  <View style={styles.tarjeta}>
                    <Text style={styles.nombreAdmin}>{c.titulo_vacante || c.vacante?.titulo}</Text>
                    <View style={{ alignSelf: 'center', marginTop: 6 }}><Etiqueta texto={estilo.texto} color={estilo.color} /></View>
                    <Text style={[styles.datoChico, { textAlign: 'center' }]}>ID: {c.id}</Text>
                    <TouchableOpacity onPress={() => verPerfilDe(c.id_trabajador)}><Text style={[styles.datoChico, { marginTop: 8 }]}><Text style={{ color: COLOR.trabajador, fontWeight: 'bold' }}>Trabajador:</Text> {c.nombre_trabajador || '—'} ›</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => verPerfilDe(c.id_contratista)}><Text style={styles.datoChico}><Text style={{ color: COLOR.contratista, fontWeight: 'bold' }}>Contratista:</Text> {c.contratista || c.vacante?.contratista || '—'} ›</Text></TouchableOpacity>
                    {textoDiasObra(c) ? <Text style={styles.datoChico}>Días de trabajo: {textoDiasObra(c)}</Text> : null}
                    <Text style={styles.datoChico}>{c.fecha_postulacion ? `Trato iniciado: ${c.fecha_postulacion}` : ''}{c.fecha_inicio ? ` · Aceptado: ${c.fecha_inicio}` : ''}{c.fecha_fin ? ` · Terminó: ${c.fecha_fin}` : ''}</Text>
                    {c.vacante?.ubicacion ? <Text style={styles.datoChico}>Lugar: {c.vacante.lugar_texto || c.vacante.ubicacion}</Text> : null}
                  </View>

                  {c.motivo_cancelacion ? (
                    <View style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: '#DC2626' }]}>
                      <Text style={styles.seccionChica}>CANCELACIÓN</Text>
                      <Text style={styles.datoChico}>La canceló: {canceloTrabajador ? conRol(c.nombre_trabajador, 'trabajador') : conRol(c.contratista, 'contratista')}{c.timestamp_cancelacion ? ` · ${new Date(c.timestamp_cancelacion).toLocaleString('es-MX')}` : ''}</Text>
                      <Text style={[styles.descripcionTexto, { marginTop: 4 }]}>"{c.motivo_cancelacion}"</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                        {c.cancelacion_tardia ? <Etiqueta texto="TARDÍA (MENOS DE 48 H)" color="#B91C1C" fondo="#FEE2E2" /> : c.cancelacion_tardia === false ? <Etiqueta texto="CON TIEMPO" color={COLOR.resuelto} fondo="#ECFDF5" /> : null}
                        {c.republicada && <Etiqueta texto="EL CONTRATISTA LA VOLVIÓ A PUBLICAR" color="#1D4ED8" fondo="#DBEAFE" />}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.tarjeta}>
                    <Text style={styles.seccionChica}>DINERO</Text>
                    <Text style={styles.datoChico}>Pago acordado: {c.vacante?.pago || 'A convenir'}</Text>
                    <Text style={styles.datoChico}>Registrado por el contratista: ${dineroYaPagado(c).toLocaleString('es-MX')} · Confirmado por el trabajador: ${totalRecibido(c).toLocaleString('es-MX')}</Text>
                    {(c.pagos || []).map((p: any) => (
                      <TouchableOpacity key={p.id} style={styles.filaPago} onPress={() => p.comprobante && setFotoGrande(p.comprobante)}>
                        <Text style={[styles.datoChico, { flex: 1, marginTop: 0 }]}>${Number(p.monto).toLocaleString('es-MX')} · {p.concepto} · {p.fecha}</Text>
                        <Text style={[styles.datoChico, { marginTop: 0, fontWeight: 'bold', color: p.estado === 'Recibido' ? COLOR.resuelto : p.estado === 'No recibido' ? COLOR.bloqueada : COLOR.pendiente }]}>{p.estado}{p.comprobante ? ' ›' : ''}</Text>
                      </TouchableOpacity>
                    ))}
                    {ajustesDePago(c).map((a: any, i: number) => <Text key={i} style={[styles.datoChico, { color: a.tipo === 'extra' ? '#047857' : '#B91C1C', fontWeight: 'bold' }]}>{a.tipo === 'extra' ? '+' : '−'} {a.texto}</Text>)}
                  </View>

                  <Text style={styles.seccion}>Reportes de esta obra ({reportesObra.length})</Text>
                  {reportesObra.length === 0 ? <Text style={styles.vacioTexto}>No tiene reportes.</Text> : reportesObra.map(q => (
                    <TouchableOpacity key={q.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: TIPOS_REPORTE[tipoDe(q)].color }]}
                      onPress={() => { setObraExpandida(null); setPestañaActiva('Reportes'); setVistaReportes(q.estado === 'Resuelta' ? 'Historial' : 'Pendientes'); setFiltroTipo('todos'); setAsignacion('todos'); setPeriodoReportes('todo'); setBusquedaReportes(q.id); }}>
                      <View style={styles.filaEntre}>
                        <Text style={[styles.tituloTarjeta, { flex: 1, fontSize: 15 }]}>{q.motivo}</Text>
                        <Etiqueta texto={q.estado === 'Resuelta' ? 'RESUELTO' : 'POR RESOLVER'} color={q.estado === 'Resuelta' ? COLOR.resuelto : COLOR.pendiente} />
                      </View>
                      <Text style={styles.datoChico}>{conRol(q.nombre_reportante, q.rol_reportante)} · {new Date(q.fecha_reporte).toLocaleDateString('es-MX')} · {q.version_acusado ? 'Las dos versiones' : 'Falta la versión de la otra parte'}</Text>
                      {q.resolucion ? <Text style={[styles.datoChico, { color: '#065F46' }]} numberOfLines={3}>Decisión: {q.resolucion}</Text> : null}
                    </TouchableOpacity>
                  ))}

                  <Text style={styles.seccion}>Bitácora {bitacoraObra ? `(${bitacoraObra.length} días)` : ''}</Text>
                  {!bitacoraObra ? <ActivityIndicator color={COLOR.marino} /> : bitacoraObra.length === 0 ? <Text style={styles.vacioTexto}>Todavía no hay días registrados.</Text>
                    : [...bitacoraObra].reverse().map(d => {
                      const e = estiloDia(d);
                      return (
                        <View key={d.id} style={[styles.tarjeta, { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 5, borderLeftColor: e.color }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.tituloTarjeta, { fontSize: 15 }]}>{d.fecha} · <Text style={{ color: e.color }}>{e.texto}</Text></Text>
                            {d.nota ? <Text style={styles.datoChico} numberOfLines={3}>{d.nota}</Text> : null}
                            {d.distancia_obra_km != null ? <Text style={styles.datoChico}>GPS: a {Number(d.distancia_obra_km).toFixed(2)} km de la obra{d.lugar_registro ? ` (${d.lugar_registro})` : ''}</Text> : null}
                          </View>
                          {d.evidencia ? <TouchableOpacity onPress={() => setFotoGrande(d.evidencia)}><Image source={{ uri: d.evidencia }} style={styles.miniatura} /></TouchableOpacity> : null}
                        </View>
                      );
                    })}
                </ScrollView>
              </SafeAreaView>
            );
          })()}
        </View>
      </Modal>

      {/* EDITAR MI PERFIL */}
      <Modal visible={modalEditarAdmin} animationType="slide" transparent onRequestClose={() => setModalEditarAdmin(false)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior="padding">
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>Editar mi perfil</Text>
            <Text style={styles.modalEtiqueta}>Nombre completo</Text>
            <TextInput style={styles.modalInput} value={editAdminNombre} onChangeText={setEditAdminNombre} />
            <Text style={styles.modalEtiqueta}>Cargo (ej. Soporte, Director)</Text>
            <TextInput style={styles.modalInput} value={editAdminCargo} onChangeText={setEditAdminCargo} />
            <View style={styles.modalBotones}>
              <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalEditarAdmin(false)}><Text style={styles.modalCancelarTexto}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalGuardar, { backgroundColor: COLOR.marino }]} onPress={guardarPerfilAdmin} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalGuardarTexto}>Guardar</Text>}</TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* AGREGAR PERSONAL DE MONITOREO */}
      <Modal visible={modalCrear} animationType="slide" transparent onRequestClose={() => setModalCrear(false)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior="padding">
          <View style={[styles.modalCaja, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitulo}>Agregar personal de monitoreo</Text>
              <Text style={[styles.datoChico, { marginBottom: 12 }]}>No sube INE. Se le crea una cuenta y le llega un correo de PalanteMX para crear su contraseña: así comprobamos que el correo es suyo. Después entra con ese correo y verá este panel (sin poder agregar personal ni borrar cuentas).</Text>
              <Text style={styles.modalEtiqueta}>Puesto</Text>
              <View style={styles.pickerCaja}>
                <Picker selectedValue={nuevoRol} onValueChange={setNuevoRol}>
                  <Picker.Item label="Soporte Técnico" value="Soporte Técnico" />
                  <Picker.Item label="Auditor Legal" value="Auditor Legal" />
                  <Picker.Item label="Moderador de Quejas" value="Moderador" />
                </Picker>
              </View>
              <Text style={styles.modalEtiqueta}>Nombre</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Ana Laura" value={nuevoNombre} onChangeText={setNuevoNombre} />
              <Text style={styles.modalEtiqueta}>Correo</Text>
              <TextInput style={styles.modalInput} placeholder="soporte@palantemx.com" value={nuevoCorreo} onChangeText={setNuevoCorreo} keyboardType="email-address" autoCapitalize="none" />
              <View style={styles.modalBotones}>
                <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalCrear(false)}><Text style={styles.modalCancelarTexto}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalGuardar, { backgroundColor: COLOR.resuelto }]} onPress={crearPersonalMonitoreo} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalGuardarTexto}>Agregar</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  selectorDatos: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 14 },
  selectorDatosBoton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  selectorDatosActivo: { borderBottomColor: '#0D2340' },
  selectorDatosTexto: { fontSize: 15, fontWeight: 'bold', color: '#9CA3AF' },
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, color: COLOR.marino, fontWeight: 'bold' },

  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.marino, paddingHorizontal: 16, paddingVertical: 16 },
  headerTitulo: { color: '#FFF', fontSize: 21, fontWeight: 'bold' },
  headerSub: { color: '#9CA3AF', fontSize: 14 },

  seccion: { fontSize: 17, fontWeight: 'bold', color: COLOR.marino, marginTop: 6, marginBottom: 10 },
  seccionChica: { fontSize: 13, fontWeight: 'bold', color: '#9CA3AF', letterSpacing: 0.5 },
  filaAtender: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 5 },
  iconoAtender: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  resumenTexto: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 16 },

  segmentos: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 12 },
  segmento: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentoActivo: { backgroundColor: '#FFF', elevation: 1 },
  segmentoTexto: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  segmentoTextoActivo: { color: COLOR.marino, fontWeight: 'bold' },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, backgroundColor: '#FFF' },
  chipTexto: { fontSize: 14, fontWeight: 'bold' },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6, marginBottom: 4, alignSelf: 'flex-start' },
  etiquetaTexto: { fontSize: 13, fontWeight: 'bold' },

  tarjeta: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipoTexto: { fontSize: 14, fontWeight: 'bold', marginLeft: 6 },
  fecha: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  tituloTarjeta: { fontSize: 17, fontWeight: 'bold', color: COLOR.marino, marginTop: 2 },
  obraTexto: { fontSize: 14, color: '#B45309', fontWeight: 'bold', marginTop: 2 },
  partes: { flexDirection: 'row', marginTop: 10 },
  parte: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  parteEtiqueta: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', letterSpacing: 0.5 },
  parteNombre: { fontSize: 15, fontWeight: 'bold', color: '#1F2937', marginTop: 2 },
  parteRol: { fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  descripcion: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 10 },
  descripcionTexto: { fontSize: 15, color: '#4B5563', lineHeight: 21 },
  miniatura: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: '#E5E7EB' },
  botonPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, marginTop: 12 },
  botonPrincipalTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 6 },
  resolucion: { backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#A7F3D0' },
  resolucionTexto: { fontSize: 14, color: '#065F46', fontWeight: 'bold' },
  resolucionNota: { fontSize: 14, color: '#047857', marginTop: 3 },
  resolucionPie: { fontSize: 13, color: '#6B7280', marginTop: 6 },
  vacioTitulo: { fontSize: 18, fontWeight: 'bold', color: COLOR.marino, marginTop: 10 },
  vacioTexto: { color: '#9CA3AF', textAlign: 'center', marginVertical: 12 },

  buscador: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 },
  conteo: { fontSize: 13, color: '#9CA3AF', marginBottom: 8, fontWeight: '600' },
  verMas: { backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', marginBottom: 12 },
  verMasTexto: { color: COLOR.marino, fontWeight: 'bold', fontSize: 15 },
  resultado: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, padding: 10, marginBottom: 6 },
  resultadoTexto: { flex: 1, marginLeft: 8, fontSize: 15, color: '#1F2937' },
  verTodos: { color: '#2563EB', fontWeight: 'bold', fontSize: 14, marginBottom: 10, marginLeft: 4 },
  versionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 4 },
  filaPago: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingVertical: 6, marginTop: 4 },
  buscadorInput: { flex: 1, paddingVertical: 10, marginLeft: 8, fontSize: 16, color: '#1F2937' },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#E5E7EB' },
  datoChico: { fontSize: 14, color: '#6B7280', marginTop: 2 },

  fotoAdmin: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E5E7EB' },
  camara: { position: 'absolute', bottom: 2, right: 2, backgroundColor: COLOR.marino, borderRadius: 14, padding: 6, borderWidth: 2, borderColor: '#FFF' },
  nombreAdmin: { fontSize: 21, fontWeight: 'bold', color: COLOR.marino, marginTop: 8, textAlign: 'center' },
  cargoAdmin: { fontSize: 15, color: '#6B7280', fontWeight: 'bold' },
  botonChico: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.resuelto, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  botonChicoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14, marginLeft: 4 },
  iconoEquipo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  fotoVacante: { width: '100%', height: 170, borderRadius: 12, marginVertical: 10, backgroundColor: '#E5E7EB' },

  barra: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E5E7EB', paddingVertical: 10, elevation: 15 },
  barraBoton: { flex: 1, alignItems: 'center' },
  barraTexto: { fontSize: 13, color: '#9CA3AF', marginTop: 3, fontWeight: '600' },
  globo: { position: 'absolute', top: -4, right: -10, backgroundColor: COLOR.pendiente, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  globoTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  modalFondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalFondoOscuro: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', paddingTop: 30 },
  modalCaja: { backgroundColor: '#FFF', borderRadius: 20, padding: 22 },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', color: COLOR.marino, marginBottom: 14 },
  modalEtiqueta: { fontSize: 15, fontWeight: 'bold', color: COLOR.marino, marginBottom: 6 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16, color: '#1F2937' },
  modalBotones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  modalCancelar: { padding: 12, marginRight: 8 },
  modalCancelarTexto: { color: '#6B7280', fontWeight: 'bold' },
  modalGuardar: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, minWidth: 130, alignItems: 'center' },
  modalGuardarTexto: { color: '#FFF', fontWeight: 'bold' },
  opcion: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 8 },
  opcionTexto: { marginLeft: 8, fontWeight: 'bold', color: '#1F2937', flex: 1 },
  filaBloquear: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#FECACA' },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 12, overflow: 'hidden' },
  panelCompleto: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  panelEncabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  panelTitulo: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
});
