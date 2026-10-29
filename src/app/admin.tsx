// PANEL DEL ADMINISTRADOR. ORGANIZADO EN 5 PESTAÑAS (BARRA DE ABAJO) Y CON UN CÓDIGO DE COLORES FIJO:
//   REPORTES:  ROJO = CANCELACIÓN DE OBRA · NARANJA = BITÁCORA RECHAZADA · MORADO = INCUMPLIMIENTO · AZUL = CHAT / OTROS
//   ESTADO:    ÁMBAR = PENDIENTE · VERDE = RESUELTO
//   USUARIOS:  VERDE = TRABAJADOR · AZUL = CONTRATISTA · ROJO = CUENTA BLOQUEADA
//   OBRAS:     LOS MISMOS COLORES DE ESTADO QUE VEN TRABAJADORES Y CONTRATISTAS (lib/contratos)
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { accionContrato, ESTADOS, estiloEstado, resolverReporte, totalDescuentos } from '@/lib/contratos';
import { PerfilTrabajador } from '@/components/perfil-trabajador';
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

type TipoReporte = 'cancelacion' | 'bitacora' | 'incumplimiento' | 'otro';
const TIPOS_REPORTE: Record<TipoReporte, { texto: string; color: string; fondo: string; icono: keyof typeof Ionicons.glyphMap }> = {
  cancelacion: { texto: 'Cancelación de obra', color: '#DC2626', fondo: '#FEE2E2', icono: 'close-circle' },
  bitacora: { texto: 'Bitácora rechazada', color: '#EA580C', fondo: '#FFEDD5', icono: 'reader' },
  incumplimiento: { texto: 'Incumplimiento', color: '#7C3AED', fondo: '#EDE9FE', icono: 'flag' },
  otro: { texto: 'Chat / otros', color: '#2563EB', fondo: '#DBEAFE', icono: 'chatbubbles' },
};

// QUÉ PUEDE DECIDIR EL ADMIN SEGÚN EL TIPO DE REPORTE. LAS CANCELACIONES DE OBRA SE DECIDEN CON EL CONTRATO
// (REACTIVAR O CANCELAR); LOS DEMÁS, CON /reportes. EN TODOS SE ESCRIBE UNA NOTA QUE LES LLEGA A LAS DOS PARTES.
const esCancelacion = (q: any) => !!q.id_contrato && (q.tipo === 'cancelacion' || (!q.tipo && q.motivo === 'Cancelación de obra'));
const tipoDe = (q: any): TipoReporte => esCancelacion(q) ? 'cancelacion' : q.tipo === 'bitacora' ? 'bitacora' : q.tipo === 'incumplimiento' ? 'incumplimiento' : 'otro';
const opcionesDeReporte = (q: any): { valor: string; texto: string; color: string }[] => {
  if (esCancelacion(q)) return [
    { valor: 'admin_reactivar', texto: 'Reactivar la obra', color: '#059669' },
    { valor: 'admin_cancelar', texto: 'Cancelar definitivamente', color: '#DC2626' },
  ];
  if (q.tipo === 'bitacora') return [
    { valor: 'a_favor_trabajador', texto: 'El trabajador tiene razón: el día cuenta', color: '#059669' },
    { valor: 'a_favor_contratista', texto: 'El contratista tiene razón: se descuenta el día', color: '#DC2626' },
  ];
  return [
    { valor: 'procede', texto: `${q.nombre_reportante || 'Quien reporta'} tiene razón`, color: '#059669' },
    { valor: 'no_procede', texto: 'El reporte no procede', color: '#6B7280' },
  ];
};
// SOLO SE PUEDE DESCONTAR DINERO CUANDO SE LE DA LA RAZÓN A QUIEN REPORTÓ (EL DESCUENTO ES PARA EL REPORTADO)
const permiteDescuento = (decision: string) => decision === 'procede' || decision === 'a_favor_contratista';

const PESTAÑAS = [
  { clave: 'Resumen', icono: 'grid' },
  { clave: 'Reportes', icono: 'shield' },
  { clave: 'Usuarios', icono: 'people' },
  { clave: 'Obras', icono: 'construct' },
  { clave: 'Equipo', icono: 'person-circle' },
] as const;

