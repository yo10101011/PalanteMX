import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, LogBox, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// IGNORAR EL ERROR FALSO DE FIREBASE WEBCHANNEL EN EXPO
LogBox.ignoreLogs(['@firebase/firestore', "WebChannelConnection RPC", "Name: undefined Message: undefined"]);

// FIREBASE REAL
// @ts-ignore
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { subirFotoACloudinary } from '@/lib/cloudinary';
import { eliminarCuentaEnServidor } from '@/lib/cuenta';
import { abrirChatCon, accionContrato, AccionContrato, ESTADOS, avisoRevisionCierre, claveDia, MENSAJES_INICIALES, sePuedeCalificar, sePuedeRepublicar, textoDiasObra, tieneReporteAbierto, diasObraDe, type DiasObra } from '@/lib/contratos';
import { coincide } from '@/lib/busqueda';
import { useMensajesSinLeer } from '@/lib/mensajes';
import { distanciaKm, ESTADOS_MEXICO, nombreDeLugar, PERIODOS_PAGO, textoDias, textoDistancia, textoPrecio, actualizarMiUbicacion, ubicacionPrecisa } from '@/lib/ubicacion';
import { BuscadorConSugerencias } from '@/components/buscador-sugerencias';
import { BarraSuperior } from '@/components/barra-superior';
import { registrarActividad } from '@/lib/actividad';
import { CampanaNotificaciones } from '@/components/campana-notificaciones';
import { FiltrosBusqueda, TODOS_LOS_ESTADOS } from '@/components/filtros-busqueda';
import { PerfilTrabajador } from '@/components/perfil-trabajador';
import { FormCondiciones } from '@/components/condiciones-obra';
import { ModalPagos } from '@/components/modal-pagos';
import { SelectorMapa } from '@/components/selector-mapa';
import { SelectorOficio } from '@/components/selector-oficio';
import { SelectorDiasObra } from '@/components/selector-dias-obra';
import { SelectorUbicacion } from '@/components/selector-ubicacion';
import { avisoOficio, OFICIOS, oficioCoincide } from '@/lib/oficios';
import { ModalBitacora } from '@/components/modal-bitacora';
import { ModalCancelarContrato } from '@/components/modal-cancelar-contrato';
import { ModalReportarProblema } from '@/components/modal-reportar-problema';
import { ModalReportesObra } from '@/components/modal-reportes-obra';
import { ModalRepublicar } from '@/components/modal-republicar';
import { BotonContrato, TarjetaContrato } from '@/components/tarjeta-contrato';
import { VisorFoto } from '@/components/visor-foto';

// ORDEN DE LOS TRABAJADORES EN EXPLORAR
const ORDENES_TRABAJADORES = [
  { valor: 'calificacion', texto: 'Mejor calificados' },
  { valor: 'cercania', texto: 'Más cerca de mí' },
  { valor: 'precio', texto: 'Menor precio' },
];

// TÍTULO DEL ENCABEZADO CORTO DE CADA PESTAÑA (LA PESTAÑA "PERFIL" TIENE SU PROPIO ENCABEZADO GRANDE)
const TITULOS_PESTAÑA: Record<string, { titulo: string; sub: string }> = {
  Explorar: { titulo: 'Explorar talentos', sub: 'Encuentra a los mejores trabajadores para tu obra' },
  Vacantes: { titulo: 'Mis anuncios', sub: 'Publica y administra tus vacantes' },
  Obras: { titulo: 'Mis obras', sub: 'Bitácora, cierre o cancelación de cada obra' },
  Candidatos: { titulo: 'Solicitudes', sub: 'Trabajadores que se postularon y propuestas que enviaste' },
};

const { width } = Dimensions.get('window');

