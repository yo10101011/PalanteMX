import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, LogBox, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// IGNORAR EL ERROR FALSO DE FIREBASE WEBCHANNEL EN EXPO
LogBox.ignoreLogs(['@firebase/firestore', "WebChannelConnection RPC", "Name: undefined Message: undefined"]);

// FIREBASE REAL
// @ts-ignore
import { deleteUser, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { subirFotoACloudinary } from '@/lib/cloudinary';

const { width } = Dimensions.get('window');

export default function DashboardContratista() {
  const params = useLocalSearchParams(); // LECTOR DE PARÁMETROS DE NAVEGACIÓN (P. EJ. { tab: 'Vacantes' } DESDE MENSAJES)
  const [userData, setUserData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [pestañaActiva, setPestañaActiva] = useState('Explorar'); 
  const [ubicacionLegible, setUbicacionLegible] = useState('Calculando ubicación...');
  
  const [categoriaExplorar, setCategoriaExplorar] = useState('Todos');
  const [mensajesSinLeer, setMensajesSinLeer] = useState(0);

  const [directorio, setDirectorio] = useState<any[]>([]); 
  const [misVacantes, setMisVacantes] = useState<any[]>([]);
  const [candidatos, setCandidatos] = useState<any[]>([]);

  const [modalEditar, setModalEditar] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editApellidos, setEditApellidos] = useState('');
  const [editEmpresa, setEditEmpresa] = useState('');
  const [editUbicacion, setEditUbicacion] = useState('');

  const [modalVacante, setModalVacante] = useState(false);
  const [vacanteEditandoId, setVacanteEditandoId] = useState<string | null>(null);
  const [vacanteExpandida, setVacanteExpandida] = useState<any>(null); 
  const [vacanteTitulo, setVacanteTitulo] = useState('');
  const [vacanteUbicacion, setVacanteUbicacion] = useState('');
  const [vacantePago, setVacantePago] = useState('');
  const [vacanteHorario, setVacanteHorario] = useState('');
  const [vacanteDesc, setVacanteDesc] = useState('');
  const [vacanteCupo, setVacanteCupo] = useState('1'); 
  const [vacanteCategoria, setVacanteCategoria] = useState('Albañilería');
  const [vacanteFoto, setVacanteFoto] = useState<string | null>(null);

  const [candidatoSeleccionado, setCandidatoSeleccionado] = useState<any>(null);
  
  // ESTADOS PARA PERFIL Y CONTRATACIÓN DIRECTA
  const [perfilTrabajadorExpandido, setPerfilTrabajadorExpandido] = useState<any>(null);
  const [obraSupervision, setObraSupervision] = useState<any>(null); 
  const [fotoEvidencia, setFotoEvidencia] = useState<string | null>(null);
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
        
        if (data.ubicacion && data.ubicacion.latitud && data.ubicacion.longitud) {
          try {
            const geo = await Location.reverseGeocodeAsync({ latitude: data.ubicacion.latitud, longitude: data.ubicacion.longitud });
            if (geo && geo.length > 0) {
              const place = geo[0];
              const ciudadTraducida = `${place.city || place.subregion || place.name || ''}, ${place.region || ''}`.replace(/^, /, '').trim();
              setUbicacionLegible(ciudadTraducida);
              setEditUbicacion(data.ubicacion_texto || ciudadTraducida);
            } else { setUbicacionLegible(data.ubicacion_texto || 'Ubicación GPS desconocida'); }
          } catch (e) { setUbicacionLegible(data.ubicacion_texto || 'Ubicación de base de datos'); }
        } else { setUbicacionLegible(data.ubicacion_texto || 'Sin datos GPS'); }

        const snapDir = await getDocs(collection(db, 'Usuarios'));
        const listaDir = snapDir.docs.map(d => ({id: d.id, ...d.data()}));
        listaDir.sort((a: any, b: any) => (parseFloat(b.calificacion) || 0) - (parseFloat(a.calificacion) || 0));
        setDirectorio(listaDir);

        const qVacantes = query(collection(db, 'Vacantes'), where('id_contratista', '==', usuarioActual.uid));
        const vacantesSnap = await getDocs(qVacantes);
        
        const listaVac: any[] = vacantesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        listaVac.sort((a, b) => new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime());
        setMisVacantes(listaVac);

        const postulacionesSnap = await getDocs(collection(db, 'Postulaciones'));
        const todasPostulaciones: any[] = postulacionesSnap.docs.map(d => ({id: d.id, ...d.data()}));
        const postulacionesMias = todasPostulaciones.filter(p => listaVac.some(v => v.id === p.id_vacante));

        const candidatosReales = [];
        for (const p of postulacionesMias) {
          const trabajadorDoc = await getDoc(doc(db, 'Usuarios', p.id_trabajador));
          if (trabajadorDoc.exists()) {
            candidatosReales.push({
              ...p,
              id_trabajador: trabajadorDoc.id,
              trabajador: { id: trabajadorDoc.id, ...trabajadorDoc.data() }
            });
          }
        }
        setCandidatos(candidatosReales);
      }
    } catch (error) { console.log("Error", error); } finally { setCargando(false); }
  };

  useEffect(() => { cargarPerfil(); }, []);

  // SI VENIMOS DE OTRA PANTALLA (P. EJ. LA BARRA DE MENSAJES), ABRIR LA PESTAÑA QUE PIDIÓ
  useEffect(() => {
    if (params.tab) { setPestañaActiva(params.tab as string); }
  }, [params.tab]);

  // CONTADOR DE MENSAJES SIN LEER EN TIEMPO REAL. SE ABRE UNA SOLA VEZ Y SE CIERRA AL SALIR DE LA PANTALLA
  // (ANTES SE ABRÍA UNA ESCUCHA NUEVA CADA VEZ QUE SE RECARGABA EL PERFIL, Y NINGUNA SE CERRABA)
  useEffect(() => {
    const usuarioActual = auth.currentUser;
    if (!usuarioActual) return;
    const qChats = query(collection(db, 'Chats'), where('usuarios_ids', 'array-contains', usuarioActual.uid));
    return onSnapshot(qChats, (snap) => {
      const sinLeer = snap.docs.filter(d => d.data().ultimo_emisor_id !== usuarioActual.uid && d.data().leido === false).length;
      setMensajesSinLeer(sinLeer);
    });
  }, []);

  const seleccionarFoto = async (destino: 'perfil' | 'vacante' | 'queja') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (destino === 'vacante') setVacanteFoto(base64Data);
      if (destino === 'queja') setQuejaFoto(base64Data);
      if (destino === 'perfil') {
        Alert.alert("Actualizar Foto", "¿Deseas guardar esta nueva foto?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Sí", onPress: async () => {
              setProcesando(true);
              const urlSegura = await subirFotoACloudinary(base64Data);
              await updateDoc(doc(db, userData.refPath), { foto_rostro_url: urlSegura });
              await cargarPerfil();
              setProcesando(false);
            }
          }
        ]);
      }
    }
  };

  const guardarEdicionPerfil = async () => {
    setProcesando(true);
    await updateDoc(doc(db, userData.refPath), { empresa: editEmpresa, ubicacion_texto: editUbicacion });
    await cargarPerfil(); setProcesando(false); setModalEditar(false);
  };

  const abrirModalNuevaVacante = () => {
    setVacanteEditandoId(null); setVacanteTitulo(''); setVacanteUbicacion(''); setVacantePago(''); setVacanteHorario(''); setVacanteDesc(''); setVacanteCupo('1'); setVacanteFoto(null); setVacanteCategoria('Albañilería');
    setModalVacante(true);
  };

  const abrirModalEditarVacante = (vacante: any) => {
    setVacanteExpandida(null); 
    setVacanteEditandoId(vacante.id);
    setVacanteTitulo(vacante.titulo);
    setVacanteUbicacion(vacante.ubicacion);
    setVacantePago(vacante.pago);
    setVacanteHorario(vacante.horario);
    setVacanteDesc(vacante.descripcion);
    setVacanteCupo(vacante.cupo_total ? vacante.cupo_total.toString() : '1');
    setVacanteCategoria(vacante.categoria);
    setVacanteFoto(vacante.foto_trabajo || null);
    setModalVacante(true);
  };

  const publicarOEditarVacante = async () => {
    if (!vacanteTitulo || !vacanteUbicacion || !vacanteDesc || !vacanteHorario) { 
      Alert.alert("Aviso", "Faltan campos obligatorios para publicar la vacante."); return; 
    }
    setProcesando(true);
    let urlFotoTrabajo = vacanteFoto;
    if (vacanteFoto && vacanteFoto.startsWith('data:image')) {
      urlFotoTrabajo = await subirFotoACloudinary(vacanteFoto);
    }
    
    if (vacanteEditandoId) {
      await updateDoc(doc(db, 'Vacantes', vacanteEditandoId), {
        titulo: vacanteTitulo, ubicacion: vacanteUbicacion, pago: vacantePago || 'A convenir', horario: vacanteHorario, descripcion: vacanteDesc, categoria: vacanteCategoria, cupo_total: parseInt(vacanteCupo) || 1, foto_trabajo: urlFotoTrabajo,
      });
      Alert.alert("¡Vacante Actualizada!", "Tus cambios ya están en la Bolsa de Trabajo.");
    } else {
      const nuevaVacante = {
        titulo: vacanteTitulo, contratista: `${userData.nombre} ${userData.apellidos}`, foto_contratista: userData.foto_rostro_url || null, empresa: userData.empresa || 'Independiente', id_contratista: userData.id, ubicacion: vacanteUbicacion, pago: vacantePago || 'A convenir', horario: vacanteHorario, descripcion: vacanteDesc, categoria: vacanteCategoria, cupo_total: parseInt(vacanteCupo) || 1, cupo_actual: 0, foto_trabajo: urlFotoTrabajo, etiquetas: ['Nueva'], estado: 'Activa', postulantes: 0, fecha_publicacion: new Date().toISOString()
      };
      await addDoc(collection(db, 'Vacantes'), nuevaVacante);
      Alert.alert("¡Vacante Publicada!", "Tu oferta ya está visible en la Bolsa de Trabajo.");
    }
    
    await cargarPerfil();
    setProcesando(false); setModalVacante(false);
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

  // --- NUEVA LÓGICA DE CONTRATACIÓN DIRECTA ---
  const iniciarContratacionDirecta = (trabajador: any) => {
    const vacantesActivas = misVacantes.filter(v => v.estado === 'Activa');
    if (vacantesActivas.length === 0) {
      Alert.alert("Sin vacantes", "No tienes vacantes activas. Publica una primero para poder asignarle la obra a este trabajador.");
      return;
    }
    setTrabajadorParaContratar(trabajador);
    setVacanteSeleccionadaParaContratar(vacantesActivas[0].id);
    setModalContratarDirecto(true);
  };

  const confirmarContratacionDirecta = async () => {
    setProcesando(true);
    try {
      const vacanteRef = doc(db, 'Vacantes', vacanteSeleccionadaParaContratar);
      const vacanteDoc = await getDoc(vacanteRef);
      
      if (vacanteDoc.exists()) {
        const vData = vacanteDoc.data();
        const cupoNuevo = (vData.cupo_actual || 0) + 1;
        const cupoMaximo = vData.cupo_total || 1;
        let nuevoEstado = vData.estado;
        
        if (cupoNuevo >= cupoMaximo) {
          nuevoEstado = 'Cerrada';
        }
        await updateDoc(vacanteRef, { cupo_actual: cupoNuevo, estado: nuevoEstado });
        
        await addDoc(collection(db, 'Postulaciones'), {
          id_vacante: vacanteRef.id,
          titulo_vacante: vData.titulo,
          id_trabajador: trabajadorParaContratar.id,
          id_contratista: userData.id,
          estado: 'Aceptada (En Proceso)',
          fecha_postulacion: new Date().toISOString()
        });

        setModalContratarDirecto(false);
        setPerfilTrabajadorExpandido(null);
        await cargarPerfil();

        router.replace({
          pathname: '/mensajes',
          params: { autoOpenId: trabajadorParaContratar.id, autoOpenNombre: `${trabajadorParaContratar.nombre} ${trabajadorParaContratar.apellidos}`, autoOpenRol: trabajadorParaContratar.oficio_principal || 'Trabajador', autoOpenFoto: trabajadorParaContratar.foto_rostro_url || 'https://via.placeholder.com/150' }
        } as any);
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo realizar la contratación directa.");
    }
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

  const aceptarCandidato = async () => {
    setProcesando(true);
    try {
      await updateDoc(doc(db, 'Postulaciones', candidatoSeleccionado.id), { estado: 'Aceptada (En Proceso)' });
      
      const vacanteRef = doc(db, 'Vacantes', candidatoSeleccionado.id_vacante);
      const vacanteDoc = await getDoc(vacanteRef);
      
      if (vacanteDoc.exists()) {
        const vData = vacanteDoc.data();
        const cupoNuevo = (vData.cupo_actual || 0) + 1;
        const cupoMaximo = vData.cupo_total || 1;
        let nuevoEstado = vData.estado;
        
        if (cupoNuevo >= cupoMaximo) {
          nuevoEstado = 'Cerrada';
          setTimeout(() => { Alert.alert("¡Vacante Llena y Cerrada!", "Has alcanzado el número de trabajadores que necesitabas."); }, 1000);
        } else {
          Alert.alert("Trabajador Contratado", `Has aceptado a ${candidatoSeleccionado.trabajador.nombre}. Llevas ${cupoNuevo} de ${cupoMaximo} contratados.`);
        }
        await updateDoc(vacanteRef, { cupo_actual: cupoNuevo, estado: nuevoEstado });
      }
      await cargarPerfil(); setCandidatoSeleccionado(null);
    } catch (error) { Alert.alert("Error", "No se pudo aceptar al candidato."); }
    setProcesando(false);
  };

  const rechazarCandidato = async () => {
    setProcesando(true);
    try {
      await updateDoc(doc(db, 'Postulaciones', candidatoSeleccionado.id), { estado: 'Rechazada' });
      await cargarPerfil(); Alert.alert("Candidato Rechazado", "El perfil ha sido descartado."); setCandidatoSeleccionado(null);
    } catch (error) { Alert.alert("Error", "Hubo un problema."); }
    setProcesando(false);
  };

  const eliminarCuenta = () => {
    Alert.alert("¡ALERTA PELIGRO!", "¿Seguro que deseas borrar tu cuenta de Contratista? Perderás todo.", [
      { text: "Cancelar", style: "cancel" }, { text: "Eliminar definitivamente", style: "destructive", onPress: async () => {
          try {
            setCargando(true);
            if (auth.currentUser) { await deleteDoc(doc(db, userData.refPath)); await deleteUser(auth.currentUser); router.replace('/' as any); }
          } catch (error) { setCargando(false); Alert.alert("Error", "Debes volver a iniciar sesión para borrar tu cuenta."); }
        }
      }
    ]);
  };

  const cerrarSesion = async () => {
    Alert.alert("Cerrar Sesión", "¿Estás seguro que deseas salir?", [
      { text: "Cancelar", style: "cancel" }, { text: "Sí", onPress: async () => { await signOut(auth); router.replace('/' as any); } }
    ]);
  };

  const categoriasFiltro = ['Todos', 'Albañil', 'Carpintero', 'Electricista', 'Plomero', 'Pintor', 'Cerrajero', 'Bolero', 'Otro'];
  const directorioFiltrado = categoriaExplorar === 'Todos' ? directorio : directorio.filter(t => t.oficio_principal === categoriaExplorar);

  if (cargando) { return ( <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#0D2340" /><Text style={styles.loadingText}>Cargando Panel Central...</Text></View> ); }

  const solicitudesPendientes = candidatos.filter(c => c.estado !== 'Rechazada' && c.estado !== 'Aceptada (En Proceso)');
  const trabajadoresContratados = candidatos.filter(c => c.estado === 'Aceptada (En Proceso)');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        
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
          </View>
        </View>

        <View style={styles.tabsContainer}>
          {['Explorar', 'Vacantes', 'Obras', 'Candidatos', 'Ajustes'].map((tab) => (
            <TouchableOpacity key={tab} style={[styles.tabButton, pestañaActiva === tab && styles.tabButtonActive]} onPress={() => setPestañaActiva(tab)}>
              <Text style={[styles.tabText, pestañaActiva === tab && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.contentSection}>

          {/* --- PESTAÑA: DIRECTORIO DE TRABAJADORES CON FILTROS --- */}
          {pestañaActiva === 'Explorar' && (
            <View>
              <Text style={styles.sectionTitle}>Talentos Sobresalientes</Text>
              <Text style={{fontSize: 12, color: '#6B7280', marginBottom: 15}}>Encuentra y contacta directamente a los mejores profesionales para tu obra.</Text>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15}}>
                {categoriasFiltro.map((cat, i) => (
                  <TouchableOpacity key={i} style={[styles.filterChip, categoriaExplorar === cat && styles.filterChipActive]} onPress={() => setCategoriaExplorar(cat)}>
                    <Text style={[styles.filterChipText, categoriaExplorar === cat && styles.filterChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {directorioFiltrado.length > 0 ? (
                directorioFiltrado.map((trabajador, index) => (
                  <TouchableOpacity key={index} style={styles.workerFeedCard} activeOpacity={0.9} onPress={() => setPerfilTrabajadorExpandido({ ...trabajador, yaContratado: false })}>
                    
                    <View style={[styles.workerFeedStatusBadge, {backgroundColor: trabajador.disponibilidad === 'Ocupado' ? '#F59E0B' : '#00D06C'}]}>
                      <Text style={styles.workerFeedStatusText}>{trabajador.disponibilidad === 'Ocupado' ? 'TRABAJANDO' : 'DISPONIBLE'}</Text>
                    </View>

                    <View style={styles.workerFeedHeader}>
                      <Image source={{ uri: trabajador.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.workerFeedAvatar} />
                      <View style={{flex: 1, paddingRight: 80}}>
                        <Text style={styles.workerFeedName} numberOfLines={2}>{trabajador.nombre} {trabajador.apellidos}</Text>
                        <Text style={styles.workerFeedOficio}>{trabajador.oficio_principal || 'Trabajador General'}</Text>
                      </View>
                    </View>

                    <View style={styles.workerFeedDetailsGrid}>
                      <View style={styles.workerFeedDetailRow}><Ionicons name="star" size={16} color="#F59E0B" /><Text style={[styles.workerFeedDetailText, {color: '#B45309', fontWeight: 'bold'}]}>{trabajador.calificacion || '0.0'}</Text></View>
                      <View style={styles.workerFeedDetailRow}><Ionicons name="location-outline" size={16} color="#6B7280" /><Text style={styles.workerFeedDetailText}>{trabajador.ubicacion_texto?.split(',')[0] || 'Sin ubicación'}</Text></View>
                      <View style={styles.workerFeedDetailRow}><Ionicons name="images-outline" size={16} color="#0D2340" /><Text style={styles.workerFeedDetailText}>{trabajador.portafolio?.length || 0} Obras</Text></View>
                    </View>
                    
                    {trabajador.portafolio && trabajador.portafolio.length > 0 && (
                      <View style={styles.workerFeedPreviewRow}>
                        {trabajador.portafolio.slice(0, 3).map((obra: any, idx: number) => (
                          <Image key={idx} source={{uri: obra.foto_despues || obra.foto_antes || 'https://via.placeholder.com/150'}} style={styles.workerFeedMiniImg} />
                        ))}
                        {trabajador.portafolio.length > 3 && (
                          <View style={styles.workerFeedMiniImgOverlay}><Text style={styles.workerFeedMiniImgText}>+{trabajador.portafolio.length - 3}</Text></View>
                        )}
                      </View>
                    )}

                    <TouchableOpacity style={styles.workerFeedBtn} onPress={() => iniciarContratacionDirecta(trabajador)}>
                      <Ionicons name="briefcase" size={18} color="#FFF" style={{marginRight: 5}}/>
                      <Text style={styles.workerFeedBtnText}>Asignar a Vacante y Contactar</Text>
                    </TouchableOpacity>

                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Sin resultados</Text>
                  <Text style={{textAlign: 'center', color: '#9CA3AF'}}>Aún no hay trabajadores registrados en la plataforma para esta categoría.</Text>
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
              <Text style={styles.sectionTitle}>Supervisión de Obras Activas</Text>
              <Text style={{fontSize: 12, color: '#6B7280', marginBottom: 15}}>Lleva el control diario de tus trabajadores contratados y revisa sus evidencias de trabajo.</Text>
              
              {trabajadoresContratados.length > 0 ? (
                trabajadoresContratados.map((cand, index) => (
                  <View key={index} style={[styles.candidatoCard, {borderColor: '#00D06C', borderWidth: 1}]}>
                    <View style={styles.candidatoHeader}>
                      <Image source={{ uri: cand.trabajador.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.candidatoAvatar} />
                      <View style={{flex: 1}}>
                        <Text style={styles.candidatoName}>{cand.trabajador.nombre} {cand.trabajador.apellidos}</Text>
                        <Text style={styles.candidatoOficio}>Obra: {cand.titulo_vacante}</Text>
                      </View>
                      <View style={{backgroundColor: '#D1FAE5', padding: 5, borderRadius: 20}}>
                        <Ionicons name="construct" size={16} color="#059669"/>
                      </View>
                    </View>
                    
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
                      <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#0D2340', borderColor: '#0D2340', flex: 1, marginRight: 5}]} onPress={() => {
                        // Buscar en el portafolio del trabajador si creó una obra que coincida con este título o esté "En Proceso"
                        const obraMatch = cand.trabajador.portafolio?.find((o: any) => o.titulo === cand.titulo_vacante) || cand.trabajador.portafolio?.find((o: any) => o.estado === 'En Proceso');
                        setObraSupervision({ cand, obraMatch });
                      }}>
                        <Ionicons name="reader" size={16} color="#FFF" />
                        <Text style={[styles.candBtnText, {color: '#FFF', fontSize: 11}]}>Ver Bitácora</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#3B82F6', borderColor: '#3B82F6', flex: 1, marginHorizontal: 5}]} onPress={() => setPerfilTrabajadorExpandido({ ...cand.trabajador, yaContratado: true })}>
                        <Ionicons name="person" size={16} color="#FFF" />
                        <Text style={[styles.candBtnText, {color: '#FFF', fontSize: 11}]}>Ver Perfil</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#F59E0B', borderColor: '#F59E0B', flex: 1, marginLeft: 5}]} onPress={() => {
                        setUsuarioSeleccionadoParaEvaluar({ id: cand.id_trabajador, nombre: cand.trabajador.nombre, apellidos: cand.trabajador.apellidos, foto_rostro_url: cand.trabajador.foto_rostro_url, rol: 'Trabajador' });
                        setModalEvaluar(true);
                      }}>
                        <Ionicons name="star" size={16} color="#FFF" />
                        <Text style={[styles.candBtnText, {color: '#FFF', fontSize: 11}]}>Calificar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="construct-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>No tienes obras activas</Text>
                  <Text style={styles.emptyStateText}>Acepta la solicitud de un trabajador para comenzar a supervisar su bitácora de obra.</Text>
                </View>
              )}
            </View>
          )}

          {pestañaActiva === 'Candidatos' && (
            <View>
              <Text style={styles.sectionTitle}>Nuevas Solicitudes</Text>
              {solicitudesPendientes.length > 0 ? (
                solicitudesPendientes.map((cand, index) => (
                  <TouchableOpacity key={index} style={styles.candidatoCard} activeOpacity={0.8} onPress={() => setCandidatoSeleccionado(cand)}>
                    <View style={styles.candidatoHeader}>
                      <Image source={{ uri: cand.trabajador.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.candidatoAvatar} />
                      <View style={{flex: 1}}>
                        <Text style={styles.candidatoName}>{cand.trabajador.nombre} {cand.trabajador.apellidos}</Text>
                        <Text style={styles.candidatoOficio}>{cand.trabajador.oficio_principal} • {cand.trabajador.calificacion || 'Nuevo'} <Ionicons name="star" size={12} color="#F59E0B"/></Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </View>
                    <View style={styles.candidatoFooter}><Text style={styles.candidatoFooterText}><Text style={{fontWeight: 'bold'}}>Postuló para:</Text> {cand.titulo_vacante}</Text></View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Bandeja Limpia</Text>
                  <Text style={styles.emptyStateText}>Aún no hay trabajadores nuevos o ya los revisaste todos.</Text>
                </View>
              )}
            </View>
          )}

          {pestañaActiva === 'Ajustes' && (
            <View>
              <Text style={styles.sectionTitle}>Configuración Empresarial</Text>
              <TouchableOpacity style={styles.settingsOption} onPress={() => setModalEditar(true)}><View style={styles.settingsRow}><Ionicons name="person-circle-outline" size={24} color="#0D2340" /><Text style={styles.settingsText}>Editar datos de la empresa</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
              <TouchableOpacity style={styles.settingsOption} onPress={abrirModalEvaluar}><View style={styles.settingsRow}><Ionicons name="star-outline" size={24} color="#F59E0B" /><Text style={styles.settingsText}>Evaluar a un Trabajador contratado</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
              <TouchableOpacity style={styles.settingsOption} onPress={abrirModalQueja}><View style={styles.settingsRow}><Ionicons name="shield-half-outline" size={24} color="#D32F2F" /><Text style={[styles.settingsText, {color: '#D32F2F'}]}>Levantar Reporte a Trabajador</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
              <TouchableOpacity style={[styles.settingsOption, { marginTop: 20 }]} onPress={cerrarSesion}><View style={styles.settingsRow}><Ionicons name="log-out-outline" size={24} color="#0D2340" /><Text style={[styles.settingsText, { fontWeight: 'bold' }]}>Cerrar Sesión</Text></View></TouchableOpacity>
              <TouchableOpacity style={[styles.settingsOption, { borderBottomWidth: 0, marginTop: 10 }]} onPress={eliminarCuenta}><View style={styles.settingsRow}><Ionicons name="trash-outline" size={24} color="#D32F2F" /><Text style={[styles.settingsText, { color: '#D32F2F', fontWeight: 'bold' }]}>Eliminar cuenta de contratista</Text></View></TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* --- MENÚ INFERIOR ACTUALIZADO DE 5 BOTONES --- */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Explorar')}><Ionicons name="search" size={26} color={pestañaActiva === 'Explorar' ? "#0D2340" : "#6B7280"} /><Text style={[styles.navText, pestañaActiva === 'Explorar' && {color: '#0D2340', fontWeight: 'bold'}]}>Explorar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Vacantes')}><Ionicons name="megaphone" size={26} color={pestañaActiva === 'Vacantes' ? "#0D2340" : "#6B7280"} /><Text style={[styles.navText, pestañaActiva === 'Vacantes' && {color: '#0D2340', fontWeight: 'bold'}]}>Anuncios</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Obras')}><Ionicons name="construct" size={26} color={pestañaActiva === 'Obras' ? "#0D2340" : "#6B7280"} /><Text style={[styles.navText, pestañaActiva === 'Obras' && {color: '#0D2340', fontWeight: 'bold'}]}>Obras</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Candidatos')}><Ionicons name="people" size={26} color={pestañaActiva === 'Candidatos' ? "#0D2340" : "#6B7280"} />{solicitudesPendientes.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{solicitudesPendientes.length}</Text></View>}<Text style={[styles.navText, pestañaActiva === 'Candidatos' && {color: '#0D2340', fontWeight: 'bold'}]}>Solicitud</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/mensajes' as any)}>
          <View style={{position: 'relative'}}>
            <Ionicons name="chatbubbles-outline" size={26} color="#6B7280" />
            {mensajesSinLeer > 0 && <View style={styles.badgeNotif}><Text style={styles.badgeNotifText}>{mensajesSinLeer > 9 ? '+9' : mensajesSinLeer}</Text></View>}
          </View>
          <Text style={styles.navText}>Mensaje</Text>
        </TouchableOpacity>
      </View>

      {/* --- MODAL PARA ASIGNAR A VACANTE DIRECTO DESDE EXPLORAR --- */}
      <Modal visible={modalContratarDirecto} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <Text style={styles.modalTitle}>Asignar a una Obra</Text>
            <Text style={{fontSize: 14, color: '#6B7280', marginBottom: 15}}>Selecciona a qué vacante activa deseas asignar a {trabajadorParaContratar?.nombre}. Al confirmar, el cupo de la vacante se actualizará y se abrirá el chat.</Text>
            
            <Text style={styles.modalLabel}>Mis Vacantes Activas</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={vacanteSeleccionadaParaContratar} onValueChange={setVacanteSeleccionadaParaContratar}>
                {misVacantes.filter(v => v.estado === 'Activa').map((v, i) => (
                   <Picker.Item key={i} label={v.titulo} value={v.id} />
                ))}
              </Picker>
            </View>
            
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalContratarDirecto(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={confirmarContratacionDirecta} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Contratar y Hablar</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!vacanteExpandida} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          <View style={[styles.modalContainer, {maxHeight: '90%', padding: 0, overflow: 'hidden'}]}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>👁️ Así la ven los trabajadores</Text><TouchableOpacity onPress={() => setVacanteExpandida(null)}><Ionicons name="close" size={24} color="#FFF"/></TouchableOpacity></View>
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
                <Text style={{fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5}}>ESTADO DEL CUPO</Text>
                <View style={[styles.progressBarBg, {height: 8}]}><View style={[styles.progressBarFill, {width: `${((vacanteExpandida?.cupo_actual || 0) / (vacanteExpandida?.cupo_total || 1)) * 100}%`}]} /></View>
                <Text style={{fontSize: 14, fontWeight: 'bold', color: '#0D2340', marginTop: 5}}>{vacanteExpandida?.cupo_actual || 0} de {vacanteExpandida?.cupo_total || 1} contratados</Text>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
                {vacanteExpandida?.estado === 'Activa' && (<TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#FEE2E2', borderColor: '#F87171'}]} onPress={() => cerrarVacante(vacanteExpandida.id)}><Ionicons name="power" size={20} color="#DC2626" /><Text style={[styles.candBtnText, {color: '#DC2626'}]}>Cerrar Oferta</Text></TouchableOpacity>)}
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
              <Text style={styles.modalLabel}>Sede / Ubicación Principal</Text><TextInput style={styles.modalInput} value={editUbicacion} onChangeText={setEditUbicacion} />
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
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <View style={{flex: 1, marginRight: 5}}>
                  <Text style={styles.modalLabel}>Oficio (Categoría)</Text>
                  <View style={styles.pickerBox}>
                    <Picker selectedValue={vacanteCategoria} onValueChange={(v) => setVacanteCategoria(v)}>
                      <Picker.Item label="Albañilería" value="Albañilería" /><Picker.Item label="Plomería" value="Plomería" /><Picker.Item label="Electricidad" value="Electricidad" /><Picker.Item label="Carpintería" value="Carpintería" /><Picker.Item label="Limpieza" value="Limpieza" /><Picker.Item label="Pintura" value="Pintura" /><Picker.Item label="Varios" value="Varios" />
                    </Picker>
                  </View>
                </View>
                <View style={{flex: 1, marginLeft: 5}}><Text style={styles.modalLabel}>¿Cuántos necesitas?</Text><TextInput style={styles.modalInput} placeholder="Ej. 1" value={vacanteCupo} onChangeText={setVacanteCupo} keyboardType="numeric" /></View>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <View style={{flex: 1, marginRight: 5}}><Text style={styles.modalLabel}>Ubicación</Text><TextInput style={styles.modalInput} placeholder="Ej. Toluca" value={vacanteUbicacion} onChangeText={setVacanteUbicacion} /></View>
                <View style={{flex: 1, marginLeft: 5}}><Text style={styles.modalLabel}>Pago</Text><TextInput style={styles.modalInput} placeholder="Ej. $2500 Semanal" value={vacantePago} onChangeText={setVacantePago} /></View>
              </View>
              <Text style={styles.modalLabel}>Horario / Días de Trabajo</Text><TextInput style={styles.modalInput} placeholder="Ej. Lunes a Sábado de 8 a 5" value={vacanteHorario} onChangeText={setVacanteHorario} />
              <Text style={styles.modalLabel}>Descripción del Trabajo (Sé específico)</Text><TextInput style={[styles.modalInput, {height: 80, textAlignVertical: 'top'}]} placeholder="Se requiere levantar muros..." multiline value={vacanteDesc} onChangeText={setVacanteDesc} />
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
                <View style={styles.candStatBox}><Text style={styles.candStatValue}>{candidatoSeleccionado?.trabajador?.portafolio?.length || 0}</Text><Text style={styles.candStatLabel}>Obras</Text></View>
              </View>
            </View>
            <View style={{padding: 20}}>
              <Text style={styles.candInfoLabel}>Postulado para la vacante:</Text><Text style={styles.candInfoValue}>{candidatoSeleccionado?.titulo_vacante}</Text>
              <TouchableOpacity style={styles.verPortafolioBtn} onPress={() => { const trabajadorCompleto = candidatoSeleccionado.trabajador; setCandidatoSeleccionado(null); setPerfilTrabajadorExpandido({ ...trabajadorCompleto, yaContratado: false }); }}>
                <Ionicons name="images-outline" size={18} color="#0D2340" style={{marginRight: 8}}/><Text style={styles.verPortafolioText}>Ver Perfil Completo</Text>
              </TouchableOpacity>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 30}}>
                <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#FEE2E2', borderColor: '#F87171'}]} onPress={rechazarCandidato} disabled={procesando}><Ionicons name="close-circle-outline" size={20} color="#DC2626" /><Text style={[styles.candBtnText, {color: '#DC2626'}]}>Rechazar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.candBtnAccion, {backgroundColor: '#0D2340', borderColor: '#0D2340'}]} onPress={aceptarCandidato} disabled={procesando}><Ionicons name="checkmark-circle" size={20} color="#FFF" /><Text style={[styles.candBtnText, {color: '#FFF'}]}>Aceptar</Text></TouchableOpacity>
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
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Ionicons name="person-circle" size={28} color="#00D06C" style={{marginRight: 10}}/><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>Perfil de {perfilTrabajadorExpandido?.nombre}</Text></View>
              <TouchableOpacity onPress={() => setPerfilTrabajadorExpandido(null)}><Ionicons name="close-circle" size={28} color="#FFF"/></TouchableOpacity>
            </View>
            <View style={{backgroundColor: '#FFF', padding: 15, borderBottomWidth: 1, borderColor: '#E5E7EB', alignItems: 'center'}}>
              <Text style={{fontSize: 12, color: '#6B7280', fontWeight: 'bold', marginBottom: 5}}>ESTADO ACTUAL DEL TRABAJADOR</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: perfilTrabajadorExpandido?.disponibilidad === 'Ocupado' ? '#FEF3C7' : '#D1FAE5', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 15}}>
                <View style={[styles.dispDot, {backgroundColor: perfilTrabajadorExpandido?.disponibilidad === 'Ocupado' ? '#F59E0B' : '#059669', marginRight: 5}]} />
                <Text style={{color: perfilTrabajadorExpandido?.disponibilidad === 'Ocupado' ? '#B45309' : '#059669', fontWeight: 'bold'}}>{perfilTrabajadorExpandido?.disponibilidad === 'Ocupado' ? 'OCUPADO EN OTRA OBRA' : 'DISPONIBLE PARA TRABAJAR'}</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{padding: 20}}>
              <Text style={styles.sectionTitle}>Historial de Obras</Text>
              {perfilTrabajadorExpandido?.portafolio && perfilTrabajadorExpandido.portafolio.length > 0 ? (
                perfilTrabajadorExpandido.portafolio.map((trabajo: any, idx: number) => (
                  <View key={idx} style={[styles.feedJobCard, {padding: 0, overflow: 'hidden', elevation: 2}]}>
                    <View style={{flexDirection: 'row', height: 150}}>
                      {trabajo.foto_antes && (<View style={{flex: 1, borderRightWidth: 1, borderColor: '#FFF', position: 'relative'}}><Image source={{uri: trabajo.foto_antes}} style={{width: '100%', height: '100%'}}/><View style={styles.imageTag}><Text style={styles.imageTagText}>Inicio</Text></View></View>)}
                      {trabajo.foto_despues && (<View style={{flex: 1, position: 'relative'}}><Image source={{uri: trabajo.foto_despues}} style={{width: '100%', height: '100%'}}/><View style={styles.imageTag}><Text style={styles.imageTagText}>Fin</Text></View></View>)}
                    </View>
                    <View style={{padding: 15}}>
                      <Text style={{fontSize: 16, fontWeight: 'bold', color: '#0D2340'}}>{trabajo.titulo}</Text>
                      <Text style={{fontSize: 13, color: '#6B7280'}}>{trabajo.lugar} • {trabajo.estado}</Text>
                      <Text style={{marginTop: 5, fontSize: 13, color: '#4B5563'}}>{trabajo.descripcion}</Text>
                    </View>
                  </View>
                ))
              ) : ( <Text style={{textAlign: 'center', color: '#6B7280', marginTop: 20}}>Este trabajador aún no ha subido fotos de sus obras pasadas.</Text> )}
              
              {!perfilTrabajadorExpandido?.yaContratado && (
                <TouchableOpacity style={{backgroundColor: '#00D06C', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 12, marginTop: 20}} onPress={() => iniciarContratacionDirecta(perfilTrabajadorExpandido)}>
                  <Ionicons name="briefcase" size={20} color="#FFF" style={{marginRight: 8}} /><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>Asignar a Vacante y Contactar</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* --- MODAL PARA SUPERVISAR LA BITÁCORA ESPECÍFICA DE LA OBRA --- */}
      <Modal visible={!!obraSupervision} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          <SafeAreaView style={{flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, overflow: 'hidden'}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}>
              <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16, flex: 1}} numberOfLines={1}>
                Bitácora: {obraSupervision?.cand?.titulo_vacante}
              </Text>
              <TouchableOpacity onPress={() => setObraSupervision(null)}>
                <Ionicons name="close-circle" size={28} color="#FFF"/>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{padding: 20}}>
              {obraSupervision?.obraMatch && obraSupervision.obraMatch.bitacora && obraSupervision.obraMatch.bitacora.length > 0 ? (
                <View style={{backgroundColor: '#FFF', padding: 20, borderRadius: 16, elevation: 2}}>
                  <Text style={{fontSize: 14, fontWeight: 'bold', color: '#0D2340', marginBottom: 15}}>REGISTRO DIARIO DEL TRABAJADOR:</Text>
                  {obraSupervision.obraMatch.bitacora.map((dia: any, i: number, arr: any[]) => (
                    <View key={i} style={styles.trackerRow}>
                      <View style={styles.trackerTimeline}>
                        <View style={[styles.trackerDot, { backgroundColor: dia.asistio ? '#00D06C' : '#D32F2F' }]} />
                        {i !== arr.length - 1 && <View style={styles.trackerLine} />}
                      </View>
                      <View style={styles.trackerContent}>
                        <Text style={styles.trackerDate}>{dia.fecha} - {dia.asistio ? '✅ Asistió' : '❌ Faltó'}</Text>
                        <Text style={styles.trackerNote}>{dia.nota}</Text>
                        
                        {/* EVIDENCIA FOTOGRÁFICA DE LA BITÁCORA */}
                        {dia.evidencia && (
                          <TouchableOpacity onPress={() => setFotoEvidencia(dia.evidencia)}>
                            <Image source={{uri: dia.evidencia}} style={{width: 100, height: 100, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB'}} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="reader-outline" size={50} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Bitácora Vacía</Text>
                  <Text style={styles.emptyStateText}>El trabajador aún no ha registrado avances diarios para esta obra.</Text>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

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

      {/* --- MODAL PARA VER FOTO DE EVIDENCIA EN PANTALLA COMPLETA --- */}
      <Modal visible={!!fotoEvidencia} transparent animationType="fade">
        <View style={styles.modalBgDark}>
          <TouchableOpacity style={{position: 'absolute', top: 40, right: 20, zIndex: 10}} onPress={() => setFotoEvidencia(null)}>
            <Ionicons name="close-circle" size={36} color="#FFF" />
          </TouchableOpacity>
          {fotoEvidencia && (
            <Image source={{uri: fotoEvidencia}} style={{width: width - 40, height: '70%', borderRadius: 16}} resizeMode="contain" />
          )}
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
  profileSection: { alignItems: 'center', marginTop: -60, paddingHorizontal: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: '#F3F4F6', backgroundColor: '#E5E7EB' },
  editAvatarBadge: { position: 'absolute', bottom: 10, left: -5, backgroundColor: '#0D2340', borderRadius: 15, padding: 5, borderWidth: 2, borderColor: '#FFF' },
  verifiedBadge: { position: 'absolute', bottom: 5, right: -5, borderRadius: 15, padding: 4, borderWidth: 2, borderColor: '#FFF' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#0D2340', marginTop: 10, textAlign: 'center' },
  userRole: { fontSize: 11, color: '#00D06C', fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  empresaText: { fontSize: 15, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 8 },
  locationText: { fontSize: 12, color: '#0D2340', fontWeight: 'bold', marginLeft: 4 },
  
  dispDot: { width: 8, height: 8, borderRadius: 4 },

  statsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 15, marginTop: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, width: '100%', justifyContent: 'space-between' },
  statBox: { alignItems: 'center', flex: 1 },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#0D2340' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontWeight: 'bold', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', height: '80%', alignSelf: 'center' },
  tabsContainer: { flexDirection: 'row', marginTop: 25, paddingHorizontal: 15 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabButtonActive: { borderColor: '#0D2340' },
  tabText: { fontSize: 13, fontWeight: 'bold', color: '#9CA3AF' },
  tabTextActive: { color: '#0D2340' },
  contentSection: { padding: 20, marginTop: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#0D2340', marginBottom: 15 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  addBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  emptyState: { backgroundColor: '#FFF', borderRadius: 16, padding: 40, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#D1D5DB' },
  emptyStateTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginTop: 15, marginBottom: 5 },
  emptyStateText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },

  workerFeedCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, position: 'relative' },
  workerFeedStatusBadge: { position: 'absolute', top: 15, right: 15, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, zIndex: 2 },
  workerFeedStatusText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  workerFeedHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  workerFeedAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E5E7EB', marginRight: 15, borderWidth: 2, borderColor: '#F3F4F6' },
  workerFeedName: { fontSize: 18, fontWeight: 'bold', color: '#0D2340', marginBottom: 2 },
  workerFeedOficio: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  workerFeedDetailsGrid: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'space-around' },
  workerFeedDetailRow: { flexDirection: 'row', alignItems: 'center' },
  workerFeedDetailText: { fontSize: 13, color: '#4B5563', marginLeft: 6 },
  workerFeedPreviewRow: { flexDirection: 'row', marginBottom: 15, overflow: 'hidden' },
  workerFeedMiniImg: { width: 70, height: 70, borderRadius: 8, marginRight: 10, backgroundColor: '#E5E7EB' },
  workerFeedMiniImgOverlay: { width: 70, height: 70, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', position: 'absolute', right: 0 },
  workerFeedMiniImgText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  workerFeedBtn: { backgroundColor: '#00D06C', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  workerFeedBtnText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },

  filterChip: { backgroundColor: '#E5E7EB', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  filterChipActive: { backgroundColor: '#0D2340' },
  filterChipText: { color: '#4B5563', fontSize: 13, fontWeight: 'bold' },
  filterChipTextActive: { color: '#FFF' },

  catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  catalogCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  catalogImageWrapper: { position: 'relative', height: 120 },
  catalogImage: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  catalogStatusBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  catalogStatusText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  catalogInfo: { padding: 12 },
  catalogTitle: { fontSize: 13, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  catalogSubtitle: { fontSize: 11, color: '#6B7280', marginBottom: 8 },
  progressBarBg: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00D06C' },
  catalogCupoText: { fontSize: 10, color: '#0D2340', fontWeight: 'bold', marginTop: 4, textAlign: 'right' },

  candidatoCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  candidatoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  candidatoAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  candidatoName: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  candidatoOficio: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  candidatoFooter: { borderTopWidth: 1, borderColor: '#F3F4F6', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  candidatoFooterText: { fontSize: 11, color: '#4B5563', flex: 1 },
  settingsOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 12, marginBottom: 10, elevation: 1 },
  settingsRow: { flexDirection: 'row', alignItems: 'center' },
  settingsText: { fontSize: 14, fontWeight: 'bold', color: '#1F2937', marginLeft: 15 },
  bottomNavigation: { backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderColor: '#E5E7EB', elevation: 15, paddingVertical: 12 },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' },
  navText: { fontSize: 10, color: '#6B7280', marginTop: 4, fontWeight: '600' },
  
  badgeNotif: { position: 'absolute', top: -4, right: -8, backgroundColor: '#D32F2F', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  badgeNotifText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },

  badge: { position: 'absolute', top: -5, right: '25%', backgroundColor: '#D32F2F', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 15 },
  modalBgDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 15 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0D2340', marginBottom: 20 },
  modalSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 15, fontStyle: 'italic' },
  modalLabel: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: '#1F2937' },
  pickerBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 15, overflow: 'hidden' },
  uploadArea: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 15 },
  uploadText: { color: '#9CA3AF', marginTop: 5, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  uploadedImagePreview: { width: '100%', height: 120, borderRadius: 10 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  modalBtnCancel: { padding: 12, marginRight: 10 },
  modalBtnTextC: { color: '#6B7280', fontWeight: 'bold', fontSize: 14 },
  modalBtnSave: { backgroundColor: '#00D06C', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  modalBtnTextS: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  candHeaderCover: { height: 100, backgroundColor: '#0D2340' },
  closeExpandedBtn: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8, zIndex: 10 },
  candAvatarBig: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#FFF', backgroundColor: '#E5E7EB' },
  candNameBig: { fontSize: 22, fontWeight: 'bold', color: '#0D2340', marginTop: 10 },
  candOficioBig: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  candStatsRow: { flexDirection: 'row', marginTop: 15, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 12, width: '80%', justifyContent: 'space-around' },
  candStatBox: { alignItems: 'center' },
  candStatValue: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  candStatLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: 'bold' },
  candInfoLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: 'bold', textTransform: 'uppercase' },
  candInfoValue: { fontSize: 15, color: '#1F2937', fontWeight: '600', marginBottom: 20 },
  verPortafolioBtn: { backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  verPortafolioText: { color: '#0D2340', fontWeight: 'bold', fontSize: 13 },
  candBtnAccion: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginHorizontal: 5 },
  candBtnText: { fontWeight: 'bold', fontSize: 13, marginLeft: 5 },
  feedJobCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20 },
  feedJobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  feedContractorAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5E7EB', marginRight: 15, borderWidth: 1, borderColor: '#D1D5DB' },
  feedJobTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  feedJobCompany: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  feedJobImageContainer: { position: 'relative', marginBottom: 15 },
  feedJobImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#E5E7EB' },
  feedJobDetailsGrid: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  feedJobDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  feedJobDetailText: { fontSize: 13, color: '#4B5563', marginLeft: 8 },
  feedJobDesc: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 15 },
  expandedProgressBox: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 15 },
  imageTag: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  imageTagText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  searchContainerInteligente: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#1F2937' },
  searchResultsBox: { maxHeight: 150, backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 15, marginTop: 5, overflow: 'hidden' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  searchResultAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#E5E7EB' },
  searchResultName: { fontSize: 14, fontWeight: 'bold', color: '#0D2340' },
  searchResultRole: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  selectedUserBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BBEFD3', marginBottom: 15, justifyContent: 'space-between' },
  selectedUserAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#E5E7EB' },
  selectedUserName: { fontSize: 15, fontWeight: 'bold', color: '#005530' },
  selectedUserRole: { fontSize: 11, color: '#059669', marginTop: 2, fontWeight: 'bold' },

  reviewCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  reviewAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#E5E7EB' },
  reviewName: { fontSize: 14, fontWeight: 'bold', color: '#0D2340' },
  reviewDate: { fontSize: 11, color: '#9CA3AF' },
  reviewStarsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  reviewComment: { fontSize: 13, color: '#4B5563', fontStyle: 'italic', lineHeight: 18 },

  // ESTILOS DE LA BITÁCORA DIARIA Y EVIDENCIA
  trackerRow: { flexDirection: 'row', marginBottom: 15 },
  trackerTimeline: { alignItems: 'center', width: 20, marginRight: 15 },
  trackerDot: { width: 14, height: 14, borderRadius: 7, zIndex: 2 },
  trackerLine: { width: 2, height: '100%', backgroundColor: '#E5E7EB', position: 'absolute', top: 14, zIndex: 1 },
  trackerContent: { flex: 1, paddingBottom: 5 },
  trackerDate: { fontSize: 13, fontWeight: 'bold', color: '#1F2937' },
  trackerNote: { fontSize: 13, color: '#4B5563', marginTop: 4 },
});