export default function AdminDashboard() {
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [pestañaActiva, setPestañaActiva] = useState('Resumen');

  // FILTROS DE CADA PESTAÑA
  const [vistaReportes, setVistaReportes] = useState<'Pendientes' | 'Historial'>('Pendientes');
  const [filtroTipo, setFiltroTipo] = useState<TipoReporte | 'todos'>('todos');
  const [vistaUsuarios, setVistaUsuarios] = useState<'Trabajadores' | 'Contratistas'>('Trabajadores');
  const [busquedaUsuarios, setBusquedaUsuarios] = useState('');
  const [soloBloqueadas, setSoloBloqueadas] = useState(false);
  const [vistaObras, setVistaObras] = useState<'Contratos' | 'Vacantes'>('Contratos');
  const [filtroEstadoObra, setFiltroEstadoObra] = useState('todos');

  // DATOS DEL SISTEMA
  const [adminData, setAdminData] = useState<any>({ nombre: 'Administrador Principal', cargo: 'Super Admin', foto: '' });
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [contratistas, setContratistas] = useState<any[]>([]);
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [quejas, setQuejas] = useState<any[]>([]);
  const [personalSoporte, setPersonalSoporte] = useState<any[]>([]);

  const [usuarioExpandido, setUsuarioExpandido] = useState<any>(null);
  const [vacanteExpandida, setVacanteExpandida] = useState<any>(null);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);

  // VENTANA PARA RESOLVER UN REPORTE: DECISIÓN, NOTA PARA LAS DOS PARTES Y DESCUENTO OPCIONAL
  const [quejaResolviendo, setQuejaResolviendo] = useState<any>(null);
  const [decision, setDecision] = useState('');
  const [notaAdmin, setNotaAdmin] = useState('');
  const [descuento, setDescuento] = useState('');

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

      if (adminDoc.exists()) {
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

  const crearPersonalMonitoreo = async () => {
    if (!nuevoNombre || !nuevoCorreo) { Alert.alert("Faltan datos", "Llena los campos obligatorios."); return; }
    setProcesando(true);
    try {
      await setDoc(doc(db, 'Equipo_Soporte', new Date().getTime().toString()), {
        nombre: nuevoNombre.toUpperCase(), correo: nuevoCorreo, rol_usuario: nuevoRol, estado_cuenta: 'Activa',
        fecha_registro: new Date().toISOString(), permisos: ['monitoreo', 'resolucion_quejas'],
      });
      Alert.alert("Éxito", `Se registró a ${nuevoNombre} como ${nuevoRol}.`);
      setModalCrear(false); setNuevoNombre(''); setNuevoCorreo('');
      await cargarDatosAdmin();
    } catch (error) { Alert.alert("Error", "No se pudo registrar en la base de datos."); }
    setProcesando(false);
  };

  const alternarBloqueoUsuario = (usuario: any) => {
    const coleccion = usuario.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas';
    const nuevoEstado = usuario.estado_cuenta === 'Bloqueada' ? 'Activa' : 'Bloqueada';
    Alert.alert(nuevoEstado === 'Bloqueada' ? "Bloquear cuenta" : "Desbloquear cuenta", `¿Marcar la cuenta de ${usuario.nombre} como ${nuevoEstado}?`, [
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
  const eliminarUsuarioCompleto = (id: string, nombre: string) => {
    Alert.alert("ELIMINACIÓN DEFINITIVA", `¿Eliminar a ${nombre} de la plataforma permanentemente? Se borra su perfil, sus datos de verificación y su acceso.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: 'destructive', onPress: async () => {
          setProcesando(true);
          try {
            await eliminarCuentaEnServidor(id);
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

  const eliminarObraDeUsuario = (idUsuario: string, idObra: string) => {
    Alert.alert("Borrar obra del portafolio", "¿Eliminar este trabajo del perfil de este usuario?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          setProcesando(true);
          try {
            const userRef = doc(db, 'Usuarios', idUsuario);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
              const portafolioActualizado = (userDoc.data().portafolio || []).filter((o: any) => o && o.id_obra !== idObra);
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

  // ABRE EL PERFIL DE QUIEN REPORTA O DE QUIEN FUE REPORTADO (PARA NO CONFUNDIR PERSONAS CON EL MISMO NOMBRE)
  const verPerfilDe = (id: string) => {
    const usuario = [...trabajadores, ...contratistas].find(u => u.id === id);
    if (usuario) setUsuarioExpandido(usuario);
    else Alert.alert("Perfil no encontrado", "Esta cuenta ya no existe o fue eliminada.");
  };

  const abrirResolucion = (queja: any) => { setQuejaResolviendo(queja); setDecision(''); setNotaAdmin(''); setDescuento(''); };

  // RESUELVE EL REPORTE EN EL SERVIDOR: CAMBIA LA OBRA O EL DÍA DE BITÁCORA SI TOCA, APLICA EL DESCUENTO,
  // ARCHIVA EL REPORTE Y LES MANDA UNA NOTIFICACIÓN CON LA NOTA A LAS DOS PARTES
  const confirmarResolucion = async () => {
    if (!decision) { Alert.alert("Aviso", "Elige tu decisión."); return; }
    if (!notaAdmin.trim()) { Alert.alert("Aviso", "Escribe una nota explicando tu decisión. Les llegará a las dos partes."); return; }
    const monto = permiteDescuento(decision) ? parseInt(descuento) || 0 : 0;
    setProcesando(true);
    try {
      if (esCancelacion(quejaResolviendo)) {
        await accionContrato(decision as 'admin_reactivar' | 'admin_cancelar', { id_contrato: quejaResolviendo.id_contrato, nota: notaAdmin.trim() });
      } else {
        await resolverReporte(quejaResolviendo.id, decision, notaAdmin.trim(), monto);
      }
      setQuejaResolviendo(null);
      await cargarDatosAdmin();
      Alert.alert("Reporte resuelto", "Se archivó en el historial y se les notificó la decisión a las dos partes.");
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  if (cargando) { return ( <View style={styles.loadingCenter}><ActivityIndicator size="large" color={COLOR.marino} /><Text style={styles.loadingText}>Cargando el panel...</Text></View> ); }

  // ---------------------------------------------------------------- CÁLCULOS PARA LAS PESTAÑAS

  const quejasPendientes = quejas.filter(q => q.estado !== 'Resuelta');
  const quejasResueltas = quejas.filter(q => q.estado === 'Resuelta');
  const reportesVisibles = (vistaReportes === 'Pendientes' ? quejasPendientes : quejasResueltas).filter(q => filtroTipo === 'todos' || tipoDe(q) === filtroTipo);
  const pendientesPorTipo = (Object.keys(TIPOS_REPORTE) as TipoReporte[]).map(t => ({ tipo: t, cantidad: quejasPendientes.filter(q => tipoDe(q) === t).length }));

  const usuariosVisibles = (vistaUsuarios === 'Trabajadores' ? trabajadores : contratistas)
    .filter(u => !soloBloqueadas || u.estado_cuenta === 'Bloqueada')
    .filter(u => coincide(`${u.nombre} ${u.apellidos} ${u.correo || ''} ${u.nombre_usuario || ''} ${u.oficio_principal || ''} ${u.empresa || ''} ${u.ubicacion_texto || ''} ${u.ubicacion_estado || ''}`, busquedaUsuarios));
  const reportesContra = (id: string) => quejas.filter(q => q.id_acusado === id);

  const estadosObra = [ESTADOS.PROPUESTA, ESTADOS.PENDIENTE, ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.SUSPENDIDA, ESTADOS.FINALIZADA, ESTADOS.CANCELADA, ESTADOS.RECHAZADA];
  const contratosVisibles = contratos.filter(c => filtroEstadoObra === 'todos' || c.estado === filtroEstadoObra);
  const cuenta = (estado: string) => contratos.filter(c => c.estado === estado).length;

  const tarjetasResumen = [
    { titulo: 'Reportes pendientes', numero: quejasPendientes.length, color: COLOR.pendiente, icono: 'alert-circle' as const, ir: () => { setPestañaActiva('Reportes'); setVistaReportes('Pendientes'); setFiltroTipo('todos'); } },
    { titulo: 'Obras suspendidas', numero: cuenta(ESTADOS.SUSPENDIDA), color: '#DC2626', icono: 'pause-circle' as const, ir: () => { setPestañaActiva('Obras'); setVistaObras('Contratos'); setFiltroEstadoObra(ESTADOS.SUSPENDIDA); } },
    { titulo: 'Obras activas', numero: cuenta(ESTADOS.ACTIVA), color: '#00D06C', icono: 'hammer' as const, ir: () => { setPestañaActiva('Obras'); setVistaObras('Contratos'); setFiltroEstadoObra(ESTADOS.ACTIVA); } },
    { titulo: 'Obras finalizadas', numero: cuenta(ESTADOS.FINALIZADA), color: COLOR.marino, icono: 'flag' as const, ir: () => { setPestañaActiva('Obras'); setVistaObras('Contratos'); setFiltroEstadoObra(ESTADOS.FINALIZADA); } },
    { titulo: 'Trabajadores', numero: trabajadores.length, color: COLOR.trabajador, icono: 'construct' as const, ir: () => { setPestañaActiva('Usuarios'); setVistaUsuarios('Trabajadores'); } },
    { titulo: 'Contratistas', numero: contratistas.length, color: COLOR.contratista, icono: 'business' as const, ir: () => { setPestañaActiva('Usuarios'); setVistaUsuarios('Contratistas'); } },
    { titulo: 'Vacantes activas', numero: vacantes.filter(v => v.estado === 'Activa').length, color: '#7C3AED', icono: 'megaphone' as const, ir: () => { setPestañaActiva('Obras'); setVistaObras('Vacantes'); } },
    { titulo: 'Cuentas bloqueadas', numero: [...trabajadores, ...contratistas].filter(u => u.estado_cuenta === 'Bloqueada').length, color: COLOR.bloqueada, icono: 'lock-closed' as const, ir: () => { setPestañaActiva('Usuarios'); setSoloBloqueadas(true); } },
  ];

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
          <Etiqueta texto={resuelta ? 'RESUELTO' : 'PENDIENTE'} color={resuelta ? COLOR.resuelto : COLOR.pendiente} />
        </View>
        <Text style={styles.fecha}>{new Date(queja.fecha_reporte).toLocaleString('es-MX')}</Text>
        <Text style={styles.tituloTarjeta}>{queja.motivo}</Text>
        {queja.titulo_obra ? <Text style={styles.obraTexto}>Obra: "{queja.titulo_obra}"</Text> : null}

        {/* QUIÉN REPORTA Y A QUIÉN: SE TOCA PARA VER SU PERFIL COMPLETO */}
        <View style={styles.partes}>
          <TouchableOpacity style={styles.parte} onPress={() => verPerfilDe(queja.id_reportante)}>
            <Text style={styles.parteEtiqueta}>REPORTA</Text>
            <Text style={styles.parteNombre} numberOfLines={1}>{queja.nombre_reportante}</Text>
            <Text style={[styles.parteRol, { color: queja.rol_reportante === 'Contratista' ? COLOR.contratista : COLOR.trabajador }]}>{queja.rol_reportante || 'Usuario'} · Ver perfil ›</Text>
          </TouchableOpacity>
          <Ionicons name="arrow-forward" size={18} color="#9CA3AF" style={{ alignSelf: 'center' }} />
          <TouchableOpacity style={styles.parte} onPress={() => verPerfilDe(queja.id_acusado)}>
            <Text style={styles.parteEtiqueta}>REPORTADO</Text>
            <Text style={styles.parteNombre} numberOfLines={1}>{queja.acusado}</Text>
            <Text style={[styles.parteRol, { color: queja.rol_acusado === 'Contratista' ? COLOR.contratista : COLOR.trabajador }]}>{queja.rol_acusado || 'Usuario'} · Ver perfil ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.descripcion}><Text style={styles.descripcionTexto}>{queja.descripcion}</Text></View>
        {queja.foto_evidencia ? (
          <TouchableOpacity style={styles.botonEvidencia} onPress={() => setFotoGrande(queja.foto_evidencia)}>
            <Ionicons name="image-outline" size={16} color={COLOR.marino} /><Text style={styles.botonEvidenciaTexto}>Ver evidencia</Text>
          </TouchableOpacity>
        ) : null}

        {!resuelta ? (
          <TouchableOpacity style={[styles.botonPrincipal, { backgroundColor: tipo.color }]} disabled={procesando} onPress={() => abrirResolucion(queja)}>
            <Ionicons name="hammer" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Resolver y notificar a los dos</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.resolucion}>
            {queja.resolucion ? <Text style={styles.resolucionTexto}>Decisión: {queja.resolucion}</Text> : null}
            {queja.nota_admin ? <Text style={styles.resolucionNota}>Nota: "{queja.nota_admin}"</Text> : null}
            <Text style={styles.resolucionPie}>🔒 Registro inmutable · Atendió: {queja.atendida_por || 'Admin'}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ENCABEZADO */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setPestañaActiva('Equipo')}>
          <Image source={{ uri: adminData.foto || undefined }} style={styles.headerFoto} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitulo}>Panel de Administración</Text>
          <Text style={styles.headerSub}>{adminData.nombre} · {adminData.cargo}</Text>
        </View>
        <TouchableOpacity onPress={refrescar} style={{ marginRight: 16 }}><Ionicons name="refresh" size={24} color="#FFF" /></TouchableOpacity>
        <TouchableOpacity onPress={cerrarSesionAdmin}><Ionicons name="log-out-outline" size={26} color="#FFF" /></TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[COLOR.marino]} />}>

        {/* ---------------------------------------------------------------- RESUMEN */}
        {pestañaActiva === 'Resumen' && (
          <View>
            <Text style={styles.seccion}>Estado de la plataforma</Text>
            <View style={styles.cuadricula}>
              {tarjetasResumen.map(t => (
                <TouchableOpacity key={t.titulo} style={[styles.cuadro, { borderTopColor: t.color }]} onPress={t.ir} activeOpacity={0.8}>
                  <View style={[styles.cuadroIcono, { backgroundColor: `${t.color}1A` }]}><Ionicons name={t.icono} size={20} color={t.color} /></View>
                  <Text style={[styles.cuadroNumero, { color: t.color }]}>{t.numero}</Text>
                  <Text style={styles.cuadroTitulo}>{t.titulo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.seccion}>Reportes pendientes por tipo</Text>
            <View style={styles.tarjeta}>
              {pendientesPorTipo.map(({ tipo, cantidad }) => (
                <TouchableOpacity key={tipo} style={styles.filaTipo} onPress={() => { setPestañaActiva('Reportes'); setVistaReportes('Pendientes'); setFiltroTipo(tipo); }}>
                  <View style={[styles.puntoTipo, { backgroundColor: TIPOS_REPORTE[tipo].color }]} />
                  <Text style={styles.filaTipoTexto}>{TIPOS_REPORTE[tipo].texto}</Text>
                  <Text style={[styles.filaTipoNumero, { color: cantidad > 0 ? TIPOS_REPORTE[tipo].color : '#9CA3AF' }]}>{cantidad}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.seccion}>Código de colores</Text>
            <View style={[styles.tarjeta, { flexDirection: 'row', flexWrap: 'wrap' }]}>
              {[
                ['#DC2626', 'Cancelación / bloqueada'], ['#EA580C', 'Bitácora rechazada'], ['#7C3AED', 'Incumplimiento'], ['#2563EB', 'Chat / contratista'],
                [COLOR.pendiente, 'Pendiente'], [COLOR.resuelto, 'Resuelto'], [COLOR.trabajador, 'Trabajador'],
              ].map(([color, texto]) => (
                <View key={texto} style={styles.leyenda}><View style={[styles.puntoTipo, { backgroundColor: color }]} /><Text style={styles.leyendaTexto}>{texto}</Text></View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------------------------------------------------------- REPORTES */}
        {pestañaActiva === 'Reportes' && (
          <View>
            <Segmentos opciones={[{ valor: 'Pendientes', texto: `Pendientes (${quejasPendientes.length})` }, { valor: 'Historial', texto: `Historial (${quejasResueltas.length})` }]} valor={vistaReportes} onCambio={setVistaReportes} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <Chip texto="Todos" color={COLOR.marino} activo={filtroTipo === 'todos'} onPress={() => setFiltroTipo('todos')} />
              {(Object.keys(TIPOS_REPORTE) as TipoReporte[]).map(t => (
                <Chip key={t} texto={TIPOS_REPORTE[t].texto} color={TIPOS_REPORTE[t].color} activo={filtroTipo === t} onPress={() => setFiltroTipo(t)} />
              ))}
            </ScrollView>
            {reportesVisibles.length > 0 ? reportesVisibles.map(q => <TarjetaReporte key={q.id} queja={q} />) : (
              <View style={styles.vacio}>
                <Ionicons name="shield-checkmark-outline" size={50} color="#D1D5DB" />
                <Text style={styles.vacioTitulo}>{vistaReportes === 'Pendientes' ? 'Sin reportes pendientes' : 'Historial vacío'}</Text>
              </View>
            )}
          </View>
        )}

        {/* ---------------------------------------------------------------- USUARIOS */}
        {pestañaActiva === 'Usuarios' && (
          <View>
            <Segmentos opciones={[{ valor: 'Trabajadores', texto: `Trabajadores (${trabajadores.length})` }, { valor: 'Contratistas', texto: `Contratistas (${contratistas.length})` }]} valor={vistaUsuarios} onCambio={setVistaUsuarios} />
            <View style={styles.buscador}>
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput style={styles.buscadorInput} placeholder="Buscar por nombre, correo, oficio, ciudad..." value={busquedaUsuarios} onChangeText={setBusquedaUsuarios} />
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <Chip texto={soloBloqueadas ? 'Solo bloqueadas ✓' : 'Solo bloqueadas'} color={COLOR.bloqueada} activo={soloBloqueadas} onPress={() => setSoloBloqueadas(!soloBloqueadas)} />
            </View>
            {usuariosVisibles.map(u => {
              const colorRol = u.rol === 'Trabajador' ? COLOR.trabajador : COLOR.contratista;
              const reportes = reportesContra(u.id);
              return (
                <TouchableOpacity key={u.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: u.estado_cuenta === 'Bloqueada' ? COLOR.bloqueada : colorRol }]} activeOpacity={0.8} onPress={() => setUsuarioExpandido(u)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: u.foto_rostro_url || undefined }} style={styles.avatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tituloTarjeta}>{u.nombre} {u.apellidos}</Text>
                      <Text style={styles.datoChico}>{u.correo}{u.numero_telefono ? ` · ${u.numero_telefono}` : ''}</Text>
                      <Text style={styles.datoChico}>{u.rol === 'Trabajador' ? (u.oficio_principal || 'Sin oficio') : (u.empresa || 'Independiente')} · {[u.ubicacion_texto, u.ubicacion_estado].filter(Boolean).join(', ') || 'Sin ubicación'}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                        <Etiqueta texto={u.rol.toUpperCase()} color={colorRol} fondo={`${colorRol}1A`} />
                        <Etiqueta texto={`★ ${u.calificacion || '0.0'}`} color="#B45309" fondo="#FEF3C7" />
                        {reportes.length > 0 && <Etiqueta texto={`${reportes.length} reporte${reportes.length > 1 ? 's' : ''}`} color="#DC2626" fondo="#FEE2E2" />}
                        {u.estado_cuenta === 'Bloqueada' && <Etiqueta texto="BLOQUEADA" color={COLOR.bloqueada} />}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>
              );
            })}
            {usuariosVisibles.length === 0 && <Text style={styles.vacioTexto}>No hay usuarios con esa búsqueda.</Text>}
          </View>
        )}

        {/* ---------------------------------------------------------------- OBRAS (CONTRATOS Y VACANTES) */}
        {pestañaActiva === 'Obras' && (
          <View>
            <Segmentos opciones={[{ valor: 'Contratos', texto: `Obras / contratos (${contratos.length})` }, { valor: 'Vacantes', texto: `Vacantes (${vacantes.length})` }]} valor={vistaObras} onCambio={setVistaObras} />

            {vistaObras === 'Contratos' ? (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Chip texto={`Todas (${contratos.length})`} color={COLOR.marino} activo={filtroEstadoObra === 'todos'} onPress={() => setFiltroEstadoObra('todos')} />
                  {estadosObra.map(e => <Chip key={e} texto={`${estiloEstado(e).texto} (${cuenta(e)})`} color={estiloEstado(e).color} activo={filtroEstadoObra === e} onPress={() => setFiltroEstadoObra(e)} />)}
                </ScrollView>
                {contratosVisibles.map(c => {
                  const estilo = estiloEstado(c.estado);
                  return (
                    <View key={c.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: estilo.color }]}>
                      <View style={styles.filaEntre}>
                        <Text style={[styles.tituloTarjeta, { flex: 1 }]} numberOfLines={2}>{c.titulo_vacante || c.vacante?.titulo}</Text>
                        <Etiqueta texto={estilo.texto} color={estilo.color} />
                      </View>
                      <TouchableOpacity onPress={() => verPerfilDe(c.id_trabajador)}><Text style={styles.datoChico}><Text style={{ color: COLOR.trabajador, fontWeight: 'bold' }}>Trabajador:</Text> {c.nombre_trabajador || '—'} ›</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => verPerfilDe(c.id_contratista)}><Text style={styles.datoChico}><Text style={{ color: COLOR.contratista, fontWeight: 'bold' }}>Contratista:</Text> {c.contratista || c.vacante?.contratista || '—'} ›</Text></TouchableOpacity>
                      <Text style={styles.datoChico}>{c.vacante?.pago || ''}{c.fecha_inicio ? ` · Inició: ${c.fecha_inicio}` : ''}{c.fecha_fin ? ` · Terminó: ${c.fecha_fin}` : ''}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                        {(c.reportes_abiertos || 0) > 0 && <Etiqueta texto={`${c.reportes_abiertos} reporte(s) abierto(s)`} color={COLOR.pendiente} fondo="#FEF3C7" />}
                        {totalDescuentos(c) > 0 && <Etiqueta texto={`Descuentos: $${totalDescuentos(c).toLocaleString('es-MX')}`} color="#DC2626" fondo="#FEE2E2" />}
                      </View>
                    </View>
                  );
                })}
                {contratosVisibles.length === 0 && <Text style={styles.vacioTexto}>No hay obras en este estado.</Text>}
              </View>
            ) : (
              <View>
                {vacantes.map(v => (
                  <TouchableOpacity key={v.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: v.estado === 'Activa' ? '#7C3AED' : '#9CA3AF' }]} activeOpacity={0.8} onPress={() => setVacanteExpandida(v)}>
                    <View style={styles.filaEntre}>
                      <Text style={[styles.tituloTarjeta, { flex: 1 }]} numberOfLines={2}>{v.titulo}</Text>
                      <Etiqueta texto={v.estado === 'Activa' ? 'ACTIVA' : 'CERRADA'} color={v.estado === 'Activa' ? '#7C3AED' : '#6B7280'} />
                    </View>
                    <Text style={styles.datoChico}>Publicó: {v.contratista} · {new Date(v.fecha_publicacion).toLocaleDateString('es-MX')}</Text>
                    <Text style={styles.datoChico}>{[v.ubicacion, v.estado_republica].filter(Boolean).join(', ')} · {v.pago} · {v.cupo_actual || 0}/{v.cupo_total || 1} contratados</Text>
                  </TouchableOpacity>
                ))}
                {vacantes.length === 0 && <Text style={styles.vacioTexto}>No hay vacantes publicadas.</Text>}
              </View>
            )}
          </View>
        )}

        {/* ---------------------------------------------------------------- EQUIPO / MI PERFIL */}
        {pestañaActiva === 'Equipo' && (
          <View>
            <View style={[styles.tarjeta, { alignItems: 'center' }]}>
              <TouchableOpacity onPress={cambiarFotoAdmin}>
                <Image source={{ uri: adminData.foto || undefined }} style={styles.fotoAdmin} />
                <View style={styles.camara}><Ionicons name="camera" size={14} color="#FFF" /></View>
              </TouchableOpacity>
              <Text style={styles.nombreAdmin}>{adminData.nombre}</Text>
              <Text style={styles.cargoAdmin}>{adminData.cargo}</Text>
              <TouchableOpacity style={[styles.botonPrincipal, { backgroundColor: COLOR.marino, alignSelf: 'stretch' }]} onPress={() => setModalEditarAdmin(true)}>
                <Ionicons name="pencil" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Editar mi perfil</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filaEntre}>
              <Text style={styles.seccion}>Equipo de monitoreo ({personalSoporte.length})</Text>
              <TouchableOpacity style={styles.botonChico} onPress={() => setModalCrear(true)}><Ionicons name="person-add" size={14} color="#FFF" /><Text style={styles.botonChicoTexto}>Agregar</Text></TouchableOpacity>
            </View>
            {personalSoporte.map(s => (
              <View key={s.id} style={[styles.tarjeta, { flexDirection: 'row', alignItems: 'center' }]}>
                <View style={styles.iconoEquipo}><Ionicons name="headset" size={20} color={COLOR.resuelto} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tituloTarjeta}>{s.nombre}</Text>
                  <Text style={styles.datoChico}>{s.rol_usuario} · {s.correo}</Text>
                </View>
              </View>
            ))}
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

      {/* RESOLVER UN REPORTE */}
      <Modal visible={!!quejaResolviendo} animationType="fade" transparent onRequestClose={() => setQuejaResolviendo(null)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior="padding">
          <View style={[styles.modalCaja, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {quejaResolviendo && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Ionicons name={TIPOS_REPORTE[tipoDe(quejaResolviendo)].icono} size={22} color={TIPOS_REPORTE[tipoDe(quejaResolviendo)].color} />
                    <Text style={[styles.modalTitulo, { marginLeft: 8, marginBottom: 0 }]}>Resolver reporte</Text>
                  </View>
                  <Text style={styles.datoChico}>{quejaResolviendo.motivo}{quejaResolviendo.titulo_obra ? ` · "${quejaResolviendo.titulo_obra}"` : ''}</Text>
                  <Text style={[styles.datoChico, { marginBottom: 12 }]}>{quejaResolviendo.nombre_reportante} → {quejaResolviendo.acusado}</Text>

                  <Text style={styles.modalEtiqueta}>Tu decisión</Text>
                  {opcionesDeReporte(quejaResolviendo).map(op => (
                    <TouchableOpacity key={op.valor} style={[styles.opcion, decision === op.valor && { borderColor: op.color, backgroundColor: `${op.color}14` }]} onPress={() => setDecision(op.valor)}>
                      <Ionicons name={decision === op.valor ? 'radio-button-on' : 'radio-button-off'} size={20} color={op.color} />
                      <Text style={styles.opcionTexto}>{op.texto}</Text>
                    </TouchableOpacity>
                  ))}

                  {permiteDescuento(decision) && (
                    <>
                      <Text style={[styles.modalEtiqueta, { marginTop: 8 }]}>Descuento a {quejaResolviendo.acusado} (opcional, en pesos)</Text>
                      <TextInput style={styles.modalInput} keyboardType="numeric" placeholder="0 = sin descuento" value={descuento} onChangeText={t => setDescuento(t.replace(/[^0-9]/g, ''))} />
                    </>
                  )}

                  <Text style={[styles.modalEtiqueta, { marginTop: 8 }]}>Nota para las dos partes (obligatoria)</Text>
                  <TextInput style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]} multiline value={notaAdmin} onChangeText={setNotaAdmin} placeholder="Ej. Revisamos la evidencia: el contratista no entregó el material acordado..." />
                  <Text style={[styles.datoChico, { marginBottom: 10 }]}>Se les enviará una notificación con tu decisión{permiteDescuento(decision) ? ', el descuento' : ''} y esta nota.</Text>

                  <View style={styles.modalBotones}>
                    <TouchableOpacity style={styles.modalCancelar} onPress={() => setQuejaResolviendo(null)}><Text style={styles.modalCancelarTexto}>Volver</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalGuardar, { backgroundColor: COLOR.marino }]} onPress={confirmarResolucion} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalGuardarTexto}>Resolver</Text>}</TouchableOpacity>
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
                  <Text style={styles.datoChico}>KYC (INE + rostro): {usuarioExpandido.kyc_aprobado ? '✅ Verificado' : '❌ No verificado'}</Text>
                </View>

                {usuarioExpandido.rol === 'Trabajador' ? (
                  <PerfilTrabajador trabajador={usuarioExpandido} onEliminarObra={(idObra) => eliminarObraDeUsuario(usuarioExpandido.id, idObra)} />
                ) : (
                  <View style={[styles.tarjeta, { alignItems: 'center' }]}>
                    <TouchableOpacity onPress={() => usuarioExpandido.foto_rostro_url && setFotoGrande(usuarioExpandido.foto_rostro_url)}>
                      <Image source={{ uri: usuarioExpandido.foto_rostro_url || undefined }} style={styles.fotoAdmin} />
                    </TouchableOpacity>
                    <Text style={styles.nombreAdmin}>{usuarioExpandido.nombre} {usuarioExpandido.apellidos}</Text>
                    <Text style={styles.datoChico}>{usuarioExpandido.empresa || 'Contratista independiente'}</Text>
                    <Text style={styles.datoChico}>{[usuarioExpandido.ubicacion_texto, usuarioExpandido.ubicacion_estado].filter(Boolean).join(', ') || 'Sin ubicación'}</Text>
                    <Text style={[styles.datoChico, { color: '#B45309', fontWeight: 'bold' }]}>★ {usuarioExpandido.calificacion || '0.0'} ({usuarioExpandido.numero_resenas || 0} reseñas)</Text>
                    <Text style={styles.datoChico}>{vacantes.filter(v => v.id_contratista === usuarioExpandido.id).length} vacantes · {contratos.filter(c => c.id_contratista === usuarioExpandido.id && c.estado === ESTADOS.FINALIZADA).length} obras finalizadas</Text>
                  </View>
                )}

                <Text style={styles.seccion}>Reportes en su contra ({reportesContra(usuarioExpandido.id).length})</Text>
                {reportesContra(usuarioExpandido.id).length === 0 ? <Text style={styles.vacioTexto}>No tiene reportes en su contra.</Text>
                  : reportesContra(usuarioExpandido.id).map(q => {
                    const tipo = TIPOS_REPORTE[tipoDe(q)];
                    return (
                      <View key={q.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: tipo.color }]}>
                        <View style={styles.filaEntre}>
                          <Text style={[styles.tipoTexto, { color: tipo.color, marginLeft: 0 }]}>{tipo.texto}</Text>
                          <Etiqueta texto={q.estado === 'Resuelta' ? 'RESUELTO' : 'PENDIENTE'} color={q.estado === 'Resuelta' ? COLOR.resuelto : COLOR.pendiente} />
                        </View>
                        <Text style={styles.tituloTarjeta}>{q.motivo}</Text>
                        <Text style={styles.datoChico}>Reportó: {q.nombre_reportante} · {new Date(q.fecha_reporte).toLocaleDateString('es-MX')}</Text>
                        <Text style={[styles.datoChico, { fontStyle: 'italic' }]} numberOfLines={3}>{q.descripcion}</Text>
                      </View>
                    );
                  })}

                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, backgroundColor: usuarioExpandido.estado_cuenta === 'Bloqueada' ? COLOR.resuelto : COLOR.pendiente, marginRight: 6 }]} disabled={procesando} onPress={() => alternarBloqueoUsuario(usuarioExpandido)}>
                    <Ionicons name={usuarioExpandido.estado_cuenta === 'Bloqueada' ? 'lock-open' : 'lock-closed'} size={16} color="#FFF" />
                    <Text style={styles.botonPrincipalTexto}>{usuarioExpandido.estado_cuenta === 'Bloqueada' ? 'Desbloquear' : 'Bloquear'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.botonPrincipal, { flex: 1, backgroundColor: COLOR.bloqueada, marginLeft: 6 }]} disabled={procesando} onPress={() => eliminarUsuarioCompleto(usuarioExpandido.id, usuarioExpandido.nombre)}>
                    <Ionicons name="trash" size={16} color="#FFF" /><Text style={styles.botonPrincipalTexto}>Eliminar cuenta</Text>
                  </TouchableOpacity>
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
                <TouchableOpacity onPress={() => verPerfilDe(vacanteExpandida.id_contratista)}><Text style={[styles.datoChico, { color: COLOR.contratista, fontWeight: 'bold' }]}>{vacanteExpandida.contratista} · {vacanteExpandida.empresa} ›</Text></TouchableOpacity>
                {vacanteExpandida.foto_trabajo ? (
                  <TouchableOpacity onPress={() => setFotoGrande(vacanteExpandida.foto_trabajo)}><Image source={{ uri: vacanteExpandida.foto_trabajo }} style={styles.fotoVacante} /></TouchableOpacity>
                ) : null}
                <Text style={styles.datoChico}>📍 {[vacanteExpandida.ubicacion, vacanteExpandida.estado_republica].filter(Boolean).join(', ')}</Text>
                <Text style={styles.datoChico}>💵 {vacanteExpandida.pago}</Text>
                <Text style={styles.datoChico}>🕒 {vacanteExpandida.horario}</Text>
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
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, color: COLOR.marino, fontWeight: 'bold' },

  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.marino, paddingHorizontal: 16, paddingVertical: 14 },
  headerFoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1E3A5F', borderWidth: 2, borderColor: '#FFF' },
  headerTitulo: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  headerSub: { color: '#9CA3AF', fontSize: 12 },

  seccion: { fontSize: 16, fontWeight: 'bold', color: COLOR.marino, marginTop: 6, marginBottom: 10 },
  seccionChica: { fontSize: 11, fontWeight: 'bold', color: '#9CA3AF', letterSpacing: 0.5 },
  cuadricula: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
  cuadro: { width: '48.5%', backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, borderTopWidth: 4, elevation: 1 },
  cuadroIcono: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cuadroNumero: { fontSize: 26, fontWeight: 'bold', marginTop: 6 },
  cuadroTitulo: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  filaTipo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  puntoTipo: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  filaTipoTexto: { flex: 1, fontSize: 14, color: '#1F2937', fontWeight: '600' },
  filaTipoNumero: { fontSize: 16, fontWeight: 'bold', marginRight: 6 },
  leyenda: { flexDirection: 'row', alignItems: 'center', width: '50%', marginBottom: 6 },
  leyendaTexto: { fontSize: 12, color: '#4B5563' },

  segmentos: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 12 },
  segmento: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentoActivo: { backgroundColor: '#FFF', elevation: 1 },
  segmentoTexto: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  segmentoTextoActivo: { color: COLOR.marino, fontWeight: 'bold' },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, backgroundColor: '#FFF' },
  chipTexto: { fontSize: 12, fontWeight: 'bold' },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6, marginBottom: 4, alignSelf: 'flex-start' },
  etiquetaTexto: { fontSize: 10, fontWeight: 'bold' },

  tarjeta: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipoTexto: { fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  fecha: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  tituloTarjeta: { fontSize: 15, fontWeight: 'bold', color: COLOR.marino, marginTop: 2 },
  obraTexto: { fontSize: 12, color: '#B45309', fontWeight: 'bold', marginTop: 2 },
  partes: { flexDirection: 'row', marginTop: 10 },
  parte: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  parteEtiqueta: { fontSize: 9, fontWeight: 'bold', color: '#9CA3AF', letterSpacing: 0.5 },
  parteNombre: { fontSize: 13, fontWeight: 'bold', color: '#1F2937', marginTop: 2 },
  parteRol: { fontSize: 11, fontWeight: 'bold', marginTop: 2 },
  descripcion: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 10 },
  descripcionTexto: { fontSize: 13, color: '#4B5563', lineHeight: 18 },
  botonEvidencia: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  botonEvidenciaTexto: { fontSize: 12, fontWeight: 'bold', color: COLOR.marino, marginLeft: 5 },
  botonPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, marginTop: 12 },
  botonPrincipalTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  resolucion: { backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#A7F3D0' },
  resolucionTexto: { fontSize: 12, color: '#065F46', fontWeight: 'bold' },
  resolucionNota: { fontSize: 12, color: '#047857', marginTop: 3 },
  resolucionPie: { fontSize: 11, color: '#6B7280', marginTop: 6 },
  vacio: { alignItems: 'center', marginTop: 40 },
  vacioTitulo: { fontSize: 15, fontWeight: 'bold', color: COLOR.marino, marginTop: 10 },
  vacioTexto: { color: '#9CA3AF', textAlign: 'center', marginVertical: 12 },

  buscador: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 },
  buscadorInput: { flex: 1, paddingVertical: 10, marginLeft: 8, fontSize: 14, color: '#1F2937' },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#E5E7EB' },
  datoChico: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  fotoAdmin: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E5E7EB' },
  camara: { position: 'absolute', bottom: 2, right: 2, backgroundColor: COLOR.marino, borderRadius: 14, padding: 6, borderWidth: 2, borderColor: '#FFF' },
  nombreAdmin: { fontSize: 20, fontWeight: 'bold', color: COLOR.marino, marginTop: 8, textAlign: 'center' },
  cargoAdmin: { fontSize: 13, color: '#6B7280', fontWeight: 'bold' },
  botonChico: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.resuelto, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  botonChicoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  iconoEquipo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  fotoVacante: { width: '100%', height: 170, borderRadius: 12, marginVertical: 10, backgroundColor: '#E5E7EB' },

  barra: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E5E7EB', paddingVertical: 10, elevation: 15 },
  barraBoton: { flex: 1, alignItems: 'center' },
  barraTexto: { fontSize: 11, color: '#9CA3AF', marginTop: 3, fontWeight: '600' },
  globo: { position: 'absolute', top: -4, right: -10, backgroundColor: COLOR.pendiente, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  globoTexto: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  modalFondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalFondoOscuro: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', paddingTop: 30 },
  modalCaja: { backgroundColor: '#FFF', borderRadius: 20, padding: 22 },
  modalTitulo: { fontSize: 19, fontWeight: 'bold', color: COLOR.marino, marginBottom: 14 },
  modalEtiqueta: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 14, color: '#1F2937' },
  modalBotones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  modalCancelar: { padding: 12, marginRight: 8 },
  modalCancelarTexto: { color: '#6B7280', fontWeight: 'bold' },
  modalGuardar: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, minWidth: 110, alignItems: 'center' },
  modalGuardarTexto: { color: '#FFF', fontWeight: 'bold' },
  opcion: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 8 },
  opcionTexto: { marginLeft: 8, fontWeight: 'bold', color: '#1F2937', flex: 1 },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 12, overflow: 'hidden' },
  panelCompleto: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  panelEncabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  panelTitulo: { color: '#FFF', fontWeight: 'bold', fontSize: 17 },
});