export default function DashboardContratista() {
  const params = useLocalSearchParams(); // LECTOR DE PARÁMETROS DE NAVEGACIÓN (P. EJ. { tab: 'Vacantes' } DESDE MENSAJES)
  const [userData, setUserData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [pestañaActiva, setPestañaActiva] = useState('Explorar'); 
  const [ubicacionLegible, setUbicacionLegible] = useState('Calculando ubicación...');
  
  const [categoriaExplorar, setCategoriaExplorar] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState(TODOS_LOS_ESTADOS);
  const [ordenExplorar, setOrdenExplorar] = useState('calificacion');
  const [precioMaximo, setPrecioMaximo] = useState('');
  const [diasFiltro, setDiasFiltro] = useState<string[]>([]);
  const [busquedaExplorar, setBusquedaExplorar] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const mensajesSinLeer = useMensajesSinLeer(); // PUNTO ROJO DEL BOTÓN "MENSAJES", EN TIEMPO REAL
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);

  const [directorio, setDirectorio] = useState<any[]>([]); 
  const [misVacantes, setMisVacantes] = useState<any[]>([]);
  const [candidatos, setCandidatos] = useState<any[]>([]);

  const [modalEditar, setModalEditar] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editApellidos, setEditApellidos] = useState('');
  const [editEmpresa, setEditEmpresa] = useState('');
  const [editUbicacion, setEditUbicacion] = useState('');
  const [editEstado, setEditEstado] = useState('');

  const [modalVacante, setModalVacante] = useState(false);
  const [vacanteEditandoId, setVacanteEditandoId] = useState<string | null>(null);
  const [vacanteExpandida, setVacanteExpandida] = useState<any>(null); 
  const [vacanteTitulo, setVacanteTitulo] = useState('');
  const [vacanteUbicacion, setVacanteUbicacion] = useState('');
  const [vacantePago, setVacantePago] = useState(''); // MONTO EN PESOS (SOLO NÚMEROS)
  const [vacantePeriodo, setVacantePeriodo] = useState('por semana');
  const [vacanteEstado, setVacanteEstado] = useState('');
  // LUGAR EXACTO DE LA OBRA (GPS). CON ÉL SE COMPRUEBA QUE EL TRABAJADOR SÍ ESTÁ AHÍ CUANDO LLENA SU BITÁCORA
  const [vacanteLugar, setVacanteLugar] = useState<{ latitud: number; longitud: number } | null>(null);
  const [vacanteLugarTexto, setVacanteLugarTexto] = useState(''); // NOMBRE DEL LUGAR ("Palmillas, San Felipe del Progreso")
  const [buscandoLugar, setBuscandoLugar] = useState(false);
  const [mapaVisible, setMapaVisible] = useState(false);
  const [vacanteCondiciones, setVacanteCondiciones] = useState<Record<string, string>>({});
  const [seccionPerfil, setSeccionPerfil] = useState<'Reseñas' | 'Obras' | 'Ajustes'>('Reseñas');
  // SE GUARDA EL ID (NO EL CONTRATO) PARA QUE LA VENTANA DE PAGOS MUESTRE LOS DATOS RECIÉN RECARGADOS
  const [idContratoPagos, setIdContratoPagos] = useState<string | null>(null);
  const [vacanteHorario, setVacanteHorario] = useState('');
  const [vacanteDias, setVacanteDias] = useState<DiasObra>({ inicio: '', fin: '', dias: [] }); // CUÁNDO SE TRABAJA
  const [contratoFecha, setContratoFecha] = useState<any>(null); // CONTRATO AL QUE SE LE CAMBIAN LOS DÍAS DE TRABAJO
  const [nuevosDias, setNuevosDias] = useState<DiasObra>({ inicio: '', fin: '', dias: [] });
  const [vacanteDesc, setVacanteDesc] = useState('');
  const [vacanteCupo, setVacanteCupo] = useState('1'); 
  const [vacanteCategoria, setVacanteCategoria] = useState('Albañilería');
  const [vacanteFoto, setVacanteFoto] = useState<string | null>(null);

  const [candidatoSeleccionado, setCandidatoSeleccionado] = useState<any>(null);
  
  // ESTADOS PARA PERFIL Y CONTRATACIÓN DIRECTA
  const [perfilTrabajadorExpandido, setPerfilTrabajadorExpandido] = useState<any>(null);
  // VENTANAS DE BITÁCORA (SOLO LECTURA PARA EL CONTRATISTA) Y DE CANCELACIÓN DE UNA OBRA
  const [contratoBitacora, setContratoBitacora] = useState<any>(null);
  const [contratoCancelar, setContratoCancelar] = useState<any>(null);
  const [contratoReportar, setContratoReportar] = useState<any>(null);
  const [contratoReportes, setContratoReportes] = useState<any>(null);     // REPORTES DE LA OBRA (LAS DOS VERSIONES)
  const [contratoRepublicar, setContratoRepublicar] = useState<any>(null); // OBRA CANCELADA QUE SE VUELVE A PUBLICAR
  const [modalContratarDirecto, setModalContratarDirecto] = useState(false);
  const [trabajadorParaContratar, setTrabajadorParaContratar] = useState<any>(null);
  const [vacanteSeleccionadaParaContratar, setVacanteSeleccionadaParaContratar] = useState<string>('');

  const [modalQueja, setModalQueja] = useState(false);
  const [listaUsuariosSistema, setListaUsuariosSistema] = useState<any[]>([]); 
  const [busquedaUsuario, setBusquedaUsuario] = useState(''); 
  const [usuarioSeleccionadoParaQueja, setUsuarioSeleccionadoParaQueja] = useState<any>(null); 
  const [quejaMotivo, setQuejaMotivo] = useState('Abandono de Obra');
  const [quejaDesc, setQuejaDesc] = useState('');
  const [quejaFoto, setQuejaFoto] = useState<string | null>(null);

  const [modalEvaluar, setModalEvaluar] = useState(false);
  const [listaUsuariosEvaluar, setListaUsuariosEvaluar] = useState<any[]>([]);
  const [busquedaUsuarioEvaluar, setBusquedaUsuarioEvaluar] = useState('');
  const [usuarioSeleccionadoParaEvaluar, setUsuarioSeleccionadoParaEvaluar] = useState<any>(null);
  const [evaluarEstrellas, setEvaluarEstrellas] = useState('5');
  const [evaluarComentario, setEvaluarComentario] = useState('');

  const cargarPerfil = async () => {
    try {
      const usuarioActual = auth.currentUser;
      if (!usuarioActual) { router.replace('/' as any); return; }

      let userDoc = await getDoc(doc(db, 'Contratistas', usuarioActual.uid));
      if (!userDoc.exists()) userDoc = await getDoc(doc(db, 'Usuarios', usuarioActual.uid));

      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({ id: userDoc.id, refPath: userDoc.ref.path, ...data });
        setEditNombre(data.nombre || '');
        setEditApellidos(data.apellidos || '');
        setEditEmpresa(data.empresa || '');

        // CIUDAD Y ESTADO: LOS QUE EL USUARIO ELIGIÓ. SI NO HAY, SE CALCULAN DEL GPS DEL REGISTRO SIN DETENER LA PANTALLA
        // (SE GUARDA ubicacion_estado PORQUE CON ÉL FILTRAN LOS DEMÁS USUARIOS)
        setUbicacionLegible([data.ubicacion_texto, data.ubicacion_estado].filter(Boolean).join(', ') || 'Sin ubicación');
        setEditUbicacion(data.ubicacion_texto || '');
        setEditEstado(data.ubicacion_estado || '');
        // ACTUALIZA SU UBICACIÓN (SI LA NUEVA LECTURA ES MÁS PRECISA) Y LLENA ESTADO Y MUNICIPIO SI FALTAN
        actualizarMiUbicacion(data, campos => updateDoc(doc(db, userDoc.ref.path), campos)).then(campos => {
          if (!campos) return;
          const estado = (campos.ubicacion_estado as string) || data.ubicacion_estado || '';
          const municipio = (campos.ubicacion_texto as string) || data.ubicacion_texto || '';
          setUbicacionLegible([municipio, estado].filter(Boolean).join(', ') || 'Sin ubicación');
          setEditUbicacion(municipio);
          setEditEstado(estado);
          setUserData((u: any) => ({ ...u, ...campos }));
        });

        await cargarDirectorio();

        const qVacantes = query(collection(db, 'Vacantes'), where('id_contratista', '==', usuarioActual.uid));
        const vacantesSnap = await getDocs(qVacantes);
        
        const listaVac: any[] = vacantesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        listaVac.sort((a, b) => new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime());
        setMisVacantes(listaVac);

        // MIS CONTRATOS (SOLICITUDES, PROPUESTAS, OBRAS...). LAS REGLAS SOLO DEJAN LEER LOS PROPIOS,
        // ASÍ QUE SE PIDEN DIRECTAMENTE (ANTES SE DESCARGABAN LOS DE TODA LA PLATAFORMA Y SE FILTRABAN AQUÍ)
        const snapContratos = await getDocs(query(collection(db, 'Postulaciones'), where('id_contratista', '==', usuarioActual.uid)));
        const lista: any[] = snapContratos.docs.map(d => ({ id: d.id, ...d.data() }));
        const idsTrabajadores = [...new Set(lista.map(c => c.id_trabajador).filter(Boolean))];
        const trabajadores: Record<string, any> = {};
        await Promise.all(idsTrabajadores.map(async id => {
          const trabajadorDoc = await getDoc(doc(db, 'Usuarios', id));
          if (trabajadorDoc.exists()) trabajadores[id] = { id, ...trabajadorDoc.data() };
        }));
        lista.forEach(c => { c.trabajador = trabajadores[c.id_trabajador] || { id: c.id_trabajador, nombre: c.nombre_trabajador || 'Trabajador', apellidos: '' }; });
        lista.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setCandidatos(lista);
      }
    } catch (error) { if (auth.currentUser) console.log("Error cargando el panel del contratista:", error); } finally { setCargando(false); }
  };

  // TRABAJADORES DE EXPLORAR. SE VUELVEN A LEER CADA VEZ QUE SE ENTRA A EXPLORAR, PARA VER SUS OBRAS Y RESEÑAS AL DÍA.
  // EL ORDEN Y LOS FILTROS SE APLICAN AL DIBUJAR (VER directorioFiltrado)
  const cargarDirectorio = async () => {
    try {
      const snapDir = await getDocs(collection(db, 'Usuarios'));
      setDirectorio(snapDir.docs.map(d => ({id: d.id, ...d.data()})));
    } catch (error) { console.log("Error cargando trabajadores", error); }
  };

  const refrescar = async () => { setRefrescando(true); await cargarPerfil(); setRefrescando(false); };

  useEffect(() => { cargarPerfil(); registrarActividad('Contratista'); }, []);
  useEffect(() => { if (pestañaActiva === 'Explorar' && !cargando) cargarDirectorio(); }, [pestañaActiva]);

  // SI VENIMOS DE OTRA PANTALLA (P. EJ. LA BARRA DE MENSAJES), ABRIR LA PESTAÑA QUE PIDIÓ
  useEffect(() => {
    if (params.tab) { setPestañaActiva(params.tab as string); }
    if (params.tab === 'Perfil' && params.abrir === 'resenas') setSeccionPerfil('Reseñas');
  }, [params.tab, params.t]);

  // SI SE TOCÓ UNA NOTIFICACIÓN: ABRIR LA BITÁCORA O LOS PAGOS DE ESA OBRA (CUANDO YA ESTÁN CARGADAS LAS OBRAS)
  const avisoAtendidoRef = useRef(''); // PARA ABRIRLO UNA SOLA VEZ POR CADA TOQUE DE NOTIFICACIÓN
  useEffect(() => {
    if (!params.contrato || cargando || avisoAtendidoRef.current === params.t) return;
    const contrato = candidatos.find(c => c.id === params.contrato);
    if (!contrato) return;
    avisoAtendidoRef.current = String(params.t);
    if (params.abrir === 'bitacora') setContratoBitacora(contrato);
    if (params.abrir === 'pagos') setIdContratoPagos(contrato.id);
    if (params.abrir === 'reportes') setContratoReportes(contrato);
    if (params.abrir === 'republicar' && sePuedeRepublicar(contrato)) setContratoRepublicar(contrato);
  }, [params.t, cargando, candidatos.length]);


  const seleccionarFoto = async (destino: 'perfil' | 'vacante' | 'queja') => {
    // SIN allowsEditing: ASÍ NO APARECE LA PANTALLA DE RECORTE ("CORTAR") Y LA FOTO SE ELIGE DIRECTO
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (destino === 'vacante') setVacanteFoto(base64Data);
      if (destino === 'queja') setQuejaFoto(base64Data);
      if (destino === 'perfil') {
        Alert.alert("Actualizar Foto", "¿Deseas guardar esta nueva foto?", [
          { text: "Cancelar", style: "cancel" },
          { text: "OK", onPress: async () => {
              setProcesando(true);
              try {
                const urlSegura = await subirFotoACloudinary(base64Data);
                await updateDoc(doc(db, userData.refPath), { foto_rostro_url: urlSegura });
                await cargarPerfil();
              } catch (error: any) { Alert.alert("No se pudo cambiar la foto", error?.message || "Intenta de nuevo."); }
              setProcesando(false);
            }
          }
        ]);
      }
    }
  };

  const guardarEdicionPerfil = async () => {
    setProcesando(true);
    try {
      await updateDoc(doc(db, userData.refPath), { empresa: editEmpresa, ubicacion_texto: editUbicacion, ubicacion_estado: editEstado });
      await cargarPerfil(); setModalEditar(false);
    } catch (error: any) { Alert.alert("No se pudo guardar", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  const abrirModalNuevaVacante = () => {
    setVacanteLugar(null); setVacanteLugarTexto(''); setVacanteCondiciones({});
    setVacanteEditandoId(null); setVacanteTitulo(''); setVacanteUbicacion(userData?.ubicacion_texto || ''); setVacantePago(''); setVacantePeriodo('por semana'); setVacanteEstado(userData?.ubicacion_estado || ''); setVacanteHorario(''); setVacanteDias({ inicio: '', fin: '', dias: [] }); setVacanteDesc(''); setVacanteCupo('1'); setVacanteFoto(null); setVacanteCategoria('');
    setModalVacante(true);
  };

  const abrirModalEditarVacante = (vacante: any) => {
    setVacanteExpandida(null); 
    setVacanteEditandoId(vacante.id);
    setVacanteTitulo(vacante.titulo);
    setVacanteUbicacion(vacante.ubicacion);
    // LAS VACANTES VIEJAS SOLO TRAEN EL PAGO COMO TEXTO ("$2500 Semanal"): SE RESCATA EL NÚMERO
    setVacantePago(vacante.pago_monto ? String(vacante.pago_monto) : (String(vacante.pago || '').replace(/[^0-9]/g, '')));
    setVacantePeriodo(vacante.pago_periodo || 'por semana');
    setVacanteEstado(vacante.estado_republica || userData?.ubicacion_estado || '');
    setVacanteLugar(vacante.coordenadas_obra || null);
    setVacanteLugarTexto(vacante.lugar_obra_texto || '');
    setVacanteCondiciones(vacante.condiciones || {});
    setVacanteHorario(vacante.horario);
    setVacanteDias(diasObraDe(vacante));
    setVacanteDesc(vacante.descripcion);
    setVacanteCupo(vacante.cupo_total ? vacante.cupo_total.toString() : '1');
    setVacanteCategoria(vacante.categoria);
    setVacanteFoto(vacante.foto_trabajo || null);
    setModalVacante(true);
  };

  const publicarOEditarVacante = async () => {
    if (!vacanteTitulo || !vacanteCategoria || !vacanteUbicacion || !vacanteDesc || !vacanteHorario || !vacanteEstado) {
      Alert.alert("Aviso", "Faltan campos obligatorios: título, oficio, estado, municipio, horario y descripción."); return;
    }
    if (!vacanteDias.inicio) { Alert.alert("Aviso", "Elige el día en que empieza la obra. Antes de ese día el trabajador no podrá llenar la bitácora."); return; }
    if (vacanteDias.fin !== vacanteDias.inicio && vacanteDias.dias.length === 0) { Alert.alert("Aviso", "Elige qué días de la semana se trabaja. La bitácora solo se podrá llenar esos días."); return; }
    if (!vacanteCondiciones.material || !vacanteCondiciones.cuando_pago) {
      Alert.alert("Aviso", "Contesta al menos quién pone el material y cuándo se paga: así el trabajador sabe qué esperar y queda como evidencia."); return;
    }
    setProcesando(true);
    try {
      let urlFotoTrabajo = vacanteFoto;
      if (vacanteFoto && vacanteFoto.startsWith('data:image')) {
        urlFotoTrabajo = await subirFotoACloudinary(vacanteFoto);
      }
      // EL PAGO SE GUARDA COMO NÚMERO (PARA FILTRAR Y ORDENAR) Y COMO TEXTO (PARA MOSTRARLO)
      const monto = parseInt(vacantePago) || null;
      const datosVacante = {
        titulo: vacanteTitulo, ubicacion: vacanteUbicacion, estado_republica: vacanteEstado,
        pago: textoPrecio(monto, vacantePeriodo), pago_monto: monto, pago_periodo: vacantePeriodo,
        horario: vacanteHorario, inicio_obra: vacanteDias.inicio, fin_obra: vacanteDias.fin, dias_obra: vacanteDias.dias, descripcion: vacanteDesc, categoria: vacanteCategoria, cupo_total: parseInt(vacanteCupo) || 1, foto_trabajo: urlFotoTrabajo,
        coordenadas: vacanteLugar || userData.ubicacion || null, // PARA ORDENAR "MÁS CERCA DE MÍ" EN LA BOLSA DE TRABAJO
        coordenadas_obra: vacanteLugar,                          // LUGAR EXACTO PARA EL CHECK GPS DE LA BITÁCORA
        lugar_obra_texto: vacanteLugarTexto,                     // SU NOMBRE NORMAL, PARA MOSTRARLO EN LUGAR DE NÚMEROS
        condiciones: vacanteCondiciones,                         // MATERIAL, HERRAMIENTA, COMIDA... (SE COPIAN AL CONTRATO)
      };

      if (vacanteEditandoId) {
        await updateDoc(doc(db, 'Vacantes', vacanteEditandoId), datosVacante);
        Alert.alert("¡Vacante Actualizada!", "Tus cambios ya están en la Bolsa de Trabajo. Las obras que ya tenías aceptadas conservan su fecha; si quieres cambiarla, usa \"Cambiar día de inicio\" en la obra.");
      } else {
        await addDoc(collection(db, 'Vacantes'), {
          ...datosVacante,
          contratista: `${userData.nombre} ${userData.apellidos}`, foto_contratista: userData.foto_rostro_url || null, empresa: userData.empresa || 'Independiente', id_contratista: userData.id,
          cupo_actual: 0, etiquetas: ['Nueva'], estado: 'Activa', postulantes: 0, fecha_publicacion: new Date().toISOString(),
        });
        Alert.alert("¡Vacante Publicada!", "Tu oferta ya está visible en la Bolsa de Trabajo.");
      }
      await cargarPerfil();
      setModalVacante(false);
    } catch (error: any) { Alert.alert("No se pudo guardar la vacante", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  // EL CONTRATISTA PARADO EN LA OBRA TOCA EL BOTÓN Y SE GUARDA ESE PUNTO (Y SU NOMBRE) COMO EL LUGAR DE LA OBRA.
  // SI NO ESTÁ EN LA OBRA, USA "ELEGIR EN EL MAPA".
  const marcarLugarDeObra = async () => {
    setBuscandoLugar(true);
    try {
      const punto = await ubicacionPrecisa();
      setVacanteLugar({ latitud: punto.latitud, longitud: punto.longitud });
      setVacanteLugarTexto(await nombreDeLugar(punto));
    } catch (error: any) { Alert.alert("Ubicación", error?.message || "No se pudo obtener tu ubicación. Intenta de nuevo."); }
    setBuscandoLugar(false);
  };

  const cerrarVacante = async (id: string) => {
    Alert.alert("Cerrar Vacante", "¿Estás seguro que deseas ocultar esta vacante del Feed?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, Cerrar", onPress: async () => {
          setProcesando(true);
          await updateDoc(doc(db, 'Vacantes', id), { estado: 'Cerrada' });
          await cargarPerfil();
          setProcesando(false);
          setVacanteExpandida(null);
        }
      }
    ]);
  };

  // VUELVE A PONER EN LA BOLSA DE TRABAJO UNA VACANTE CERRADA QUE TODAVÍA TIENE LUGARES LIBRES
  const reabrirVacante = (vacante: any) => {
    const hoy = claveDia(new Date());
    if (vacante.inicio_obra && vacante.inicio_obra < hoy) {
      Alert.alert("Cambia la fecha", "El día de inicio de esta vacante ya pasó. Usa \"Editar Datos\" para poner los nuevos días de trabajo y después vuelve a abrirla.");
      return;
    }
    Alert.alert("Volver a abrir", `"${vacante.titulo}" aparecerá otra vez en la Bolsa de Trabajo para que se postulen trabajadores.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Abrir", onPress: async () => {
          setProcesando(true);
          try {
            await updateDoc(doc(db, 'Vacantes', vacante.id), { estado: 'Activa', fecha_publicacion: new Date().toISOString() });
            await cargarPerfil();
            setVacanteExpandida(null);
            Alert.alert("Vacante abierta", "Ya está otra vez en la Bolsa de Trabajo.");
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  const eliminarVacante = async (id: string) => {
    Alert.alert("Eliminar Vacante", "¿Estás seguro de que deseas eliminar esta vacante permanentemente? Se borrará de la base de datos.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, Eliminar", style: "destructive", onPress: async () => {
          setProcesando(true);
          try {
            await deleteDoc(doc(db, 'Vacantes', id));
            await cargarPerfil();
            setVacanteExpandida(null);
            Alert.alert("Vacante Eliminada", "La oferta ha sido borrada exitosamente.");
          } catch (error) { Alert.alert("Error", "No se pudo eliminar la vacante."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // ABRE EL PERFIL DE UN TRABAJADOR Y LO VUELVE A LEER DE FIRESTORE, PARA VER SUS OBRAS, RESEÑAS Y UBICACIÓN
  // AL DÍA (LA LISTA DE EXPLORAR SE CARGÓ AL ENTRAR Y PUEDE ESTAR VIEJA)
  const verPerfilTrabajador = async (trabajador: any, yaContratado = false) => {
    setPerfilTrabajadorExpandido({ ...trabajador, yaContratado });
    try {
      const fresco = await getDoc(doc(db, 'Usuarios', trabajador.id));
      if (fresco.exists()) setPerfilTrabajadorExpandido({ id: fresco.id, ...fresco.data(), yaContratado });
    } catch (error) { console.log("No se pudo actualizar el perfil", error); }
  };

  // --- NUEVA LÓGICA DE CONTRATACIÓN DIRECTA ---
  const iniciarContratacionDirecta = (trabajador: any) => {
    const vacantesActivas = misVacantes.filter(v => v.estado === 'Activa');
    if (vacantesActivas.length === 0) {
      Alert.alert("Sin vacantes", "No tienes vacantes activas. Publica una primero para poder proponerle la obra a este trabajador.");
      return;
    }
    setTrabajadorParaContratar(trabajador);
    // SE ELIGE PRIMERO UNA VACANTE DE SU MISMO OFICIO, SI HAY
    setVacanteSeleccionadaParaContratar((vacantesActivas.find(v => oficioCoincide(trabajador.oficio_principal, v.categoria)) || vacantesActivas[0]).id);
    setModalContratarDirecto(true);
  };

  // PROPONER UNA OBRA A UN TRABAJADOR. YA NO LO CONTRATA AL INSTANTE: QUEDA COMO "PROPUESTA" HASTA QUE ÉL ACEPTE
  // (PRIMERO PLATICAN POR CHAT). EL CUPO DE LA VACANTE SOLO SE OCUPA CUANDO LOS DOS ACEPTARON.
  const confirmarContratacionDirecta = async () => {
    setProcesando(true);
    try {
      await accionContrato('proponer', { id_vacante: vacanteSeleccionadaParaContratar, id_trabajador: trabajadorParaContratar.id });
      setModalContratarDirecto(false);
      setPerfilTrabajadorExpandido(null);
      Alert.alert("Propuesta enviada", `${trabajadorParaContratar.nombre} verá tu propuesta en su pestaña Obras. Platiquen los detalles por chat; cuando acepte, se cierra el trato.`);
      const tituloObra = misVacantes.find(v => v.id === vacanteSeleccionadaParaContratar)?.titulo || '';
      abrirChatCon({ id: trabajadorParaContratar.id, nombre: `${trabajadorParaContratar.nombre} ${trabajadorParaContratar.apellidos}`, rol: trabajadorParaContratar.oficio_principal || 'Trabajador', foto: trabajadorParaContratar.foto_rostro_url },
        MENSAJES_INICIALES.propuesta(trabajadorParaContratar.nombre, tituloObra));
    } catch (error: any) { Alert.alert("No se pudo proponer", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  const abrirModalQueja = async () => {
    setModalQueja(true); setQuejaDesc(''); setQuejaFoto(null); setBusquedaUsuario(''); setUsuarioSeleccionadoParaQueja(null);
    try {
      const snapCont = await getDocs(collection(db, 'Contratistas'));
      const snapTrab = await getDocs(collection(db, 'Usuarios'));
      const todos = [...snapCont.docs.map(d => ({id: d.id, rol: 'Contratista', ...d.data()})), ...snapTrab.docs.map(d => ({id: d.id, rol: 'Trabajador', ...d.data()}))];
      setListaUsuariosSistema(todos.filter(u => u.id !== userData.id));
    } catch (error) { console.log("Error cargando usuarios para búsqueda inteligente", error); }
  };

  const enviarQueja = async () => {
    if (!usuarioSeleccionadoParaQueja || !quejaDesc) { Alert.alert("Aviso", "Debes seleccionar a quién reportas y escribir la descripción de los hechos."); return; }
    setProcesando(true);
    let urlEvidencia = ""; if (quejaFoto) urlEvidencia = await subirFotoACloudinary(quejaFoto);
    
    const reporteOficial = { 
      id_reportante: userData.id, nombre_reportante: `${userData.nombre} ${userData.apellidos}`, rol_reportante: 'Contratista', 
      id_acusado: usuarioSeleccionadoParaQueja.id, acusado: `${usuarioSeleccionadoParaQueja.nombre} ${usuarioSeleccionadoParaQueja.apellidos}`, rol_acusado: usuarioSeleccionadoParaQueja.rol,
      motivo: quejaMotivo, descripcion: quejaDesc, foto_evidencia: urlEvidencia, estado: "En Revisión Administrativa", fecha_reporte: new Date().toISOString() 
    };

    await addDoc(collection(db, "Quejas_Soporte"), reporteOficial);
    setProcesando(false); setModalQueja(false); setBusquedaUsuario(''); setUsuarioSeleccionadoParaQueja(null); setQuejaDesc(''); setQuejaFoto(null);
    Alert.alert("Reporte Oficial Enviado", "Hemos recibido tu queja y la investigaremos.");
  };

  const abrirModalEvaluar = async () => {
    setModalEvaluar(true); setUsuarioSeleccionadoParaEvaluar(null); setBusquedaUsuarioEvaluar(''); setEvaluarComentario(''); setEvaluarEstrellas('5');
    try {
      const snapCont = await getDocs(collection(db, 'Contratistas'));
      const snapTrab = await getDocs(collection(db, 'Usuarios'));
      const todos = [...snapCont.docs.map(d => ({id: d.id, rol: 'Contratista', ...d.data()})), ...snapTrab.docs.map(d => ({id: d.id, rol: 'Trabajador', ...d.data()}))];
      setListaUsuariosEvaluar(todos.filter(u => u.id !== userData.id));
    } catch (error) { console.log("Error cargando usuarios para evaluar", error); }
  };

  // LA RESEÑA LA VALIDA Y GUARDA EL SERVIDOR (backend/kyc-worker): SOLO SE CALIFICA A QUIEN SE CONTRATÓ,
  // UNA SOLA VEZ, Y EL PROMEDIO LO CALCULA ÉL. LAS REGLAS YA NO DEJAN QUE LA APP ESCRIBA CALIFICACIONES.
  const enviarResena = async () => {
    if (!usuarioSeleccionadoParaEvaluar || !evaluarComentario.trim()) { Alert.alert("Aviso", "Selecciona a quién evaluar y escribe un comentario."); return; }
    setProcesando(true);
    try {
      const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch(`${KYC_API_URL}/resenas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ id_evaluado: usuarioSeleccionadoParaEvaluar.id, estrellas: parseInt(evaluarEstrellas), comentario: evaluarComentario.trim() }),
      });
      const resultado = await response.json();
      if (!response.ok) {
        Alert.alert("No se pudo calificar", resultado.error || "El servidor no respondió.");
      } else {
        Alert.alert("Evaluación Guardada", `Has actualizado la calificación de ${usuarioSeleccionadoParaEvaluar.nombre}.`);
        setModalEvaluar(false); setUsuarioSeleccionadoParaEvaluar(null); setEvaluarComentario(''); setBusquedaUsuarioEvaluar(''); setEvaluarEstrellas('5');
      }
    } catch (error) { Alert.alert("Error", "Ocurrió un problema al enviar la evaluación. Revisa tu conexión."); }
    setProcesando(false);
  };

  // ACEPTAR O RECHAZAR UNA SOLICITUD DE UN TRABAJADOR (LO HACE EL SERVIDOR: REVISA EL CUPO Y CIERRA LA VACANTE SI SE LLENA)
  const responderSolicitud = async (accion: 'aceptar' | 'rechazar') => {
    setProcesando(true);
    try {
      await accionContrato(accion, { id_contrato: candidatoSeleccionado.id });
      Alert.alert(accion === 'aceptar' ? "¡Trato cerrado!" : "Solicitud rechazada",
        accion === 'aceptar' ? `${candidatoSeleccionado.trabajador.nombre} ya trabaja en "${candidatoSeleccionado.titulo_vacante}". Revisa su avance en la pestaña Obras.` : "El trabajador verá que su solicitud fue rechazada.");
      setCandidatoSeleccionado(null);
      await cargarPerfil();
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setProcesando(false);
  };

  const eliminarCuenta = () => {
    Alert.alert("¡ALERTA PELIGRO!", "¿Seguro que deseas borrar tu cuenta de Contratista? Perderás todo.", [
      { text: "Cancelar", style: "cancel" }, { text: "Eliminar definitivamente", style: "destructive", onPress: async () => {
          try {
            setCargando(true);
            await eliminarCuentaEnServidor(); // BORRA PERFIL, DATOS PRIVADOS, FOTOS DE INE Y USUARIO, TODO JUNTO
            await signOut(auth).catch(() => {}); // EL USUARIO YA NO EXISTE: SOLO SE LIMPIA LA SESIÓN DEL TELÉFONO
            router.replace('/' as any);
          } catch (error: any) { setCargando(false); Alert.alert("Error", error?.message || "No se pudo eliminar la cuenta."); }
        }
      }
    ]);
  };

  const cerrarSesion = async () => {
    Alert.alert("Cerrar Sesión", "¿Estás seguro que deseas salir?", [
      { text: "Cancelar", style: "cancel" }, { text: "Sí", onPress: async () => { await signOut(auth); router.replace('/' as any); } }
    ]);
  };

  // ---------------------------------------------------------------- CONTRATOS

  // PIDE CONFIRMACIÓN, MANDA LA ACCIÓN AL SERVIDOR Y RECARGA
  const confirmarAccion = (accion: AccionContrato, contrato: any, titulo: string, pregunta: string, exito: string) => {
    Alert.alert(titulo, pregunta, [
      { text: "Volver", style: "cancel" },
      { text: "Sí", onPress: async () => {
          setProcesando(true);
          try {
            await accionContrato(accion, { id_contrato: contrato.id });
            Alert.alert("Listo", exito);
            await cargarPerfil();
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // mensaje: TEXTO LISTO PARA EMPEZAR LA PLÁTICA (LA PERSONA LO PUEDE CAMBIAR ANTES DE ENVIARLO)
  const chatearCon = (contrato: any, mensaje?: string) => abrirChatCon({
    id: contrato.id_trabajador,
    nombre: `${contrato.trabajador?.nombre || ''} ${contrato.trabajador?.apellidos || ''}`.trim() || 'Trabajador',
    rol: contrato.trabajador?.oficio_principal || 'Trabajador',
    foto: contrato.trabajador?.foto_rostro_url,
  }, mensaje);
  // UNA SOLICITUD SE PLATICA Y SE ACEPTA EN EL CHAT (AHÍ APARECE EL BOTÓN "ACEPTAR TRATO")
  // OFICIO QUE PIDE LA OBRA DE UNA SOLICITUD (LOS CONTRATOS NUEVOS LO TRAEN; LOS VIEJOS SE BUSCAN EN MIS VACANTES)
  const oficioDeVacante = (cand: any) => cand.vacante?.oficio || misVacantes.find(v => v.id === cand.id_vacante)?.categoria || '';
  const irAlChatDeSolicitud = (cand: any) => chatearCon(cand, MENSAJES_INICIALES.solicitud(cand.trabajador?.nombre || '', cand.titulo_vacante));

  // QUÉ PUEDE HACER EL CONTRATISTA CON CADA CONTRATO, SEGÚN SU ESTADO
  const botonesDelContrato = (contrato: any): BotonContrato[] => {
    const chatear: BotonContrato = { texto: 'Chatear', icono: 'chatbubbles-outline', color: '#3B82F6', onPress: () => chatearCon(contrato) };
    const bitacora: BotonContrato = { texto: 'Bitácora', icono: 'reader-outline', color: '#0D2340', onPress: () => setContratoBitacora(contrato) };
    const perfil: BotonContrato = { texto: 'Perfil', icono: 'person-outline', color: '#6B7280', onPress: () => verPerfilTrabajador(contrato.trabajador, true) };
    const reportar: BotonContrato = { texto: 'Reportar problema', icono: 'flag-outline', color: '#EA580C', onPress: () => setContratoReportar(contrato) };
    const calificar: BotonContrato = {
      texto: 'Calificar', icono: 'star-outline', color: '#F59E0B',
      onPress: () => { setUsuarioSeleccionadoParaEvaluar({ id: contrato.id_trabajador, nombre: contrato.trabajador?.nombre, apellidos: contrato.trabajador?.apellidos, foto_rostro_url: contrato.trabajador?.foto_rostro_url, rol: 'Trabajador' }); setModalEvaluar(true); },
    };

    const pagos: BotonContrato = { texto: 'Pagos', icono: 'cash-outline', color: '#059669', onPress: () => setIdContratoPagos(contrato.id) };
    const cambiarInicio: BotonContrato = { texto: 'Días de trabajo', icono: 'calendar-outline', color: '#1D4ED8', onPress: () => { setContratoFecha(contrato); setNuevosDias(diasObraDe(contrato)); } };
    const reportes: BotonContrato = { texto: 'Reportes', icono: 'document-text-outline', color: '#7C3AED', onPress: () => setContratoReportes(contrato) };
    const republicar: BotonContrato = { texto: 'Volver a publicar la obra', icono: 'refresh-circle-outline', color: '#2563EB', relleno: true, onPress: () => setContratoRepublicar(contrato) };
    // LOS REPORTES SOLO APARECEN SI LA OBRA TUVO ALGUNO (ABIERTO, POR CANCELACIÓN O CON AJUSTES DE DINERO)
    const conReportes = tieneReporteAbierto(contrato) || !!contrato.id_queja || !!contrato.revision_cierre || (contrato.ajustes_pago || []).length > 0;
    const verReportes = conReportes ? [reportes] : [];

    switch (contrato.estado) {
      // LA PROPUESTA TAMBIÉN LA ACEPTA EL CONTRATISTA EN EL CHAT (LOS DOS TIENEN QUE ACEPTAR)
      case ESTADOS.PROPUESTA: return [
        { texto: 'Ir al chat y aceptar', icono: 'chatbubbles', color: '#00D06C', relleno: true, onPress: () => chatearCon(contrato) },
        { texto: 'Retirar propuesta', icono: 'close-circle-outline', color: '#DC2626', onPress: () => confirmarAccion('rechazar', contrato, "Retirar propuesta", "¿Ya no quieres proponerle esta obra?", "Retiraste la propuesta.") },
        cambiarInicio,
      ];
      case ESTADOS.ACTIVA: return [
        { ...bitacora, texto: 'Ver bitácora', relleno: true },
        chatear,
        pagos,
        { texto: 'Marcar terminada', icono: 'flag-outline', color: tieneReporteAbierto(contrato) ? '#9CA3AF' : '#00D06C', onPress: () => tieneReporteAbierto(contrato) ? Alert.alert("Todavía no", "Hay un reporte de esta obra que el administrador está revisando. Podrás terminarla cuando lo resuelva; te avisaremos.") : confirmarAccion('solicitar_fin', contrato, "Marcar obra como terminada", `¿La obra de ${contrato.trabajador?.nombre} ya terminó? Él tendrá que confirmarlo.`, "Listo. Falta que el trabajador confirme que terminó.") },
        reportar,
        cambiarInicio,
        { texto: 'Cancelar obra', icono: 'warning-outline', color: '#DC2626', onPress: () => setContratoCancelar(contrato) },
        ...verReportes,
      ];
      // YA SE MARCÓ COMO TERMINADA: YA NO SE PUEDE CANCELAR (SI HAY UN PROBLEMA, SE REPORTA)
      case ESTADOS.POR_CONFIRMAR_FIN: return [bitacora, chatear, pagos, reportar, ...verReportes];
      // TERMINADA, SUSPENDIDA O CANCELADA: SOLO VER, PAGAR Y CALIFICAR (Y, SI SE CANCELÓ, VOLVER A PUBLICARLA)
      case ESTADOS.SUSPENDIDA:
      case ESTADOS.FINALIZADA:
      case ESTADOS.CANCELADA: return [
        ...(sePuedeRepublicar(contrato) ? [republicar] : []),
        ...verReportes,
        bitacora, { ...pagos, relleno: contrato.estado === ESTADOS.FINALIZADA && !(contrato.pagos || []).length }, perfil, calificar,
      ];
      default: return [];
    }
  };

  // QUIÉN CANCELÓ, CON CUÁNTO AVISO Y SI YA SE VOLVIÓ A PUBLICAR (EN OBRAS SUSPENDIDAS O CANCELADAS)
  const avisoCancelacion = (contrato: any) => {
    if (![ESTADOS.SUSPENDIDA, ESTADOS.CANCELADA].includes(contrato.estado) || !contrato.motivo_cancelacion) return '';
    const quien = contrato.cancelado_por === userData?.id ? 'Tú cancelaste esta obra' : `${contrato.trabajador?.nombre || 'El trabajador'} canceló esta obra`;
    const cuando = contrato.cancelacion_tardia ? ' tarde (con menos de 48 horas de aviso)' : contrato.cancelacion_tardia === false ? ' con tiempo' : '';
    const revision = contrato.estado === ESTADOS.SUSPENDIDA ? ' El administrador la está revisando.' : '';
    const publicada = contrato.republicada ? ' Ya la volviste a publicar.' : '';
    return `${quien}${cuando}: "${contrato.motivo_cancelacion}".${revision}${publicada}`;
  };

  // UNA SECCIÓN DE CONTRATOS (SOLO APARECE SI TIENE ALGUNO)
  const seccionContratos = (titulo: string, estados: string[], aviso?: string) => {
    const lista = candidatos.filter(c => estados.includes(c.estado));
    if (lista.length === 0) return null;
    return (
      <View style={{ marginBottom: 10 }}>
        <Text style={[styles.sectionTitle, { fontSize: 17 }]}>{titulo}</Text>
        {lista.map(contrato => (
          <TarjetaContrato
            key={contrato.id}
            contrato={contrato}
            otraParte={{ nombre: `${contrato.trabajador?.nombre || ''} ${contrato.trabajador?.apellidos || ''}`.trim() || 'Trabajador', foto: contrato.trabajador?.foto_rostro_url, detalle: contrato.trabajador?.oficio_principal }}
            aviso={avisoRevisionCierre(contrato) || avisoCancelacion(contrato) || aviso}
            botones={botonesDelContrato(contrato).filter(b => b.texto !== 'Calificar' || sePuedeCalificar(contrato.estado))}
            deshabilitado={procesando}
          />
        ))}
      </View>
    );
  };

  const categoriasFiltro = ['Todos', ...OFICIOS];
  // TRABAJADORES DE EXPLORAR: FILTRADOS POR OFICIO, ESTADO Y PRECIO, Y ORDENADOS (POR DEFECTO, MEJOR CALIFICADOS PRIMERO).
  // LOS QUE NO TIENEN PRECIO ("A CONVENIR") NO SE QUITAN AL FILTRAR POR PRECIO, Y QUEDAN AL FINAL AL ORDENAR POR PRECIO.
  const calificacionDe = (t: any) => parseFloat(t.calificacion) || 0;
  const directorioFiltrado = directorio
    .map(t => ({ ...t, distancia: distanciaKm(userData?.ubicacion, t.ubicacion) }))
    .filter(t => categoriaExplorar === 'Todos' || t.oficio_principal === categoriaExplorar || coincide(t.oficio_principal || '', categoriaExplorar))
    .filter(t => filtroEstado === TODOS_LOS_ESTADOS || t.ubicacion_estado === filtroEstado)
    .filter(t => !precioMaximo || !t.tarifa_monto || t.tarifa_monto <= parseInt(precioMaximo))
    // DÍAS: QUE ESTÉ DISPONIBLE EN TODOS LOS DÍAS ELEGIDOS (LOS QUE NO MARCARON DÍAS SE QUEDAN: "A CONVENIR")
    .filter(t => diasFiltro.length === 0 || !t.dias_disponibles?.length || diasFiltro.every(d => t.dias_disponibles.includes(d)))
    .filter(t => coincide(`${t.nombre} ${t.apellidos} ${t.oficio_principal || ''} ${t.ubicacion_texto || ''} ${t.ubicacion_estado || ''}`, busquedaExplorar))
    .sort((a, b) => {
      if (ordenExplorar === 'cercania') return (a.distancia ?? Infinity) - (b.distancia ?? Infinity);
      if (ordenExplorar === 'precio') return (a.tarifa_monto || Infinity) - (b.tarifa_monto || Infinity);
      return calificacionDe(b) - calificacionDe(a) || (b.numero_resenas || 0) - (a.numero_resenas || 0);
    });
  const obrasDe = (t: any) => (t.portafolio?.length || 0) + (t.obras_realizadas?.length || 0);
  // FOTOS PARA LA VISTA PREVIA DE LA TARJETA: PRIMERO LAS DE OBRAS HECHAS EN PALANTEMX, LUEGO LAS DEL PORTAFOLIO
  const fotosDe = (t: any): string[] => [
    ...(t.obras_realizadas || []).slice().reverse().flatMap((o: any) => [o.foto_trabajo, ...(o.fotos || [])]),
    ...(t.portafolio || []).filter((o: any) => o && typeof o === 'object').map((o: any) => o.foto_despues || o.foto_antes),
  ].filter(Boolean);

  // BARRA DE ARRIBA FIJA CON EL TÍTULO Y LA CAMPANA: SIEMPRE A LA VISTA, DESDE EL PRIMER INSTANTE (AUNQUE ESTÉ CARGANDO)
  const barra = (
    <BarraSuperior
      rol="Contratista"
      onCerrarSesion={cerrarSesion}
      onNuevos={cargarPerfil}
      titulo={pestañaActiva === 'Perfil' ? 'Mi perfil' : TITULOS_PESTAÑA[pestañaActiva]?.titulo || 'PalanteMX'}
      subtitulo={pestañaActiva === 'Perfil' ? 'Tus datos, reseñas y ajustes' : TITULOS_PESTAÑA[pestañaActiva]?.sub}
    />
  );

  if (cargando) { return ( <SafeAreaView style={styles.container} edges={['top', 'bottom']}>{barra}<View style={styles.loadingCenter}><ActivityIndicator size="large" color="#0D2340" /><Text style={styles.loadingText}>Cargando Panel Central...</Text></View></SafeAreaView> ); }

  const solicitudesPendientes = candidatos.filter(c => c.estado === ESTADOS.PENDIENTE);
  const trabajadoresContratados = candidatos.filter(c => c.estado === ESTADOS.ACTIVA);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {barra}
      <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={['#0D2340']} />}>

        {/* EN LA PESTAÑA "PERFIL" VA EL ENCABEZADO GRANDE CON LA FOTO; EN LAS DEMÁS BASTA LA BARRA DE ARRIBA */}
        {pestañaActiva !== 'Perfil' ? null : (
        <>
        <View style={styles.headerCover} />
        <View style={styles.profileSection}>
          <TouchableOpacity style={styles.avatarContainer} onPress={() => seleccionarFoto('perfil')}>
            <Image source={{ uri: userData?.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.avatar} />
            <View style={styles.editAvatarBadge}><Ionicons name="camera" size={14} color="#FFF" /></View>
            <View style={[styles.verifiedBadge, {backgroundColor: '#0D2340'}]}><Ionicons name="business" size={16} color="#FFF" /></View>
          </TouchableOpacity>

          <Text style={styles.userName}>{userData?.nombre} {userData?.apellidos}</Text>
          <Text style={styles.userRole}>CONTRATISTA / EMPLEADOR</Text>
          {userData?.empresa ? <Text style={styles.empresaText}>{userData.empresa}</Text> : null}
          
          <View style={styles.locationBadge}><Ionicons name="location" size={12} color="#0D2340" /><Text style={styles.locationText}>{ubicacionLegible}</Text></View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}><Text style={styles.statNumber}>{misVacantes.length}</Text><Text style={styles.statLabel}>Anuncios</Text></View><View style={styles.statDivider} />
            <View style={styles.statBox}><Text style={[styles.statNumber, {color: '#F59E0B'}]}>{solicitudesPendientes.length}</Text><Text style={styles.statLabel}>Solicitudes</Text></View><View style={styles.statDivider} />
            <View style={styles.statBox}><Text style={[styles.statNumber, {color: '#00D06C'}]}>{trabajadoresContratados.length}</Text><Text style={styles.statLabel}>Obras Activas</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}><Text style={[styles.statNumber, {color: '#F59E0B'}]}>{userData?.calificacion || '0.0'}</Text><Text style={styles.statLabel}>Calificación</Text></View>
          </View>
        </View>
        </>
        )}

        <View style={styles.contentSection}>

          {/* --- PESTAÑA: DIRECTORIO DE TRABAJADORES CON FILTROS --- */}
          {pestañaActiva === 'Explorar' && (
            <View>
              <BuscadorConSugerencias
                valor={busquedaExplorar}
                onCambio={setBusquedaExplorar}
                placeholder="Busca por nombre, oficio o ciudad..."
                vocabulario={[...categoriasFiltro.slice(1), ...directorio.flatMap(t => [`${t.nombre} ${t.apellidos}`, t.oficio_principal, t.ubicacion_texto]), ...ESTADOS_MEXICO]}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15}}>
                {categoriasFiltro.map((cat, i) => (
                  <TouchableOpacity key={i} style={[styles.filterChip, categoriaExplorar === cat && styles.filterChipActive]} onPress={() => setCategoriaExplorar(cat)}>
                    <Text style={[styles.filterChipText, categoriaExplorar === cat && styles.filterChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <FiltrosBusqueda
                estado={filtroEstado} onEstado={setFiltroEstado}
                orden={ordenExplorar} onOrden={setOrdenExplorar} opcionesOrden={ORDENES_TRABAJADORES}
                precio={precioMaximo} onPrecio={setPrecioMaximo} etiquetaPrecio="Precio máximo"
                miEstado={userData?.ubicacion_estado}
                dias={diasFiltro} onDias={setDiasFiltro}
              />
              <Text style={{fontSize: 14, color: '#6B7280', marginBottom: 10}}>{directorioFiltrado.length} trabajador{directorioFiltrado.length === 1 ? '' : 'es'}</Text>

              {directorioFiltrado.length > 0 ? (
                directorioFiltrado.map((trabajador, index) => (
                  <TouchableOpacity key={index} style={styles.workerFeedCard} activeOpacity={0.9} onPress={() => verPerfilTrabajador(trabajador)}>
                    
                    <View style={[styles.workerFeedStatusBadge, {backgroundColor: trabajador.disponibilidad === 'Ocupado' ? '#F59E0B' : '#00D06C'}]}>
                      <Text style={styles.workerFeedStatusText}>{trabajador.disponibilidad === 'Ocupado' ? 'TRABAJANDO' : 'DISPONIBLE'}</Text>
                    </View>

                    <View style={styles.workerFeedHeader}>
                      <Image source={{ uri: trabajador.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.workerFeedAvatar} />
                      <View style={{flex: 1, paddingRight: 80}}>
                        <Text style={styles.workerFeedName} numberOfLines={2}>{trabajador.nombre} {trabajador.apellidos}</Text>
                        <Text style={styles.workerFeedOficio}>{trabajador.oficio_principal || 'Trabajador General'}</Text>
                        <Text style={styles.workerFeedPrecio}>{textoPrecio(trabajador.tarifa_monto, trabajador.tarifa_periodo)}</Text>
                      </View>
                    </View>

                    <View style={styles.workerFeedDetailsGrid}>
                      <View style={styles.workerFeedDetailRow}><Ionicons name="star" size={16} color="#F59E0B" /><Text style={[styles.workerFeedDetailText, {color: '#B45309', fontWeight: 'bold'}]}>{trabajador.calificacion || '0.0'} ({trabajador.numero_resenas || 0})</Text></View>
                      <View style={styles.workerFeedDetailRow}><Ionicons name="images-outline" size={16} color="#0D2340" /><Text style={styles.workerFeedDetailText}>{obrasDe(trabajador)} Obras</Text></View>
                    </View>
                    <View style={[styles.workerFeedDetailRow, {marginBottom: 12}]}>
                      <Ionicons name="location-outline" size={16} color="#6B7280" />
                      <Text style={[styles.workerFeedDetailText, {flex: 1}]} numberOfLines={1}>
                        {[trabajador.ubicacion_texto, trabajador.ubicacion_estado].filter(Boolean).join(', ') || 'Sin ubicación'}{trabajador.distancia !== null ? ` • ${textoDistancia(trabajador.distancia)}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.workerFeedDetailRow, {marginBottom: 12}]}>
                      <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                      <Text style={[styles.workerFeedDetailText, {flex: 1}]}>Disponible: {textoDias(trabajador.dias_disponibles)}</Text>
                    </View>

                    {fotosDe(trabajador).length > 0 && (
                      <View style={styles.workerFeedPreviewRow}>
                        {fotosDe(trabajador).slice(0, 3).map((foto, idx) => (
                          <Image key={idx} source={{uri: foto}} style={styles.workerFeedMiniImg} />
                        ))}
                        {fotosDe(trabajador).length > 3 && (
                          <View style={styles.workerFeedMiniImgOverlay}><Text style={styles.workerFeedMiniImgText}>+{fotosDe(trabajador).length - 3}</Text></View>
                        )}
                      </View>
                    )}

                    <TouchableOpacity style={styles.workerFeedBtn} onPress={() => iniciarContratacionDirecta(trabajador)}>
                      <Ionicons name="briefcase" size={18} color="#FFF" style={{marginRight: 5}}/>
                      <Text style={styles.workerFeedBtnText}>Proponer obra y chatear</Text>
                    </TouchableOpacity>

                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Sin resultados</Text>
                  <Text style={{textAlign: 'center', color: '#9CA3AF'}}>No hay trabajadores con estos filtros. Prueba con otro oficio, estado o precio.</Text>
                </View>
              )}
            </View>
          )}
          
          {pestañaActiva === 'Vacantes' && (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Catálogo de Vacantes</Text>
                <TouchableOpacity style={styles.addBtn} onPress={abrirModalNuevaVacante}><Ionicons name="add" size={16} color="#FFF" /><Text style={styles.addBtnText}>Publicar Vacante</Text></TouchableOpacity>
              </View>

              {misVacantes.length > 0 ? (
                <View style={styles.catalogGrid}>
                  {misVacantes.map((vacante, index) => {
                    const progressVal = ((vacante.cupo_actual || 0) / (vacante.cupo_total || 1)) * 100;
                    return (
                      <TouchableOpacity key={index} style={styles.catalogCard} activeOpacity={0.9} onPress={() => setVacanteExpandida(vacante)}>
                        <View style={styles.catalogImageWrapper}>
                          <Image source={{ uri: vacante.foto_trabajo || 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=400&auto=format&fit=crop' }} style={styles.catalogImage} />
                          <View style={[styles.catalogStatusBadge, vacante.estado === 'Activa' ? {backgroundColor: '#00D06C'} : {backgroundColor: '#6B7280'}]}>
                            <Text style={styles.catalogStatusText}>{vacante.estado.toUpperCase()}</Text>
                          </View>
                        </View>
                        <View style={styles.catalogInfo}>
                          <Text style={styles.catalogTitle} numberOfLines={2}>{vacante.titulo}</Text>
                          <Text style={styles.catalogSubtitle} numberOfLines={1}>{vacante.ubicacion}</Text>
                          <View style={styles.progressBarBg}><View style={[styles.progressBarFill, {width: `${progressVal > 100 ? 100 : progressVal}%`}]} /></View>
                          <Text style={styles.catalogCupoText}>{vacante.cupo_actual || 0} de {vacante.cupo_total || 1} contratados</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="images-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Tu catálogo está vacío</Text>
                  <Text style={styles.emptyStateText}>Publica tu primera vacante para verla en tu nuevo catálogo visual.</Text>
                </View>
              )}
            </View>
          )}

          {/* --- PESTAÑA NUEVA: OBRAS ACTIVAS (SUPERVISIÓN) --- */}
          {pestañaActiva === 'Obras' && (
            <View>
              <Text style={styles.sectionTitle}>Mis Obras Asignadas</Text>
              <Text style={{fontSize: 14, color: '#6B7280', marginBottom: 15}}>A quién le asignaste cada obra, su bitácora diaria, y el cierre o la cancelación.</Text>

              {seccionContratos('Obras activas', [ESTADOS.ACTIVA])}
              {seccionContratos('Esperando que el trabajador confirme el fin', [ESTADOS.POR_CONFIRMAR_FIN], 'Marcaste la obra como terminada. Falta que el trabajador lo confirme.')}
              {seccionContratos('Suspendidas / en revisión', [ESTADOS.SUSPENDIDA], 'El administrador la está revisando.')}
              {seccionContratos('Historial', [ESTADOS.FINALIZADA, ESTADOS.CANCELADA])}

              {!candidatos.some(c => [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.SUSPENDIDA, ESTADOS.FINALIZADA, ESTADOS.CANCELADA].includes(c.estado)) && (
                <View style={styles.emptyState}>
                  <Ionicons name="construct-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>No tienes obras asignadas</Text>
                  <Text style={styles.emptyStateText}>Propón una obra a un trabajador desde Explorar, o acepta una solicitud en la pestaña Solicitud.</Text>
                </View>
              )}
            </View>
          )}

          {pestañaActiva === 'Candidatos' && (
            <View>
              <Text style={styles.sectionTitle}>Nuevas Solicitudes</Text>
              {solicitudesPendientes.length > 0 && (
                <Text style={{fontSize: 14, color: '#6B7280', marginBottom: 12}}>Ve al chat con el trabajador y platiquen los detalles. Cuando los dos estén de acuerdo, acepta el trato ahí mismo en el chat.</Text>
              )}
              {solicitudesPendientes.length > 0 ? (
                solicitudesPendientes.map((cand, index) => (
                  <TouchableOpacity key={index} style={styles.candidatoCard} activeOpacity={0.8} onPress={() => setCandidatoSeleccionado(cand)}>
                    <View style={styles.candidatoHeader}>
                      <Image source={{ uri: cand.trabajador.foto_rostro_url || undefined }} style={styles.candidatoAvatar} />
                      <View style={{flex: 1}}>
                        <Text style={styles.candidatoName}>{cand.trabajador.nombre} {cand.trabajador.apellidos}</Text>
                        <Text style={styles.candidatoOficio}>{cand.trabajador.oficio_principal} • {cand.trabajador.calificacion || 'Nuevo'} <Ionicons name="star" size={12} color="#F59E0B"/> • {textoPrecio(cand.trabajador.tarifa_monto, cand.trabajador.tarifa_periodo)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </View>
                    <View style={styles.candidatoFooter}><Text style={styles.candidatoFooterText}><Text style={{fontWeight: 'bold'}}>Postuló para:</Text> {cand.titulo_vacante}</Text></View>
                    {!oficioCoincide(cand.trabajador.oficio_principal, oficioDeVacante(cand)) && (
                      <View style={styles.avisoOficio}>
                        <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
                        <Text style={styles.avisoOficioTexto}>{avisoOficio(cand.trabajador.oficio_principal, oficioDeVacante(cand))}</Text>
                      </View>
                    )}
                    <View style={{flexDirection: 'row', marginTop: 10}}>
                      <TouchableOpacity style={[styles.candBtnAccion, {borderColor: '#00D06C', backgroundColor: '#00D06C', marginHorizontal: 0, padding: 10}]} onPress={() => irAlChatDeSolicitud(cand)}>
                        <Ionicons name="chatbubbles" size={18} color="#FFF" /><Text style={[styles.candBtnText, {color: '#FFF'}]}>Ir al chat para platicar y aceptar</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Bandeja Limpia</Text>
                  <Text style={styles.emptyStateText}>Aún no hay trabajadores nuevos o ya los revisaste todos.</Text>
                </View>
              )}

              {/* PROPUESTAS QUE YO ENVIÉ DESDE EXPLORAR Y QUE EL TRABAJADOR AÚN NO RESPONDE */}
              <View style={{marginTop: 20}}>
                {seccionContratos('Propuestas que enviaste', [ESTADOS.PROPUESTA], 'Esperando a que el trabajador acepte. Platiquen por chat.')}
              </View>
            </View>
          )}

          {/* --- PESTAÑA PERFIL: MIS RESEÑAS Y TODOS LOS AJUSTES DE LA CUENTA --- */}
          {pestañaActiva === 'Perfil' && (
            <View>
              {/* DOS SECCIONES, COMO EN EL PERFIL DEL TRABAJADOR, PARA QUE NO SE AMONTONE */}
              <View style={styles.tabsContainer}>
                {(['Reseñas', 'Obras', 'Ajustes'] as const).map(s => (
                  <TouchableOpacity key={s} style={[styles.tabButton, seccionPerfil === s && styles.tabButtonActive]} onPress={() => setSeccionPerfil(s)}>
                    <Text style={[styles.tabText, seccionPerfil === s && styles.tabTextActive]}>{s === 'Reseñas' ? `Reseñas (${userData?.resenas?.length || 0})` : s === 'Obras' ? `Obras (${userData?.obras_realizadas?.length || 0})` : 'Ajustes'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{height: 16}} />

              {seccionPerfil === 'Reseñas' && (userData?.resenas?.length > 0 ? (
                [...userData.resenas].reverse().map((resena: any, idx: number) => (
                  <View key={idx} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Image source={{uri: resena.evaluador_foto || undefined}} style={styles.reviewAvatar} />
                      <View>
                        <Text style={styles.reviewName}>{resena.evaluador_nombre}</Text>
                        <View style={styles.reviewStarsRow}>
                          {[...Array(5)].map((_, i) => (<Ionicons key={i} name={i < resena.estrellas ? "star" : "star-outline"} size={12} color="#F59E0B" />))}
                          <Text style={styles.reviewDate}> • {resena.fecha}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.reviewComment}>"{resena.comentario}"</Text>
                  </View>
                ))
              ) : (
                <Text style={{color: '#9CA3AF', textAlign: 'center', marginBottom: 20}}>Todavía no tienes reseñas. Aparecen cuando un trabajador te califica al terminar una obra.</Text>
              ))}

              {/* OBRAS TERMINADAS EN PALANTEMX (LAS AGREGA EL SERVIDOR AL TERMINAR CADA OBRA, A MANO O AUTOMÁTICAMENTE) */}
              {seccionPerfil === 'Obras' && (userData?.obras_realizadas?.length > 0 ? (
                [...userData.obras_realizadas].reverse().map((obra: any) => (
                  <View key={obra.id_contrato} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      {obra.foto_trabajo || obra.fotos?.[0] ? <Image source={{ uri: obra.foto_trabajo || obra.fotos[0] }} style={styles.reviewAvatar} /> : null}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewName}>{obra.titulo}</Text>
                        <Text style={styles.reviewDate}>{obra.trabajador}{obra.oficio ? ` • ${obra.oficio}` : ''}</Text>
                      </View>
                    </View>
                    <Text style={styles.reviewComment}>
                      {[obra.fecha_inicio && obra.fecha_fin ? `Del ${obra.fecha_inicio} al ${obra.fecha_fin}` : obra.fecha_fin ? `Terminó el ${obra.fecha_fin}` : '', `${obra.dias_trabajados || 0} día(s) trabajado(s)`, obra.ubicacion].filter(Boolean).join(' • ')}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={{color: '#9CA3AF', textAlign: 'center', marginBottom: 20}}>Todavía no tienes obras terminadas. Aparecen aquí cuando una obra termina.</Text>
              ))}

              {seccionPerfil === 'Ajustes' && (
              <View>
              <CampanaNotificaciones variante="fila" rol="Contratista" onNuevos={cargarPerfil} />
              <TouchableOpacity style={styles.settingsOption} onPress={() => setModalEditar(true)}><View style={styles.settingsRow}><Ionicons name="person-circle-outline" size={24} color="#0D2340" /><Text style={styles.settingsText}>Editar datos de la empresa</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
              <TouchableOpacity style={styles.settingsOption} onPress={abrirModalEvaluar}><View style={styles.settingsRow}><Ionicons name="star-outline" size={24} color="#F59E0B" /><Text style={styles.settingsText}>Evaluar a un Trabajador contratado</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
              <TouchableOpacity style={styles.settingsOption} onPress={abrirModalQueja}><View style={styles.settingsRow}><Ionicons name="shield-half-outline" size={24} color="#D32F2F" /><Text style={[styles.settingsText, {color: '#D32F2F'}]}>Levantar Reporte a Trabajador</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
              <TouchableOpacity style={[styles.settingsOption, { borderBottomWidth: 0, marginTop: 10 }]} onPress={eliminarCuenta}><View style={styles.settingsRow}><Ionicons name="trash-outline" size={24} color="#D32F2F" /><Text style={[styles.settingsText, { color: '#D32F2F', fontWeight: 'bold' }]}>Eliminar cuenta de contratista</Text></View></TouchableOpacity>
              </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* --- MENÚ INFERIOR: CADA BOTÓN ES UNA SOLA COSA (ANUNCIOS SOLO VACANTES; PERFIL TODO LO DE LA CUENTA) --- */}
      <View style={styles.bottomNavigation}>
        {([
          ['Explorar', 'search', 'Explorar'], ['Vacantes', 'megaphone', 'Anuncios'], ['Obras', 'construct', 'Obras'], ['Candidatos', 'people', 'Solicitud'],
        ] as const).map(([pestaña, icono, texto]) => (
          <TouchableOpacity key={pestaña} style={styles.navItem} onPress={() => setPestañaActiva(pestaña)}>
            <View>
              <Ionicons name={pestañaActiva === pestaña ? icono : `${icono}-outline`} size={24} color={pestañaActiva === pestaña ? "#0D2340" : "#6B7280"} />
              {pestaña === 'Candidatos' && solicitudesPendientes.length > 0 && <View style={styles.badgeNotif}><Text style={styles.badgeNotifText}>{solicitudesPendientes.length}</Text></View>}
            </View>
            <Text style={[styles.navText, pestañaActiva === pestaña && {color: '#0D2340', fontWeight: 'bold'}]}>{texto}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/mensajes' as any)}>
          <View>
            <Ionicons name="chatbubbles-outline" size={24} color="#6B7280" />
            {mensajesSinLeer > 0 && <View style={styles.badgeNotif}><Text style={styles.badgeNotifText}>{mensajesSinLeer > 9 ? '+9' : mensajesSinLeer}</Text></View>}
          </View>
          <Text style={styles.navText}>Mensajes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Perfil')}>
          <Ionicons name={pestañaActiva === 'Perfil' ? 'person-circle' : 'person-circle-outline'} size={24} color={pestañaActiva === 'Perfil' ? "#0D2340" : "#6B7280"} />
          <Text style={[styles.navText, pestañaActiva === 'Perfil' && {color: '#0D2340', fontWeight: 'bold'}]}>Perfil</Text>
        </TouchableOpacity>
      </View>

      {/* CAMBIAR LOS DÍAS DE TRABAJO DE UNA OBRA (SE LE AVISA AL TRABAJADOR) */}
      <Modal visible={!!contratoFecha} animationType="fade" transparent onRequestClose={() => setContratoFecha(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Días de trabajo</Text>
            <Text style={{fontSize: 15, color: '#6B7280', marginBottom: 12}}>"{contratoFecha?.titulo_vacante}". {contratoFecha?.trabajador?.nombre || 'El trabajador'} solo podrá llenar la bitácora en los días que elijas, y le avisaremos del cambio.</Text>
            <SelectorDiasObra valor={nuevosDias} onCambio={setNuevosDias} diasAtras={contratoFecha?.estado === ESTADOS.ACTIVA ? 30 : 0} />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setContratoFecha(null)}><Text style={styles.modalBtnTextC}>Volver</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} disabled={procesando || !nuevosDias.inicio} onPress={async () => {
                if (nuevosDias.fin !== nuevosDias.inicio && nuevosDias.dias.length === 0) { Alert.alert("Aviso", "Elige qué días de la semana se trabaja."); return; }
                setProcesando(true);
                try {
                  await accionContrato('cambiar_inicio', { id_contrato: contratoFecha.id, inicio_obra: nuevosDias.inicio, fin_obra: nuevosDias.fin, dias_obra: nuevosDias.dias });
                  setContratoFecha(null);
                  Alert.alert("Listo", `Días de trabajo: ${textoDiasObra({ inicio_obra: nuevosDias.inicio, fin_obra: nuevosDias.fin, dias_obra: nuevosDias.dias })}. Le avisamos al trabajador.`);
                  await cargarPerfil();
                } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
                setProcesando(false);
              }}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Guardar</Text>}</TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* --- MODAL PARA ASIGNAR A VACANTE DIRECTO DESDE EXPLORAR --- */}
      <Modal visible={modalContratarDirecto} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <Text style={styles.modalTitle}>Proponer una Obra</Text>
            <Text style={{fontSize: 16, color: '#6B7280', marginBottom: 15}}>Elige la vacante que le quieres proponer a {trabajadorParaContratar?.nombre}. Le llegará como propuesta y se abrirá el chat para que platiquen; el trato se cierra cuando él acepte.</Text>
            
            <Text style={styles.modalLabel}>Mis Vacantes Activas</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={vacanteSeleccionadaParaContratar} onValueChange={setVacanteSeleccionadaParaContratar}>
                {misVacantes.filter(v => v.estado === 'Activa').map((v, i) => (
                   <Picker.Item key={i} label={v.titulo} value={v.id} />
                ))}
              </Picker>
            </View>
            {(() => {
              const oficioObra = misVacantes.find(v => v.id === vacanteSeleccionadaParaContratar)?.categoria;
              return oficioCoincide(trabajadorParaContratar?.oficio_principal, oficioObra) ? null : (
                <View style={[styles.avisoOficio, { marginBottom: 10 }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
                  <Text style={styles.avisoOficioTexto}>{avisoOficio(trabajadorParaContratar?.oficio_principal, oficioObra)}</Text>
                </View>
              );
            })()}
            
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalContratarDirecto(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={confirmarContratacionDirecta} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Enviar propuesta</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!vacanteExpandida} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          <View style={[styles.modalContainer, {maxHeight: '90%', padding: 0, overflow: 'hidden'}]}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 17}}>Así la ven los trabajadores</Text><TouchableOpacity onPress={() => setVacanteExpandida(null)}><Ionicons name="close" size={24} color="#FFF"/></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding: 20}}>
              <View style={[styles.feedJobCard, {elevation: 0, borderWidth: 1, borderColor: '#E5E7EB'}]}>
                <View style={styles.feedJobHeader}><Image source={{ uri: vacanteExpandida?.foto_contratista || 'https://via.placeholder.com/150' }} style={styles.feedContractorAvatar} /><View style={{flex: 1}}><Text style={styles.feedJobTitle}>{vacanteExpandida?.titulo}</Text><Text style={styles.feedJobCompany}>{vacanteExpandida?.contratista} • {vacanteExpandida?.empresa}</Text></View></View>
                {vacanteExpandida?.foto_trabajo && (<View style={styles.feedJobImageContainer}><Image source={{ uri: vacanteExpandida.foto_trabajo }} style={styles.feedJobImage} /></View>)}
                <View style={styles.feedJobDetailsGrid}>
                  <View style={styles.feedJobDetailRow}><Ionicons name="location-outline" size={16} color="#6B7280" /><Text style={styles.feedJobDetailText}>{vacanteExpandida?.ubicacion}</Text></View>
                  <View style={styles.feedJobDetailRow}><Ionicons name="cash-outline" size={16} color="#00D06C" /><Text style={[styles.feedJobDetailText, {color: '#00D06C', fontWeight: 'bold'}]}>{vacanteExpandida?.pago}</Text></View>
                  <View style={styles.feedJobDetailRow}><Ionicons name="calendar-outline" size={16} color="#F59E0B" /><Text style={[styles.feedJobDetailText, {color: '#B45309'}]}>{vacanteExpandida?.horario}</Text></View>
                </View>
                <Text style={styles.feedJobDesc}>{vacanteExpandida?.descripcion}</Text>
              </View>
              <View style={styles.expandedProgressBox}>
                <Text style={{fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5}}>ESTADO DEL CUPO</Text>
                <View style={[styles.progressBarBg, {height: 8}]}><View style={[styles.progressBarFill, {width: `${((vacanteExpandida?.cupo_actual || 0) / (vacanteExpandida?.cupo_total || 1)) * 100}%`}]} /></View>
                <Text style={{fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginTop: 5}}>{vacanteExpandida?.cupo_actual || 0} de {vacanteExpandida?.cupo_total || 1} contratados</Text>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
                {vacanteExpandida?.estado === 'Activa' && (<TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#FEE2E2', borderColor: '#F87171'}]} onPress={() => cerrarVacante(vacanteExpandida.id)}><Ionicons name="power" size={20} color="#DC2626" /><Text style={[styles.candBtnText, {color: '#DC2626'}]}>Cerrar Oferta</Text></TouchableOpacity>)}
                {/* UNA VACANTE CERRADA CON LUGARES LIBRES (P. EJ. PORQUE SE CANCELÓ UNA OBRA) SE PUEDE VOLVER A ABRIR */}
                {vacanteExpandida?.estado === 'Cerrada' && (vacanteExpandida.cupo_actual || 0) < (vacanteExpandida.cupo_total || 1) && (<TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#DBEAFE', borderColor: '#60A5FA'}]} onPress={() => reabrirVacante(vacanteExpandida)}><Ionicons name="refresh" size={20} color="#1D4ED8" /><Text style={[styles.candBtnText, {color: '#1D4ED8'}]}>Volver a abrir</Text></TouchableOpacity>)}
                <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#0D2340', borderColor: '#0D2340'}]} onPress={() => abrirModalEditarVacante(vacanteExpandida)}><Ionicons name="pencil" size={20} color="#FFF" /><Text style={[styles.candBtnText, {color: '#FFF'}]}>Editar Datos</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#FEE2E2', borderColor: '#F87171', marginTop: 15}]} onPress={() => eliminarVacante(vacanteExpandida.id)} disabled={procesando}><Ionicons name="trash" size={20} color="#DC2626" /><Text style={[styles.candBtnText, {color: '#DC2626'}]}>Eliminar Definitivamente</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalEditar} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Datos del Contratista</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* NOMBRE Y APELLIDOS QUEDARON VERIFICADOS CONTRA LA INE: LAS REGLAS DE FIRESTORE NO PERMITEN CAMBIARLOS */}
              <Text style={styles.modalLabel}>Nombre del Representante (verificado con INE)</Text><TextInput style={[styles.modalInput, {backgroundColor: '#E5E7EB', color: '#6B7280'}]} value={editNombre} editable={false}/>
              <Text style={styles.modalLabel}>Apellidos (verificados con INE)</Text><TextInput style={[styles.modalInput, {backgroundColor: '#E5E7EB', color: '#6B7280'}]} value={editApellidos} editable={false}/>
              <Text style={styles.modalLabel}>Nombre de la Empresa</Text><TextInput style={styles.modalInput} placeholder="Ej. Constructora Palante" value={editEmpresa} onChangeText={setEditEmpresa} />
              <SelectorUbicacion estado={editEstado} municipio={editUbicacion} onEstado={setEditEstado} onMunicipio={setEditUbicacion} />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalEditar(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#0D2340'}]} onPress={guardarEdicionPerfil} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Guardar</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVacante} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><Ionicons name="megaphone" size={24} color="#0D2340" style={{marginRight: 10}}/><Text style={[styles.modalTitle, {marginBottom: 0}]}>{vacanteEditandoId ? 'Editar Vacante' : 'Publicar Vacante'}</Text></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>Título del Anuncio</Text><TextInput style={styles.modalInput} placeholder="Ej. Se busca oficial plomero..." value={vacanteTitulo} onChangeText={setVacanteTitulo} />
              <Text style={styles.modalLabel}>¿Qué oficio necesitas?</Text>
              <SelectorOficio valor={vacanteCategoria} onCambio={setVacanteCategoria} />
              <Text style={styles.modalLabel}>¿Cuántos trabajadores necesitas?</Text><TextInput style={styles.modalInput} placeholder="Ej. 1" value={vacanteCupo} onChangeText={setVacanteCupo} keyboardType="numeric" />
              <SelectorUbicacion estado={vacanteEstado} municipio={vacanteUbicacion} onEstado={setVacanteEstado} onMunicipio={setVacanteUbicacion} />

              {/* LUGAR EXACTO DE LA OBRA: CON ÉL SE COMPRUEBA QUE EL TRABAJADOR SÍ ESTÁ AHÍ CUANDO LLENA SU BITÁCORA */}
              <Text style={styles.modalLabel}>Lugar exacto de la obra (muy recomendado)</Text>
              {vacanteLugar ? (
                <View style={styles.lugarMarcado}>
                  <Ionicons name="checkmark-circle" size={20} color="#00A355" />
                  <Text style={styles.lugarMarcadoTexto}>{vacanteLugarTexto || 'Lugar marcado en el mapa'}</Text>
                </View>
              ) : null}
              <View style={{flexDirection: 'row', marginBottom: 6}}>
                <TouchableOpacity style={[styles.botonLugar, {marginRight: 5}]} onPress={() => setMapaVisible(true)}>
                  <Ionicons name="map" size={18} color="#0D2340" /><Text style={styles.botonLugarTexto}>{vacanteLugar ? 'Cambiar en el mapa' : 'Elegir en el mapa'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.botonLugar, {marginLeft: 5}]} onPress={marcarLugarDeObra} disabled={buscandoLugar}>
                  {buscandoLugar ? <ActivityIndicator color="#0D2340" /> : <><Ionicons name="locate" size={18} color="#0D2340" /><Text style={styles.botonLugarTexto}>Estoy en la obra</Text></>}
                </TouchableOpacity>
              </View>
              <Text style={{fontSize: 13, color: '#6B7280', marginBottom: 10}}>Si no estás en la obra, elígela en el mapa. Con este punto comprobamos que el trabajador sí está ahí cuando llena su bitácora.</Text>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <View style={{flex: 1, marginRight: 5}}><Text style={styles.modalLabel}>Pago ($, solo número)</Text><TextInput style={styles.modalInput} placeholder="Vacío = a convenir" keyboardType="numeric" value={vacantePago} onChangeText={t => setVacantePago(t.replace(/[^0-9]/g, ''))} /></View>
                <View style={{flex: 1, marginLeft: 5}}>
                  <Text style={styles.modalLabel}>Cada cuánto</Text>
                  <View style={styles.pickerBox}>
                    <Picker selectedValue={vacantePeriodo} onValueChange={setVacantePeriodo}>
                      {PERIODOS_PAGO.map(p => <Picker.Item key={p} label={p} value={p} />)}
                    </Picker>
                  </View>
                </View>
              </View>
              <SelectorDiasObra valor={vacanteDias} onCambio={setVacanteDias} />
              <Text style={styles.modalLabel}>Horario / Días de Trabajo</Text><TextInput style={styles.modalInput} placeholder="Ej. Lunes a Sábado de 8 a 5" value={vacanteHorario} onChangeText={setVacanteHorario} />
              <Text style={styles.modalLabel}>Descripción del Trabajo (Sé específico)</Text><TextInput style={[styles.modalInput, {height: 80, textAlignVertical: 'top'}]} placeholder="Se requiere levantar muros..." multiline value={vacanteDesc} onChangeText={setVacanteDesc} />
              {/* CONDICIONES: QUEDAN COMO EVIDENCIA EN EL CONTRATO DE LO QUE PROMETISTE (MATERIAL, HERRAMIENTA...) */}
              <Text style={[styles.modalLabel, {marginTop: 10, color: '#0D2340', fontSize: 16}]}>Condiciones de la obra</Text>
              <Text style={{fontSize: 13, color: '#6B7280', marginBottom: 6}}>El trabajador las verá antes de aceptar y quedan guardadas en el contrato como lo que prometiste.</Text>
              <FormCondiciones valores={vacanteCondiciones} onCambio={setVacanteCondiciones} />
              <Text style={styles.modalLabel}>Foto de la Obra (Opcional pero Recomendado)</Text>
              <TouchableOpacity style={styles.uploadArea} onPress={() => seleccionarFoto('vacante')}>
                {vacanteFoto ? <Image source={{uri: vacanteFoto}} style={styles.uploadedImagePreview} /> : <><Ionicons name="camera-outline" size={30} color="#9CA3AF"/><Text style={styles.uploadText}>Subir Foto para que el trabajador vea qué hará</Text></>}
              </TouchableOpacity>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVacante(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#00D06C'}]} onPress={publicarOEditarVacante} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>{vacanteEditandoId ? 'Guardar Cambios' : 'Publicar'}</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalQueja} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><Ionicons name="shield-half" size={24} color="#D32F2F" style={{marginRight: 10}}/><Text style={[styles.modalTitle, {marginBottom: 0}]}>Reporte Oficial</Text></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalLabel}>Fecha de Expedición</Text><TextInput style={[styles.modalInput, {backgroundColor: '#E5E7EB', color: '#6B7280'}]} value={new Date().toLocaleDateString('es-MX')} editable={false} />
              <Text style={styles.modalLabel}>¿A quién reportas? (Buscador Inteligente)</Text>
              {!usuarioSeleccionadoParaQueja ? (
                <View>
                  <View style={[styles.searchContainerInteligente]}><Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} /><TextInput style={[styles.searchInput, {paddingVertical: 10}]} placeholder="Busca por nombre o apellido..." value={busquedaUsuario} onChangeText={setBusquedaUsuario} /></View>
                  {busquedaUsuario.length > 1 && (
                    <View style={styles.searchResultsBox}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {listaUsuariosSistema.filter(u => `${u.nombre} ${u.apellidos}`.toLowerCase().includes(busquedaUsuario.toLowerCase())).map((u, i) => (
                            <TouchableOpacity key={i} style={styles.searchResultItem} onPress={() => setUsuarioSeleccionadoParaQueja(u)}>
                              <Image source={{uri: u.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.searchResultAvatar}/>
                              <View><Text style={styles.searchResultName}>{u.nombre} {u.apellidos}</Text><Text style={styles.searchResultRole}>{u.rol} • {u.ubicacion_texto || 'México'}</Text></View>
                            </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.selectedUserBox}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}><Image source={{uri: usuarioSeleccionadoParaQueja.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.selectedUserAvatar}/><View><Text style={styles.selectedUserName}>{usuarioSeleccionadoParaQueja.nombre} {usuarioSeleccionadoParaQueja.apellidos}</Text><Text style={styles.selectedUserRole}>Seleccionado</Text></View></View>
                  <TouchableOpacity onPress={() => setUsuarioSeleccionadoParaQueja(null)}><Ionicons name="close-circle" size={28} color="#DC2626" /></TouchableOpacity>
                </View>
              )}
              <Text style={styles.modalLabel}>Motivo del reporte</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={quejaMotivo} onValueChange={(itemValue) => setQuejaMotivo(itemValue)}>
                  <Picker.Item label="Abandono de obra" value="Abandono de Obra" /><Picker.Item label="Robo o daño de material" value="Robo o Daño" /><Picker.Item label="Mal comportamiento" value="Mal Comportamiento" /><Picker.Item label="Impuntualidad" value="Impuntualidad" />
                </Picker>
              </View>
              <Text style={styles.modalLabel}>Hechos detallados</Text><TextInput style={[styles.modalInput, {height: 100, textAlignVertical: 'top'}]} placeholder="El trabajador se fue..." multiline value={quejaDesc} onChangeText={setQuejaDesc} />
              <TouchableOpacity style={styles.uploadArea} onPress={() => seleccionarFoto('queja')}>
                {quejaFoto ? <Image source={{uri: quejaFoto}} style={styles.uploadedImagePreview} /> : <><Ionicons name="document-attach-outline" size={30} color="#9CA3AF"/><Text style={styles.uploadText}>Evidencia Visual</Text></>}
              </TouchableOpacity>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalQueja(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#D32F2F'}]} onPress={enviarQueja} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Reportar</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!candidatoSeleccionado} animationType="fade" transparent>
        <View style={styles.modalBgDark}>
          <View style={[styles.modalContainer, {padding: 0, overflow: 'hidden'}]}>
            <View style={styles.candHeaderCover}><TouchableOpacity style={styles.closeExpandedBtn} onPress={() => setCandidatoSeleccionado(null)}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity></View>
            <View style={{alignItems: 'center', marginTop: -40}}>
              <Image source={{uri: candidatoSeleccionado?.trabajador?.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.candAvatarBig} />
              <Text style={styles.candNameBig}>{candidatoSeleccionado?.trabajador?.nombre} {candidatoSeleccionado?.trabajador?.apellidos}</Text>
              <Text style={styles.candOficioBig}>{candidatoSeleccionado?.trabajador?.oficio_principal}</Text>
              <View style={styles.candStatsRow}>
                <View style={styles.candStatBox}><Text style={styles.candStatValue}>{candidatoSeleccionado?.trabajador?.calificacion || '0.0'} <Ionicons name="star" size={14} color="#F59E0B"/></Text><Text style={styles.candStatLabel}>Estrellas</Text></View>
                <View style={styles.candStatBox}><Text style={styles.candStatValue}>{candidatoSeleccionado?.trabajador ? obrasDe(candidatoSeleccionado.trabajador) : 0}</Text><Text style={styles.candStatLabel}>Obras</Text></View>
              </View>
            </View>
            <View style={{padding: 20}}>
              <Text style={styles.candInfoLabel}>Postulado para la vacante:</Text><Text style={styles.candInfoValue}>{candidatoSeleccionado?.titulo_vacante}</Text>
              <TouchableOpacity style={styles.verPortafolioBtn} onPress={() => { const trabajadorCompleto = candidatoSeleccionado.trabajador; setCandidatoSeleccionado(null); verPerfilTrabajador(trabajadorCompleto, true); }}>
                <Ionicons name="images-outline" size={18} color="#0D2340" style={{marginRight: 8}}/><Text style={styles.verPortafolioText}>Ver Perfil Completo</Text>
              </TouchableOpacity>
              <Text style={{fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 14}}>El trato se acepta en el chat, después de platicar y ponerse de acuerdo.</Text>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 12}}>
                <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#FEE2E2', borderColor: '#F87171', flex: 1}]} onPress={() => responderSolicitud('rechazar')} disabled={procesando}><Ionicons name="close-circle-outline" size={20} color="#DC2626" /><Text style={[styles.candBtnText, {color: '#DC2626'}]}>Rechazar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#00D06C', borderColor: '#00D06C', flex: 2}]} onPress={() => { const cand = candidatoSeleccionado; setCandidatoSeleccionado(null); irAlChatDeSolicitud(cand); }}><Ionicons name="chatbubbles" size={20} color="#FFF" /><Text style={[styles.candBtnText, {color: '#FFF'}]}>Ir al chat y aceptar</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- MODAL PARA VER EL PERFIL COMPLETO (SIN BITÁCORA) --- */}
      <Modal visible={!!perfilTrabajadorExpandido} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          <SafeAreaView style={{flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, overflow: 'hidden'}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Ionicons name="person-circle" size={28} color="#00D06C" style={{marginRight: 10}}/><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 17}}>Perfil de {perfilTrabajadorExpandido?.nombre}</Text></View>
              <TouchableOpacity onPress={() => setPerfilTrabajadorExpandido(null)}><Ionicons name="close-circle" size={28} color="#FFF"/></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{padding: 16}}>
              {/* EL MISMO PERFIL QUE VE EL ADMIN: DATOS, DÍAS DISPONIBLES, OBRAS EN PALANTEMX CON FOTOS, PORTAFOLIO Y RESEÑAS */}
              {perfilTrabajadorExpandido && (
                <PerfilTrabajador
                  trabajador={perfilTrabajadorExpandido}
                  distancia={textoDistancia(distanciaKm(userData?.ubicacion, perfilTrabajadorExpandido.ubicacion))}
                />
              )}

              {!perfilTrabajadorExpandido?.yaContratado && (
                <TouchableOpacity style={{backgroundColor: '#00D06C', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 12, marginTop: 20}} onPress={() => iniciarContratacionDirecta(perfilTrabajadorExpandido)}>
                  <Ionicons name="briefcase" size={20} color="#FFF" style={{marginRight: 8}} /><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 17}}>Proponer obra y chatear</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* BITÁCORA (LA MISMA QUE LLENA EL TRABAJADOR; AQUÍ SOLO SE LEE) Y VENTANA PARA CANCELAR UNA OBRA */}
      <ModalBitacora contrato={contratoBitacora} rol="contratista" onClose={() => setContratoBitacora(null)} />
      {/* AL CANCELAR, EL CONTRATISTA DECIDE AHÍ MISMO SI VUELVE A PUBLICAR LA OBRA PARA BUSCAR A OTRO TRABAJADOR */}
      <ModalCancelarContrato contrato={contratoCancelar} onClose={() => setContratoCancelar(null)} onCancelado={(estado) => {
        const cancelado = contratoCancelar;
        setContratoCancelar(null);
        cargarPerfil();
        setContratoRepublicar({ ...cancelado, estado: estado || ESTADOS.SUSPENDIDA, cancelado_por: userData?.id });
      }} />
      <ModalReportarProblema contrato={contratoReportar} rol="contratista" onClose={() => setContratoReportar(null)} />
      <ModalReportesObra contrato={contratoReportes} onClose={() => { setContratoReportes(null); cargarPerfil(); }} />
      <ModalRepublicar contrato={contratoRepublicar} onClose={() => setContratoRepublicar(null)} onPublicada={() => { setContratoRepublicar(null); cargarPerfil(); }} />
      <ModalPagos contrato={candidatos.find(c => c.id === idContratoPagos) || null} rol="contratista" onClose={() => setIdContratoPagos(null)} onCambio={cargarPerfil} />
      <SelectorMapa
        visible={mapaVisible}
        inicial={vacanteLugar}
        onCerrar={() => setMapaVisible(false)}
        onElegir={(punto, nombre) => { setVacanteLugar(punto); setVacanteLugarTexto(nombre); setMapaVisible(false); }}
      />
      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />

      <Modal visible={modalEvaluar} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <Text style={styles.modalTitle}>Evaluar a un Trabajador</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <Text style={styles.modalLabel}>¿A quién deseas calificar?</Text>
              {!usuarioSeleccionadoParaEvaluar ? (
                <View>
                  <View style={[styles.searchContainerInteligente]}><Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} /><TextInput style={[styles.searchInput, {paddingVertical: 10}]} placeholder="Busca a un trabajador..." value={busquedaUsuarioEvaluar} onChangeText={setBusquedaUsuarioEvaluar} /></View>
                  {busquedaUsuarioEvaluar.length > 1 && (
                    <View style={styles.searchResultsBox}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {listaUsuariosEvaluar.filter(u => `${u.nombre} ${u.apellidos}`.toLowerCase().includes(busquedaUsuarioEvaluar.toLowerCase())).map((u, i) => (
                          <TouchableOpacity key={i} style={styles.searchResultItem} onPress={() => setUsuarioSeleccionadoParaEvaluar(u)}>
                            <Image source={{uri: u.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.searchResultAvatar}/>
                            <View><Text style={styles.searchResultName}>{u.nombre} {u.apellidos}</Text><Text style={styles.searchResultRole}>{u.rol || 'Trabajador'} • {u.ubicacion_texto?.split(',')[0] || 'México'}</Text></View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.selectedUserBox}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Image source={{uri: usuarioSeleccionadoParaEvaluar.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.selectedUserAvatar}/>
                    <View><Text style={styles.selectedUserName}>{usuarioSeleccionadoParaEvaluar.nombre} {usuarioSeleccionadoParaEvaluar.apellidos}</Text><Text style={styles.selectedUserRole}>Seleccionado</Text></View>
                  </View>
                  <TouchableOpacity onPress={() => setUsuarioSeleccionadoParaEvaluar(null)}><Ionicons name="close-circle" size={28} color="#DC2626" /></TouchableOpacity>
                </View>
              )}
              
              <Text style={styles.modalLabel}>Calificación (1 al 5)</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={evaluarEstrellas} onValueChange={(v) => setEvaluarEstrellas(v)}>
                  <Picker.Item label="5 - Excelente" value="5" /><Picker.Item label="4 - Bueno" value="4" /><Picker.Item label="3 - Regular" value="3" /><Picker.Item label="2 - Malo" value="2" /><Picker.Item label="1 - Pésimo" value="1" />
                </Picker>
              </View>

              <Text style={styles.modalLabel}>Comentario Público</Text>
              <TextInput style={[styles.modalInput, {height: 80, textAlignVertical: 'top'}]} placeholder="Llegó a tiempo y trabajó bien..." multiline value={evaluarComentario} onChangeText={setEvaluarComentario} />
              
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalEvaluar(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={enviarResena} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Enviar Reseña</Text>}</TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, color: '#0D2340', fontWeight: 'bold' },
  headerCover: { height: 130, backgroundColor: '#0D2340', borderBottomLeftRadius: 25, borderBottomRightRadius: 25 },
  lugarMarcado: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, padding: 10, marginBottom: 8 },
  lugarMarcadoTexto: { marginLeft: 8, color: '#166534', fontWeight: 'bold', flex: 1 },
  botonLugar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#0D2340', borderRadius: 10, paddingVertical: 11 },
  botonLugarTexto: { marginLeft: 6, color: '#0D2340', fontWeight: 'bold', fontSize: 15 },
  headerCorto: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, borderBottomLeftRadius: 25, borderBottomRightRadius: 25 },
  headerCortoTitulo: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  headerCortoSub: { color: '#9CA3AF', fontSize: 14, marginTop: 2 },
  profileSection: { alignItems: 'center', marginTop: -60, paddingHorizontal: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: '#F3F4F6', backgroundColor: '#E5E7EB' },
  editAvatarBadge: { position: 'absolute', bottom: 10, left: -5, backgroundColor: '#0D2340', borderRadius: 15, padding: 5, borderWidth: 2, borderColor: '#FFF' },
  verifiedBadge: { position: 'absolute', bottom: 5, right: -5, borderRadius: 15, padding: 4, borderWidth: 2, borderColor: '#FFF' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#0D2340', marginTop: 10, textAlign: 'center' },
  userRole: { fontSize: 13, color: '#00D06C', fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  empresaText: { fontSize: 17, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 8 },
  locationText: { fontSize: 14, color: '#0D2340', fontWeight: 'bold', marginLeft: 4 },
  
  dispDot: { width: 8, height: 8, borderRadius: 4 },

  statsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 15, marginTop: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, width: '100%', justifyContent: 'space-between' },
  statBox: { alignItems: 'center', flex: 1 },
  statNumber: { fontSize: 19, fontWeight: 'bold', color: '#0D2340' },
  statLabel: { fontSize: 13, color: '#9CA3AF', marginTop: 4, fontWeight: 'bold', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', height: '80%', alignSelf: 'center' },
  tabsContainer: { flexDirection: 'row', marginTop: 25, paddingHorizontal: 15 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabButtonActive: { borderColor: '#0D2340' },
  tabText: { fontSize: 15, fontWeight: 'bold', color: '#9CA3AF' },
  tabTextActive: { color: '#0D2340' },
  contentSection: { padding: 20, marginTop: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 19, fontWeight: 'bold', color: '#0D2340', marginBottom: 15 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  addBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, marginLeft: 4 },
  emptyState: { backgroundColor: '#FFF', borderRadius: 16, padding: 40, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#D1D5DB' },
  emptyStateTitle: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginTop: 15, marginBottom: 5 },
  emptyStateText: { fontSize: 15, color: '#6B7280', textAlign: 'center' },

  workerFeedCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, position: 'relative' },
  workerFeedStatusBadge: { position: 'absolute', top: 15, right: 15, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, zIndex: 2 },
  workerFeedStatusText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  workerFeedHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  workerFeedAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E5E7EB', marginRight: 15, borderWidth: 2, borderColor: '#F3F4F6' },
  workerFeedName: { fontSize: 19, fontWeight: 'bold', color: '#0D2340', marginBottom: 2 },
  workerFeedOficio: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  workerFeedPrecio: { fontSize: 15, color: '#00A355', fontWeight: 'bold', marginTop: 2 },
  workerFeedDetailsGrid: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'space-around' },
  workerFeedDetailRow: { flexDirection: 'row', alignItems: 'center' },
  workerFeedDetailText: { fontSize: 15, color: '#4B5563', marginLeft: 6 },
  workerFeedPreviewRow: { flexDirection: 'row', marginBottom: 15, overflow: 'hidden' },
  workerFeedMiniImg: { width: 70, height: 70, borderRadius: 8, marginRight: 10, backgroundColor: '#E5E7EB' },
  workerFeedMiniImgOverlay: { width: 70, height: 70, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', position: 'absolute', right: 0 },
  workerFeedMiniImgText: { color: '#FFF', fontWeight: 'bold', fontSize: 17 },
  workerFeedBtn: { backgroundColor: '#00D06C', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  workerFeedBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  filterChip: { backgroundColor: '#E5E7EB', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  filterChipActive: { backgroundColor: '#0D2340' },
  filterChipText: { color: '#4B5563', fontSize: 15, fontWeight: 'bold' },
  filterChipTextActive: { color: '#FFF' },

  catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  catalogCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  catalogImageWrapper: { position: 'relative', height: 120 },
  catalogImage: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  catalogStatusBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  catalogStatusText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  catalogInfo: { padding: 12 },
  catalogTitle: { fontSize: 15, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  catalogSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  progressBarBg: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00D06C' },
  catalogCupoText: { fontSize: 13, color: '#0D2340', fontWeight: 'bold', marginTop: 4, textAlign: 'right' },

  candidatoCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  candidatoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  candidatoAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  candidatoName: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  candidatoOficio: { fontSize: 15, color: '#6B7280', marginTop: 2 },
  candidatoFooter: { borderTopWidth: 1, borderColor: '#F3F4F6', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  candidatoFooterText: { fontSize: 13, color: '#4B5563', flex: 1 },
  settingsOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 12, marginBottom: 10, elevation: 1 },
  settingsRow: { flexDirection: 'row', alignItems: 'center' },
  settingsText: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginLeft: 15 },
  bottomNavigation: { backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderColor: '#E5E7EB', elevation: 15, paddingVertical: 12 },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' },
  navText: { fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: '600' }, // 6 BOTONES: UN POCO MÁS CHICO PARA QUE QUEPAN
  
  badgeNotif: { position: 'absolute', top: -4, right: -8, backgroundColor: '#D32F2F', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  badgeNotifText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },

  badge: { position: 'absolute', top: -5, right: '25%', backgroundColor: '#D32F2F', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 15 },
  modalBgDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 15 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 21, fontWeight: 'bold', color: '#0D2340', marginBottom: 20 },
  modalSubtitle: { fontSize: 16, color: '#6B7280', marginBottom: 15, fontStyle: 'italic' },
  modalLabel: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 16, color: '#1F2937' },
  pickerBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 15, overflow: 'hidden' },
  avisoOficio: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 10, marginTop: 8 },
  avisoOficioTexto: { flex: 1, marginLeft: 8, fontSize: 13, color: '#92400E' },
  uploadArea: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 15 },
  uploadText: { color: '#9CA3AF', marginTop: 5, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  uploadedImagePreview: { width: '100%', height: 120, borderRadius: 10 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  modalBtnCancel: { padding: 12, marginRight: 10 },
  modalBtnTextC: { color: '#6B7280', fontWeight: 'bold', fontSize: 16 },
  modalBtnSave: { backgroundColor: '#00D06C', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  modalBtnTextS: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  candHeaderCover: { height: 100, backgroundColor: '#0D2340' },
  closeExpandedBtn: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8, zIndex: 10 },
  candAvatarBig: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#FFF', backgroundColor: '#E5E7EB' },
  candNameBig: { fontSize: 22, fontWeight: 'bold', color: '#0D2340', marginTop: 10 },
  candOficioBig: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  candStatsRow: { flexDirection: 'row', marginTop: 15, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 12, width: '80%', justifyContent: 'space-around' },
  candStatBox: { alignItems: 'center' },
  candStatValue: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  candStatLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: 'bold' },
  candInfoLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: 'bold', textTransform: 'uppercase' },
  candInfoValue: { fontSize: 17, color: '#1F2937', fontWeight: '600', marginBottom: 20 },
  verPortafolioBtn: { backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  verPortafolioText: { color: '#0D2340', fontWeight: 'bold', fontSize: 15 },
  candBtnAccion: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginHorizontal: 5 },
  candBtnText: { fontWeight: 'bold', fontSize: 15, marginLeft: 5 },
  feedJobCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20 },
  feedJobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  feedContractorAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5E7EB', marginRight: 15, borderWidth: 1, borderColor: '#D1D5DB' },
  feedJobTitle: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  feedJobCompany: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
  feedJobImageContainer: { position: 'relative', marginBottom: 15 },
  feedJobImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#E5E7EB' },
  feedJobDetailsGrid: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  feedJobDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  feedJobDetailText: { fontSize: 15, color: '#4B5563', marginLeft: 8 },
  feedJobDesc: { fontSize: 16, color: '#4B5563', lineHeight: 22, marginBottom: 15 },
  expandedProgressBox: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 15 },
  imageTag: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  imageTagText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  searchContainerInteligente: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: '#1F2937' },
  searchResultsBox: { maxHeight: 150, backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 15, marginTop: 5, overflow: 'hidden' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  searchResultAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#E5E7EB' },
  searchResultName: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  searchResultRole: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  selectedUserBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BBEFD3', marginBottom: 15, justifyContent: 'space-between' },
  selectedUserAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#E5E7EB' },
  selectedUserName: { fontSize: 17, fontWeight: 'bold', color: '#005530' },
  selectedUserRole: { fontSize: 13, color: '#059669', marginTop: 2, fontWeight: 'bold' },

  reviewCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  reviewAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#E5E7EB' },
  reviewName: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  reviewDate: { fontSize: 13, color: '#9CA3AF' },
  reviewStarsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  reviewComment: { fontSize: 15, color: '#4B5563', fontStyle: 'italic', lineHeight: 21 },

  // ESTILOS DE LA BITÁCORA DIARIA Y EVIDENCIA
  trackerRow: { flexDirection: 'row', marginBottom: 15 },
  trackerTimeline: { alignItems: 'center', width: 20, marginRight: 15 },
  trackerDot: { width: 14, height: 14, borderRadius: 7, zIndex: 2 },
  trackerLine: { width: 2, height: '100%', backgroundColor: '#E5E7EB', position: 'absolute', top: 14, zIndex: 1 },
  trackerContent: { flex: 1, paddingBottom: 5 },
  trackerDate: { fontSize: 15, fontWeight: 'bold', color: '#1F2937' },
  trackerNote: { fontSize: 15, color: '#4B5563', marginTop: 4 },
});
