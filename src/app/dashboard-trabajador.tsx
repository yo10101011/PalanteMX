import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// FIREBASE
// @ts-ignore
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { subirFotoACloudinary } from '@/lib/cloudinary';
import { buscarObraDeVacante } from '@/lib/obras';
import { eliminarCuentaEnServidor } from '@/lib/cuenta';

const { width } = Dimensions.get('window');

export default function DashboardTrabajador() {
  const params = useLocalSearchParams(); // LECTOR DE PARÁMETROS DE NAVEGACIÓN
  const [userData, setUserData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [pestañaActiva, setPestañaActiva] = useState('Mis Trabajos'); 
  const [ubicacionLegible, setUbicacionLegible] = useState('Calculando ubicación...');
  const [disponibilidad, setDisponibilidad] = useState('Disponible');

  const [modalEditar, setModalEditar] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editApellidos, setEditApellidos] = useState('');
  const [editOficio, setEditOficio] = useState('');
  const [editUbicacion, setEditUbicacion] = useState('');

  const [modalTrabajo, setModalTrabajo] = useState(false);
  const [obraEditandoId, setObraEditandoId] = useState<string | null>(null); 
  const [trabajoTitulo, setTrabajoTitulo] = useState('');
  const [trabajoLugar, setTrabajoLugar] = useState('');
  const [trabajoPrecio, setTrabajoPrecio] = useState('');
  const [trabajoDesc, setTrabajoDesc] = useState('');
  const [trabajoExperiencia, setTrabajoExperiencia] = useState('');
  const [trabajoFechaInicio, setTrabajoFechaInicio] = useState(''); 
  const [trabajoFechaFin, setTrabajoFechaFin] = useState('');
  const [mostrarPickerInicio, setMostrarPickerInicio] = useState(false);
  const [mostrarPickerFin, setMostrarPickerFin] = useState(false);
  const [trabajoEstado, setTrabajoEstado] = useState('En Proceso'); 
  const [fotoAntes, setFotoAntes] = useState<string | null>(null);
  const [fotoDespues, setFotoDespues] = useState<string | null>(null);

  const [obraExpandida, setObraExpandida] = useState<any>(null);

  const [modalQueja, setModalQueja] = useState(false);
  const [listaUsuariosSistema, setListaUsuariosSistema] = useState<any[]>([]); 
  const [busquedaUsuario, setBusquedaUsuario] = useState(''); 
  const [usuarioSeleccionadoParaQueja, setUsuarioSeleccionadoParaQueja] = useState<any>(null); 
  const [quejaMotivo, setQuejaMotivo] = useState('Falta de Pago');
  const [quejaDesc, setQuejaDesc] = useState('');
  const [quejaFoto, setQuejaFoto] = useState<string | null>(null);

  const [modalEvaluar, setModalEvaluar] = useState(false);
  const [listaUsuariosEvaluar, setListaUsuariosEvaluar] = useState<any[]>([]);
  const [busquedaUsuarioEvaluar, setBusquedaUsuarioEvaluar] = useState('');
  const [usuarioSeleccionadoParaEvaluar, setUsuarioSeleccionadoParaEvaluar] = useState<any>(null);
  const [evaluarEstrellas, setEvaluarEstrellas] = useState('5');
  const [evaluarComentario, setEvaluarComentario] = useState('');

  const [modalAvance, setModalAvance] = useState(false);
  const [obraSeleccionada, setObraSeleccionada] = useState<any>(null);
  const [avanceAsistio, setAvanceAsistio] = useState(true);
  const [avanceNota, setAvanceNota] = useState('');
  const [avanceEvidencia, setAvanceEvidencia] = useState<string | null>(null);
  
  const [misObrasContratadas, setMisObrasContratadas] = useState<any[]>([]);

  // MAGIA: SI VENIMOS DE OTRA PANTALLA, ABRIR LA PESTAÑA CORRECTA
  useEffect(() => {
    if (params.tab) { setPestañaActiva(params.tab as string); }
  }, [params.tab]);

  const cargarPerfil = async () => {
    try {
      const usuarioActual = auth.currentUser;
      if (!usuarioActual) { router.replace('/' as any); return; }

      let userDoc = await getDoc(doc(db, 'Usuarios', usuarioActual.uid));
      if (!userDoc.exists()) userDoc = await getDoc(doc(db, 'Contratistas', usuarioActual.uid));

      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({ id: userDoc.id, refPath: userDoc.ref.path, ...data });
        setEditNombre(data.nombre || '');
        setEditApellidos(data.apellidos || '');
        setEditOficio(data.oficio_principal || 'Albañil');
        setDisponibilidad(data.disponibilidad || 'Disponible');
        
        if (data.ubicacion && data.ubicacion.latitud && data.ubicacion.longitud) {
          try {
            const geo = await Location.reverseGeocodeAsync({ latitude: data.ubicacion.latitud, longitude: data.ubicacion.longitud });
            if (geo && geo.length > 0) {
              const place = geo[0];
              const ciudadTraducida = `${place.city || place.subregion || place.name || ''}, ${place.region || ''}`.replace(/^, /, '').trim();
              setUbicacionLegible(ciudadTraducida);
              setEditUbicacion(data.ubicacion_texto || ciudadTraducida);
            } else { setUbicacionLegible(data.ubicacion_texto || 'Ubicación GPS desconocida'); }
          } catch (e) { setUbicacionLegible(data.ubicacion_texto || 'Ubicación guardada en BD'); }
        } else { setUbicacionLegible(data.ubicacion_texto || 'Sin datos de GPS'); }

        const postRef = query(collection(db, 'Postulaciones'), where('id_trabajador', '==', usuarioActual.uid), where('estado', '==', 'Aceptada (En Proceso)'));
        const snapPost = await getDocs(postRef);
        const obrasAsignadas = [];
        for (const p of snapPost.docs) {
           const pData = p.data();
           const contDoc = await getDoc(doc(db, 'Contratistas', pData.id_contratista));
           if (contDoc.exists()) {
               obrasAsignadas.push({ ...pData, id_postulacion: p.id, contratista_data: contDoc.data() });
           }
        }
        setMisObrasContratadas(obrasAsignadas);
      }
    } catch (error) { console.log("Error", error); } finally { setCargando(false); }
  };

  useEffect(() => { cargarPerfil(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarPerfil();
    setRefreshing(false);
  };

  const toggleDisponibilidad = async () => {
    const nuevoEstado = disponibilidad === 'Disponible' ? 'Ocupado' : 'Disponible';
    setProcesando(true);
    try {
      await updateDoc(doc(db, userData.refPath), { disponibilidad: nuevoEstado });
      setDisponibilidad(nuevoEstado);
    } catch (error) { Alert.alert("Error", "No se pudo actualizar tu estado."); }
    setProcesando(false);
  };

  const seleccionarFoto = async (destino: 'perfil' | 'antes' | 'despues' | 'queja' | 'evidencia_avance') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (destino === 'antes') setFotoAntes(base64Data);
      if (destino === 'despues') setFotoDespues(base64Data);
      if (destino === 'queja') setQuejaFoto(base64Data);
      if (destino === 'evidencia_avance') setAvanceEvidencia(base64Data);
      if (destino === 'perfil') {
        Alert.alert("Actualizar Foto", "¿Deseas guardar esta nueva foto?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Sí", onPress: async () => {
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
    if (!editUbicacion) { Alert.alert("Aviso", "Llena tu ubicación exacta."); return; }
    setProcesando(true);
    await updateDoc(doc(db, userData.refPath), { oficio_principal: editOficio, ubicacion_texto: editUbicacion });
    await cargarPerfil(); setProcesando(false); setModalEditar(false);
  };

  const abrirModalNuevaObra = () => {
    setObraEditandoId(null); setTrabajoTitulo(''); setTrabajoLugar(''); setTrabajoPrecio(''); setTrabajoDesc(''); setTrabajoExperiencia(''); setTrabajoFechaInicio(''); setTrabajoFechaFin(''); setFotoAntes(null); setFotoDespues(null); setTrabajoEstado('En Proceso'); setModalTrabajo(true);
  };

  const abrirModalEditarObra = (obra: any) => {
    setObraEditandoId(obra.id_obra); setTrabajoTitulo(obra.titulo || ''); setTrabajoLugar(obra.lugar || ''); setTrabajoPrecio(obra.precio !== 'No especificado' ? obra.precio : ''); setTrabajoDesc(obra.descripcion || ''); setTrabajoExperiencia(obra.experiencia_cliente || ''); setTrabajoFechaInicio(obra.fecha_inicio !== 'No especificada' ? obra.fecha_inicio : ''); setTrabajoFechaFin(obra.fecha_fin !== 'No especificada' ? obra.fecha_fin : ''); setTrabajoEstado(obra.estado || 'En Proceso'); setFotoAntes(obra.foto_antes || null); setFotoDespues(obra.foto_despues || null); setModalTrabajo(true);
  };

  const guardarProyectoPortafolio = async () => {
    if (!trabajoTitulo || !trabajoLugar || !trabajoDesc) { Alert.alert("Aviso", "Falta llenar título, lugar y descripción."); return; }
    if (trabajoEstado === 'Finalizada' && !fotoDespues) { Alert.alert("Aviso", "Para finalizar la obra debes subir la Foto del Resultado (Después)."); return; }
    setProcesando(true);
    let urlAntes = fotoAntes; let urlDespues = fotoDespues;
    if (fotoAntes && fotoAntes.startsWith('data:image')) urlAntes = await subirFotoACloudinary(fotoAntes);
    if (fotoDespues && fotoDespues.startsWith('data:image')) urlDespues = await subirFotoACloudinary(fotoDespues);
    const portafolioActualizado = [...(userData.portafolio || [])];

    if (obraEditandoId) {
      const indexObra = portafolioActualizado.findIndex((o: any) => o && typeof o === 'object' && o.id_obra === obraEditandoId);
      if (indexObra !== -1) { portafolioActualizado[indexObra] = { ...portafolioActualizado[indexObra], titulo: trabajoTitulo, lugar: trabajoLugar, estado: trabajoEstado, fecha_inicio: trabajoFechaInicio || 'No especificada', fecha_fin: trabajoFechaFin || 'No especificada', precio: trabajoPrecio || 'No especificado', descripcion: trabajoDesc, experiencia_cliente: trabajoExperiencia, foto_antes: urlAntes, foto_despues: urlDespues }; }
    } else {
      const nuevoTrabajo = { id_obra: new Date().getTime().toString(), titulo: trabajoTitulo, lugar: trabajoLugar, estado: trabajoEstado, fecha_inicio: trabajoFechaInicio || 'No especificada', fecha_fin: trabajoFechaFin || 'No especificada', precio: trabajoPrecio || 'No especificado', descripcion: trabajoDesc, experiencia_cliente: trabajoExperiencia, foto_antes: urlAntes, foto_despues: urlDespues, fecha_publicacion: new Date().toISOString(), bitacora: [] };
      portafolioActualizado.push(nuevoTrabajo);
    }
    await updateDoc(doc(db, userData.refPath), { portafolio: portafolioActualizado });
    await cargarPerfil(); setProcesando(false); setModalTrabajo(false); Alert.alert("Obra Guardada", "Tu proyecto se actualizó exitosamente.");
  };

  const eliminarObraPortafolio = (idObra: string) => {
    Alert.alert("Eliminar Obra", "¿Estás seguro de que deseas borrar este trabajo de tu portafolio?", [
      { text: "Cancelar", style: "cancel" }, { text: "Sí, Eliminar", style: "destructive", onPress: async () => { setProcesando(true); try { const portafolioActualizado = (userData.portafolio || []).filter((o: any) => o && typeof o === 'object' && o.id_obra !== idObra); await updateDoc(doc(db, userData.refPath), { portafolio: portafolioActualizado }); await cargarPerfil(); setObraExpandida(null); Alert.alert("Obra Eliminada", "El trabajo ha sido borrado de tu perfil."); } catch (error) { Alert.alert("Error", "No se pudo eliminar la obra."); } setProcesando(false); } }
    ]);
  };

  const guardarAvanceDiario = async () => {
    if (!avanceNota) { Alert.alert("Aviso", "Describe brevemente qué hiciste o por qué faltaste hoy."); return; }
    if (avanceAsistio && !avanceEvidencia) { Alert.alert("Evidencia Requerida", "Para comprobar tu asistencia con el contratista, debes adjuntar una foto de tu avance de hoy."); return; }
    setProcesando(true);
    
    let urlEvidencia = null;
    if (avanceEvidencia && avanceEvidencia.startsWith('data:image')) {
      urlEvidencia = await subirFotoACloudinary(avanceEvidencia);
    }

    const portafolioActualizado = [...(userData.portafolio || [])];
    const tituloBuscado = obraSeleccionada?.postulacion?.titulo_vacante;
    const idVacante = obraSeleccionada?.postulacion?.id_vacante;

    const obraExistente = buscarObraDeVacante(portafolioActualizado, idVacante, tituloBuscado);
    let indexObra = obraExistente ? portafolioActualizado.indexOf(obraExistente) : -1;

    if (indexObra === -1) {
      const nuevaObra = {
        id_obra: new Date().getTime().toString(),
        id_vacante: idVacante || null, // AMARRA ESTA BITÁCORA A SU VACANTE (ÚNICA), NO SOLO AL TÍTULO
        titulo: tituloBuscado,
        lugar: 'Obra asignada por Contratista',
        estado: 'En Proceso',
        fecha_inicio: new Date().toLocaleDateString('es-MX'),
        fecha_fin: 'En progreso',
        descripcion: 'Proyecto oficial coordinado por un contratista de la plataforma.',
        bitacora: []
      };
      portafolioActualizado.push(nuevaObra);
      indexObra = portafolioActualizado.length - 1;
    }

    if (!portafolioActualizado[indexObra].bitacora) portafolioActualizado[indexObra].bitacora = [];
    
    portafolioActualizado[indexObra].bitacora.push({ 
      fecha: new Date().toLocaleDateString('es-MX'), asistio: avanceAsistio, nota: avanceNota, evidencia: urlEvidencia, timestamp: new Date().getTime() 
    });

    await updateDoc(doc(db, userData.refPath), { portafolio: portafolioActualizado });
    await cargarPerfil();
    Alert.alert("Bitácora Actualizada", "Tu avance de hoy fue registrado con éxito. El contratista ya puede revisarlo.");
    
    setProcesando(false); setModalAvance(false); setAvanceNota(''); setAvanceAsistio(true); setAvanceEvidencia(null); setObraSeleccionada(null);
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
    if (!usuarioSeleccionadoParaQueja || !quejaDesc) { Alert.alert("Aviso", "Debes seleccionar a quién reportas y escribir la descripción."); return; }
    setProcesando(true);
    let urlEvidencia = ""; if (quejaFoto) urlEvidencia = await subirFotoACloudinary(quejaFoto);
    const reporteOficial = { id_reportante: userData.id, nombre_reportante: `${userData.nombre} ${userData.apellidos}`, rol_reportante: 'Trabajador', id_acusado: usuarioSeleccionadoParaQueja.id, acusado: `${usuarioSeleccionadoParaQueja.nombre} ${usuarioSeleccionadoParaQueja.apellidos}`, rol_acusado: usuarioSeleccionadoParaQueja.rol, motivo: quejaMotivo, descripcion: quejaDesc, foto_evidencia: urlEvidencia, estado: "En Revisión Administrativa", fecha_reporte: new Date().toISOString() };
    await addDoc(collection(db, "Quejas_Soporte"), reporteOficial);
    setProcesando(false); setModalQueja(false); setBusquedaUsuario(''); setUsuarioSeleccionadoParaQueja(null); setQuejaDesc(''); setQuejaFoto(null);
    Alert.alert("Reporte Oficial Enviado", "El administrador ha recibido tu caso y revisará el perfil exacto del usuario.");
  };

  const abrirModalEvaluar = async () => {
    setModalEvaluar(true); setUsuarioSeleccionadoParaEvaluar(null); setBusquedaUsuarioEvaluar(''); setEvaluarComentario(''); setEvaluarEstrellas('5');
    try {
      const snapCont = await getDocs(collection(db, 'Contratistas'));
      const snapTrab = await getDocs(collection(db, 'Usuarios'));
      const todos = [...snapCont.docs.map(d => ({id: d.id, rol: 'Contratista', ...d.data()})), ...snapTrab.docs.map(d => ({id: d.id, rol: 'Trabajador', ...d.data()}))];
      setListaUsuariosEvaluar(todos.filter(u => u.id !== userData.id));
    } catch (error) { console.log("Error", error); }
  };

  // LA RESEÑA LA VALIDA Y GUARDA EL SERVIDOR (backend/kyc-worker): SOLO SE CALIFICA A QUIEN TE CONTRATÓ,
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

  const eliminarCuenta = () => {
    Alert.alert("¡ALERTA PELIGRO!", "¿Estás seguro de eliminar tu cuenta? Se borrará todo.", [
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

  if (cargando) { return ( <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#00D06C" /><Text style={styles.loadingText}>Cargando perfil...</Text></View> ); }

  const portafolio = (userData?.portafolio || []).filter((obra: any) => obra && typeof obra === 'object');
  const obrasEnProceso = portafolio.filter((obra: any) => obra.estado === 'En Proceso');
  const obrasFinalizadas = portafolio.filter((obra: any) => obra.estado === 'Finalizada' || !obra.estado);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      <ScrollView 
        style={{flex: 1}} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00D06C']} />}
      >
        
        {(pestañaActiva === 'Portafolio' || pestañaActiva === 'Reseñas' || pestañaActiva === 'Ajustes') && (
          <View>
            <View style={styles.headerCover} />
            <View style={styles.profileSection}>
              <TouchableOpacity style={styles.avatarContainer} onPress={() => seleccionarFoto('perfil')}>
                <Image source={{ uri: userData?.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.avatar} />
                <View style={styles.editAvatarBadge}><Ionicons name="camera" size={14} color="#FFF" /></View>
                {userData?.kyc_aprobado && <View style={styles.verifiedBadge}><Ionicons name="checkmark-circle" size={20} color="#00D06C" /></View>}
              </TouchableOpacity>

              <Text style={styles.userName}>{userData?.nombre} {userData?.apellidos}</Text>
              <Text style={styles.userRole}>{userData?.oficio_principal || userData?.rol_usuario}</Text>
              
              <TouchableOpacity style={[styles.dispBadge, disponibilidad === 'Disponible' ? styles.dispDisponible : styles.dispOcupado]} onPress={toggleDisponibilidad} disabled={procesando}>
                <View style={styles.dispDot} />
                <Text style={styles.dispText}>{disponibilidad === 'Disponible' ? 'DISPONIBLE PARA TRABAJAR' : 'TRABAJANDO / OCUPADO'}</Text>
                {procesando && <ActivityIndicator size="small" color="#FFF" style={{marginLeft: 5}} />}
              </TouchableOpacity>
              
              <View style={[styles.locationBadge, {marginTop: 15}]}><Ionicons name="location" size={12} color="#0D2340" /><Text style={styles.locationText}>{ubicacionLegible}</Text></View>
              <View style={styles.contactBadge}><Ionicons name="logo-whatsapp" size={16} color="#FFF" /><Text style={styles.contactText}>{userData?.numero_telefono || "Sin teléfono"}</Text></View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}><Text style={styles.statNumber}>{userData?.calificacion || '0.0'} <Ionicons name="star" size={14} color="#F59E0B" /></Text><Text style={styles.statLabel}>Calificación</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}><Text style={styles.statNumber}>{portafolio.length}</Text><Text style={styles.statLabel}>Obras</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}><Text style={styles.statNumber}>{userData?.numero_resenas || 0}</Text><Text style={styles.statLabel}>Reseñas</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}><Text style={[styles.statNumber, {color: '#00D06C'}]}>{userData?.vistas_perfil || 0}</Text><Text style={styles.statLabel}>Vistas</Text></View>
              </View>
            </View>

            <View style={styles.tabsContainer}>
              {['Portafolio', 'Reseñas', 'Ajustes'].map((tab) => (
                <TouchableOpacity key={tab} style={[styles.tabButton, pestañaActiva === tab && styles.tabButtonActive]} onPress={() => setPestañaActiva(tab)}>
                  <Text style={[styles.tabText, pestañaActiva === tab && styles.tabTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.contentSection}>
              {pestañaActiva === 'Portafolio' && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Mi Historial de Obras</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={abrirModalNuevaObra}><Ionicons name="add" size={16} color="#FFF" /><Text style={styles.addBtnText}>Añadir Obra</Text></TouchableOpacity>
                  </View>

                  {portafolio.length === 0 && (
                    <View style={styles.emptyState}>
                      <Ionicons name="construct-outline" size={40} color="#D1D5DB" />
                      <Text style={styles.emptyStateText}>Tu portafolio está vacío.</Text>
                      <Text style={styles.emptyStateSub}>Sube el "Antes y Después" de tus trabajos para generar confianza.</Text>
                    </View>
                  )}

                  {obrasEnProceso.length > 0 && (
                    <View style={{marginBottom: 20}}>
                      <Text style={styles.categoryTitle}>🏗️ Obras en Proceso</Text>
                      {obrasEnProceso.map((trabajo: any, index: number) => (
                        <View key={index} style={styles.projectCard}>
                          <View style={styles.statusBadgeProceso}><Text style={styles.statusBadgeText}>EN PROCESO</Text></View>
                          <TouchableOpacity activeOpacity={0.9} onPress={() => setObraExpandida(trabajo)}>
                            {trabajo.foto_despues && (<Image source={{ uri: trabajo.foto_despues }} style={{width: '100%', height: 180}} />)}
                            {!trabajo.foto_despues && trabajo.foto_antes && (<Image source={{ uri: trabajo.foto_antes }} style={{width: '100%', height: 180}} />)}
                            <View style={styles.projectInfo}>
                              <Text style={styles.projectTitle}>{trabajo.titulo}</Text>
                              <View style={styles.projectDetailsRow}><Ionicons name="location-outline" size={12} color="#6B7280" /><Text style={styles.projectSubtitle}>{trabajo.lugar}</Text></View>
                              <View style={[styles.projectDetailsRow, {marginTop: -5, marginBottom: 10}]}><Ionicons name="calendar-outline" size={12} color="#6B7280" /><Text style={styles.projectSubtitle}>Inició: {trabajo.fecha_inicio}</Text></View>
                              <Text style={styles.projectDesc} numberOfLines={2}><Text style={{fontWeight: 'bold'}}>Avance General:</Text> {trabajo.descripcion}</Text>
                              <Text style={{color: '#00D06C', fontSize: 11, marginTop: 5, fontWeight: 'bold'}}>👁️ Toca la imagen o el título para expandir</Text>
                            </View>
                          </TouchableOpacity>
                          <View style={{paddingHorizontal: 15, paddingBottom: 15}}>
                            <TouchableOpacity style={[styles.btnAvance, {backgroundColor: '#FEF3C7'}]} onPress={() => abrirModalEditarObra(trabajo)}>
                              <Ionicons name="pencil-outline" size={16} color="#D97706" /><Text style={[styles.btnAvanceText, {color: '#D97706'}]}>Editar Obra</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {obrasFinalizadas.length > 0 && (
                    <View>
                      <Text style={styles.categoryTitle}>✅ Obras Finalizadas</Text>
                      {obrasFinalizadas.map((trabajo: any, index: number) => (
                        <View key={index} style={styles.projectCard}>
                          <View style={styles.statusBadgeFinalizada}><Text style={styles.statusBadgeText}>FINALIZADA</Text></View>
                          <TouchableOpacity activeOpacity={0.9} onPress={() => setObraExpandida(trabajo)}>
                            <View style={styles.imagesRow}>
                              {trabajo.foto_antes && (<View style={styles.imageHalfContainer}><Image source={{ uri: trabajo.foto_antes }} style={styles.projectImageHalf} /><View style={styles.imageTag}><Text style={styles.imageTagText}>Inicio</Text></View></View>)}
                              <View style={styles.imageHalfContainer}><Image source={{ uri: trabajo.foto_despues }} style={[styles.projectImageHalf, !trabajo.foto_antes && {width: '100%'}]} /><View style={styles.imageTag}><Text style={styles.imageTagText}>Resultado</Text></View></View>
                            </View>
                            <View style={styles.projectInfo}>
                              <Text style={styles.projectTitle}>{trabajo.titulo}</Text>
                              <View style={styles.projectDetailsRow}><Ionicons name="location-outline" size={12} color="#6B7280" /><Text style={styles.projectSubtitle}>{trabajo.lugar}</Text>{trabajo.precio !== 'No especificado' && (<><Text style={styles.dotSeparator}>•</Text><Ionicons name="cash-outline" size={12} color="#00D06C" /><Text style={[styles.projectSubtitle, {color: '#00D06C', fontWeight: 'bold'}]}>${trabajo.precio}</Text></>)}</View>
                              <View style={[styles.projectDetailsRow, {marginTop: -5, marginBottom: 10}]}><Ionicons name="calendar-outline" size={12} color="#6B7280" /><Text style={styles.projectSubtitle}>Trabajado del: {trabajo.fecha_inicio} al {trabajo.fecha_fin}</Text></View>
                              <Text style={styles.projectDesc} numberOfLines={2}><Text style={{fontWeight: 'bold', color: '#0D2340'}}>Obra:</Text> {trabajo.descripcion}</Text>
                              <Text style={{color: '#00D06C', fontSize: 11, marginTop: 5, fontWeight: 'bold'}}>👁️ Toca para ver detalles expandidos</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {pestañaActiva === 'Reseñas' && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Comunidad</Text>
                    <TouchableOpacity style={[styles.addBtn, {backgroundColor: '#F59E0B'}]} onPress={abrirModalEvaluar}>
                      <Ionicons name="star" size={16} color="#FFF" />
                      <Text style={styles.addBtnText}>Evaluar Cliente</Text>
                    </TouchableOpacity>
                  </View>
                  {userData?.resenas && userData.resenas.length > 0 ? (
                    userData.resenas.map((resena: any, index: number) => (
                      <View key={index} style={styles.reviewCard}>
                        <View style={styles.reviewHeader}>
                          <Image source={{uri: resena.evaluador_foto || 'https://via.placeholder.com/150'}} style={styles.reviewAvatar} />
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
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubbles-outline" size={40} color="#D1D5DB" />
                      <Text style={styles.emptyStateText}>Aún no tienes comentarios en tu perfil.</Text>
                      <Text style={styles.emptyStateSub}>Cuando completes un trabajo, los clientes dejarán su opinión aquí.</Text>
                    </View>
                  )}
                </View>
              )}

              {pestañaActiva === 'Ajustes' && (
                <View>
                  <Text style={styles.sectionTitle}>Configuración y Soporte</Text>
                  
                  <TouchableOpacity style={styles.settingsOption} onPress={onRefresh}>
                    <View style={styles.settingsRow}><Ionicons name="refresh-outline" size={24} color="#00D06C" /><Text style={[styles.settingsText, {color: '#00D06C'}]}>Refrescar Base de Datos</Text></View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.settingsOption} onPress={() => setModalEditar(true)}><View style={styles.settingsRow}><Ionicons name="person-circle-outline" size={24} color="#0D2340" /><Text style={styles.settingsText}>Editar información personal</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
                  <TouchableOpacity style={styles.settingsOption} onPress={abrirModalQueja}><View style={styles.settingsRow}><Ionicons name="shield-half-outline" size={24} color="#D32F2F" /><Text style={[styles.settingsText, {color: '#D32F2F'}]}>Levantar Reporte Oficial</Text></View><Ionicons name="chevron-forward" size={20} color="#9CA3AF" /></TouchableOpacity>
                  <TouchableOpacity style={[styles.settingsOption, { marginTop: 20 }]} onPress={cerrarSesion}><View style={styles.settingsRow}><Ionicons name="log-out-outline" size={24} color="#0D2340" /><Text style={[styles.settingsText, { fontWeight: 'bold' }]}>Cerrar Sesión</Text></View></TouchableOpacity>
                  <TouchableOpacity style={[styles.settingsOption, { borderBottomWidth: 0, marginTop: 10 }]} onPress={eliminarCuenta}><View style={styles.settingsRow}><Ionicons name="trash-outline" size={24} color="#D32F2F" /><Text style={[styles.settingsText, { color: '#D32F2F', fontWeight: 'bold' }]}>Eliminar mi cuenta</Text></View></TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {pestañaActiva === 'Mis Trabajos' && (
          <View style={{flex: 1}}>
            <View style={styles.headerDark}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                <Text style={styles.headerDarkTitle}>Mis Obras Asignadas</Text>
                {refreshing ? <ActivityIndicator color="#00D06C" /> : <TouchableOpacity onPress={onRefresh}><Ionicons name="refresh" size={24} color="#00D06C" /></TouchableOpacity>}
              </View>
              <Text style={styles.headerDarkSub}>Registra tu bitácora diaria para que el contratista la revise.</Text>
            </View>
            
            <View style={styles.contentSection}>
              {misObrasContratadas.length > 0 ? (
                misObrasContratadas.map((obra, idx) => {
                  const obraMatch = buscarObraDeVacante(userData?.portafolio, obra.id_vacante, obra.titulo_vacante);
                  return (
                    <View key={idx} style={[styles.projectCard, {borderColor: '#00D06C', borderWidth: 1}]}>
                      <View style={{flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#F0FDF4'}}>
                        <Image source={{uri: obra.contratista_data?.foto_rostro_url || 'https://via.placeholder.com/150'}} style={{width: 50, height: 50, borderRadius: 25, marginRight: 15, borderWidth: 1, borderColor: '#00D06C'}} />
                        <View style={{flex: 1}}>
                          <Text style={{fontSize: 16, fontWeight: 'bold', color: '#0D2340'}}>{obra.titulo_vacante}</Text>
                          <Text style={{fontSize: 12, color: '#6B7280'}}>Contratista: {obra.contratista_data?.nombre}</Text>
                        </View>
                      </View>
                      
                      <TouchableOpacity style={{backgroundColor: '#0D2340', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, margin: 15, borderRadius: 12}} onPress={() => { setObraSeleccionada({postulacion: obra, obraMatch: obraMatch}); setAvanceEvidencia(null); setModalAvance(true); }}>
                        <Ionicons name="reader" size={20} color="#FFF" style={{marginRight: 8}} />
                        <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 14}}>Ver / Llenar Bitácora Diaria</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="briefcase-outline" size={40} color="#D1D5DB" />
                  <Text style={styles.emptyStateText}>No tienes obras asignadas por el momento.</Text>
                  <Text style={styles.emptyStateSub}>Postúlate a las vacantes de los contratistas desde la pestaña Trabajo.</Text>
                </View>
              )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* --- MENÚ INFERIOR ESTANDARIZADO PARA QUE SIEMPRE SALGAN TODAS LAS PESTAÑAS --- */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/feed' as any)}>
          <Ionicons name="briefcase-outline" size={26} color="#6B7280" />
          <Text style={styles.navText}>Trabajo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Mis Trabajos')}>
          <Ionicons name="construct" size={26} color={pestañaActiva === 'Mis Trabajos' ? "#0D2340" : "#6B7280"} />
          <Text style={[styles.navText, pestañaActiva === 'Mis Trabajos' && {color: '#0D2340', fontWeight: 'bold'}]}>Obras</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/mensajes' as any)}>
          <Ionicons name="chatbubbles-outline" size={26} color="#6B7280" />
          <Text style={styles.navText}>Mensajes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setPestañaActiva('Portafolio')}>
          <Ionicons name="person" size={26} color={pestañaActiva === 'Portafolio' || pestañaActiva === 'Reseñas' || pestañaActiva === 'Ajustes' ? "#00D06C" : "#6B7280"} />
          <Text style={[styles.navText, (pestañaActiva === 'Portafolio' || pestañaActiva === 'Reseñas' || pestañaActiva === 'Ajustes') && {color: '#00D06C', fontWeight: 'bold'}]}>Perfil</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!obraExpandida} animationType="fade" transparent>
        <View style={styles.modalBgDark}>
          <View style={[styles.modalContainer, {maxHeight: '90%', padding: 0, overflow: 'hidden'}]}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.expandedImagesRow}>
                {obraExpandida?.foto_antes && (<View style={styles.expandedImageHalf}><Image source={{uri: obraExpandida.foto_antes}} style={{width: '100%', height: '100%'}} /><View style={styles.imageTag}><Text style={styles.imageTagText}>Inicio</Text></View></View>)}
                {obraExpandida?.foto_despues && (<View style={[styles.expandedImageHalf, !obraExpandida?.foto_antes && {width: '100%', borderRightWidth: 0}]}><Image source={{uri: obraExpandida.foto_despues}} style={{width: '100%', height: '100%'}} /><View style={styles.imageTag}><Text style={styles.imageTagText}>Resultado</Text></View></View>)}
                {!obraExpandida?.foto_antes && !obraExpandida?.foto_despues && (<View style={{width: '100%', height: '100%', backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center'}}><Ionicons name="image-outline" size={40} color="#9CA3AF" /></View>)}
                <TouchableOpacity style={styles.closeExpandedBtn} onPress={() => setObraExpandida(null)}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>
              </View>

              <View style={{padding: 20}}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><View style={obraExpandida?.estado === 'Finalizada' ? styles.statusBadgeFinalizadaRel : styles.statusBadgeProcesoRel}><Text style={styles.statusBadgeText}>{obraExpandida?.estado?.toUpperCase()}</Text></View><Text style={styles.vistaClienteText}>👁️ Vista de Cliente</Text></View>
                <Text style={styles.projectTitleBig}>{obraExpandida?.titulo}</Text>
                <View style={[styles.projectDetailsRow, {marginBottom: 20}]}><Ionicons name="location-outline" size={14} color="#6B7280" /><Text style={styles.projectSubtitleBig}>{obraExpandida?.lugar}</Text>{obraExpandida?.precio !== 'No especificado' && (<><Text style={styles.dotSeparator}>•</Text><Ionicons name="cash-outline" size={14} color="#00D06C" /><Text style={[styles.projectSubtitleBig, {color: '#00D06C', fontWeight: 'bold'}]}>${obraExpandida?.precio}</Text></>)}</View>

                <View style={styles.threeDotsContainer}>
                   <View style={styles.dotWrapper}><View style={[styles.dotBig, {backgroundColor: '#00D06C'}]}><Ionicons name="checkmark" size={12} color="#FFF"/></View><Text style={styles.dotLabel}>Registrada</Text></View>
                   <View style={[styles.dotLine, {backgroundColor: '#00D06C'}]} />
                   <View style={styles.dotWrapper}><View style={[styles.dotBig, {backgroundColor: obraExpandida?.estado === 'Finalizada' ? '#00D06C' : '#F59E0B'}]}><Ionicons name="construct" size={10} color="#FFF"/></View><Text style={styles.dotLabel}>En Proceso</Text></View>
                   <View style={[styles.dotLine, {backgroundColor: obraExpandida?.estado === 'Finalizada' ? '#00D06C' : '#E5E7EB'}]} />
                   <View style={styles.dotWrapper}><View style={[styles.dotBig, {backgroundColor: obraExpandida?.estado === 'Finalizada' ? '#00D06C' : '#E5E7EB'}]}><Ionicons name="flag" size={10} color="#FFF"/></View><Text style={styles.dotLabel}>Finalizada</Text></View>
                </View>

                <View style={styles.expandedFechasBox}>
                   <View style={{alignItems: 'center'}}><Text style={styles.expandedFechasLabel}>Inicio</Text><Text style={styles.expandedFechasValue}>{obraExpandida?.fecha_inicio}</Text></View>
                   <Ionicons name="arrow-forward" size={20} color="#D1D5DB" />
                   <View style={{alignItems: 'center'}}><Text style={styles.expandedFechasLabel}>Fin / Estimado</Text><Text style={styles.expandedFechasValue}>{obraExpandida?.fecha_fin}</Text></View>
                </View>

                <Text style={styles.expandedSectionTitle}>Descripción de la obra</Text><Text style={styles.expandedDesc}>{obraExpandida?.descripcion}</Text>

                <Text style={styles.expandedSectionTitle}>Bitácora Diaria (Pública)</Text>
                <View style={[styles.trackerContainer, {backgroundColor: '#FFF', padding: 0, borderWidth: 0}]}>
                  {obraExpandida?.bitacora && obraExpandida.bitacora.length > 0 ? (
                    obraExpandida.bitacora.map((dia: any, i: number, arr: any[]) => (
                      <View key={i} style={styles.trackerRow}>
                        <View style={styles.trackerTimeline}><View style={[styles.trackerDot, { backgroundColor: dia.asistio ? '#00D06C' : '#D32F2F' }]} />{i !== arr.length - 1 && <View style={styles.trackerLine} />}</View>
                        <View style={styles.trackerContent}>
                          <Text style={styles.trackerDate}>{dia.fecha} - {dia.asistio ? '✅ Asistió' : '❌ Faltó'}</Text>
                          <Text style={styles.trackerNote}>{dia.nota}</Text>
                        </View>
                      </View>
                    ))
                  ) : ( <Text style={styles.trackerEmpty}>No hay reportes diarios registrados en esta obra.</Text> )}
                </View>

                <TouchableOpacity style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEE2E2', padding: 15, borderRadius: 12, marginTop: 20, borderWidth: 1, borderColor: '#FCA5A5'}} onPress={() => eliminarObraPortafolio(obraExpandida.id_obra)} disabled={procesando}>
                  <Ionicons name="trash" size={20} color="#DC2626" style={{marginRight: 8}}/><Text style={{color: '#DC2626', fontWeight: 'bold', fontSize: 14}}>Eliminar esta Obra del Portafolio</Text>
                </TouchableOpacity>

              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalEditar} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Editar Mi Perfil</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* NOMBRE Y APELLIDOS QUEDARON VERIFICADOS CONTRA LA INE: LAS REGLAS DE FIRESTORE NO PERMITEN CAMBIARLOS */}
              <Text style={styles.modalLabel}>Nombres Oficiales (verificados con tu INE)</Text><TextInput style={[styles.modalInput, {backgroundColor: '#E5E7EB', color: '#6B7280'}]} value={editNombre} editable={false}/>
              <Text style={styles.modalLabel}>Apellidos (verificados con tu INE)</Text><TextInput style={[styles.modalInput, {backgroundColor: '#E5E7EB', color: '#6B7280'}]} value={editApellidos} editable={false}/>
              <Text style={styles.modalLabel}>Ubicación visible en perfil</Text><TextInput style={styles.modalInput} placeholder="Ej. San Felipe del Progreso, Edo Mex" value={editUbicacion} onChangeText={setEditUbicacion} />
              <Text style={styles.modalLabel}>Oficio Principal</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={editOficio} onValueChange={(itemValue) => setEditOficio(itemValue)}>
                  <Picker.Item label="Albañil" value="Albañil" /><Picker.Item label="Bolero" value="Bolero" /><Picker.Item label="Carpintero" value="Carpintero" /><Picker.Item label="Cerrajero" value="Cerrajero" /><Picker.Item label="Electricista" value="Electricista" /><Picker.Item label="Plomero" value="Plomero" /><Picker.Item label="Pintor" value="Pintor" /><Picker.Item label="Otro" value="Otro" />
                </Picker>
              </View>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalEditar(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={guardarEdicionPerfil} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Guardar</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalTrabajo} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <Text style={styles.modalTitle}>{obraEditandoId ? 'Editar Obra' : 'Añadir Proyecto'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>Estado de la Obra</Text>
              <View style={styles.pickerBox}><Picker selectedValue={trabajoEstado} onValueChange={(itemValue) => setTrabajoEstado(itemValue)}><Picker.Item label="🏗️ Obra en Proceso" value="En Proceso" /><Picker.Item label="✅ Obra Finalizada" value="Finalizada" /></Picker></View>
              <Text style={styles.modalLabel}>Título del Trabajo</Text><TextInput style={styles.modalInput} placeholder="Ej. Instalación de tubería de cobre" value={trabajoTitulo} onChangeText={setTrabajoTitulo} />
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <View style={{flex: 1, marginRight: 5}}><Text style={styles.modalLabel}>Lugar exacto</Text><TextInput style={styles.modalInput} placeholder="Ej. Toluca Centro" value={trabajoLugar} onChangeText={setTrabajoLugar} /></View>
                <View style={{flex: 1, marginLeft: 5}}><Text style={styles.modalLabel}>Costo Obra (Opcional)</Text><TextInput style={styles.modalInput} placeholder="Ej. 1500" value={trabajoPrecio} onChangeText={setTrabajoPrecio} keyboardType="numeric" /></View>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <View style={{flex: 1, marginRight: 5}}>
                  <Text style={styles.modalLabel}>Fecha de Inicio</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setMostrarPickerInicio(true)}><Text style={{color: trabajoFechaInicio ? '#1F2937' : '#9CA3AF'}}>{trabajoFechaInicio || 'Seleccionar...'}</Text><Ionicons name="calendar" size={16} color="#0D2340"/></TouchableOpacity>
                  {mostrarPickerInicio && (<DateTimePicker value={new Date()} mode="date" display="default" onChange={(event, date) => { setMostrarPickerInicio(Platform.OS === 'ios'); if(date) setTrabajoFechaInicio(date.toLocaleDateString('es-MX')); }} />)}
                </View>
                <View style={{flex: 1, marginLeft: 5}}>
                  <Text style={styles.modalLabel}>{trabajoEstado === 'En Proceso' ? 'Fecha Estimada' : 'Fecha Fin'}</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => setMostrarPickerFin(true)}><Text style={{color: trabajoFechaFin ? '#1F2937' : '#9CA3AF'}}>{trabajoFechaFin || 'Seleccionar...'}</Text><Ionicons name="calendar" size={16} color="#0D2340"/></TouchableOpacity>
                  {mostrarPickerFin && (<DateTimePicker value={new Date()} mode="date" display="default" onChange={(event, date) => { setMostrarPickerFin(Platform.OS === 'ios'); if(date) setTrabajoFechaFin(date.toLocaleDateString('es-MX')); }} />)}
                </View>
              </View>
              <Text style={styles.modalLabel}>Descripción (Materiales, proceso...)</Text><TextInput style={[styles.modalInput, {height: 80, textAlignVertical: 'top'}]} placeholder="Se reemplazó la tubería vieja..." multiline value={trabajoDesc} onChangeText={setTrabajoDesc} />
              <Text style={styles.modalLabel}>Evidencias Fotográficas</Text>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20}}>
                <TouchableOpacity style={[styles.uploadArea, {flex: 1, marginRight: 5, padding: 10}]} onPress={() => seleccionarFoto('antes')}>
                  {fotoAntes ? <Image source={{uri: fotoAntes}} style={styles.uploadedImagePreview} /> : <><Ionicons name="camera-outline" size={24} color="#9CA3AF"/><Text style={[styles.uploadText, {fontSize: 10}]}>Foto de Inicio</Text></>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.uploadArea, {flex: 1, marginLeft: 5, padding: 10}]} onPress={() => seleccionarFoto('despues')}>
                  {fotoDespues ? <Image source={{uri: fotoDespues}} style={styles.uploadedImagePreview} /> : <><Ionicons name="checkmark-circle-outline" size={24} color="#9CA3AF"/><Text style={[styles.uploadText, {fontSize: 10}]}>Foto {trabajoEstado === 'En Proceso' ? 'Actual' : 'Final'}</Text></>}
                </TouchableOpacity>
              </View>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalTrabajo(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={guardarProyectoPortafolio} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Guardar Obra</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalAvance} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          <SafeAreaView style={{flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, overflow: 'hidden', marginTop: 30}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}>
              <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>Bitácora de Obra</Text>
              <TouchableOpacity onPress={() => setModalAvance(false)}><Ionicons name="close" size={28} color="#FFF"/></TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={{padding: 20}}>
              <Text style={styles.sectionTitle}>{obraSeleccionada?.postulacion?.titulo_vacante || obraSeleccionada?.titulo}</Text>
              
              <Text style={{fontSize: 14, fontWeight: 'bold', color: '#0D2340', marginBottom: 15, marginTop: 10}}>HISTORIAL (ENVIADO AL CONTRATISTA):</Text>
              {obraSeleccionada?.obraMatch?.bitacora && obraSeleccionada.obraMatch.bitacora.length > 0 ? (
                obraSeleccionada.obraMatch.bitacora.map((dia: any, i: number, arr: any[]) => (
                  <View key={i} style={styles.trackerRow}>
                    <View style={styles.trackerTimeline}>
                      <View style={[styles.trackerDot, { backgroundColor: dia.asistio ? '#00D06C' : '#D32F2F' }]} />
                      {i !== arr.length - 1 && <View style={styles.trackerLine} />}
                    </View>
                    <View style={styles.trackerContent}>
                      <Text style={styles.trackerDate}>{dia.fecha} - {dia.asistio ? '✅ Asistió' : '❌ Faltó'}</Text>
                      <Text style={styles.trackerNote}>{dia.nota}</Text>
                      {dia.evidencia && (<Image source={{uri: dia.evidencia}} style={{width: 60, height: 60, borderRadius: 8, marginTop: 5, borderWidth: 1, borderColor: '#E5E7EB'}} />)}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{color: '#6B7280', fontStyle: 'italic', marginBottom: 20}}>Aún no has reportado ningún día. Comienza llenando el formulario de abajo.</Text>
              )}

              <View style={{backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 20}}>
                <Text style={{fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 15}}>Reportar Avance de Hoy</Text>
                
                <Text style={styles.modalLabel}>¿Asististe a la obra hoy?</Text>
                <View style={styles.pickerBox}>
                  <Picker selectedValue={avanceAsistio} onValueChange={(itemValue) => setAvanceAsistio(itemValue)}>
                    <Picker.Item label="✅ Sí asistí y trabajé" value={true} />
                    <Picker.Item label="❌ No pude asistir" value={false} />
                  </Picker>
                </View>
                
                <Text style={styles.modalLabel}>Notas y Avances (Obligatorio)</Text>
                <TextInput style={[styles.modalInput, {height: 80, textAlignVertical: 'top'}]} multiline value={avanceNota} onChangeText={setAvanceNota} />
                
                <Text style={styles.modalLabel}>Evidencia Fotográfica (Para el Contratista)</Text>
                <TouchableOpacity style={styles.uploadArea} onPress={() => seleccionarFoto('evidencia_avance')}>
                  {avanceEvidencia ? <Image source={{uri: avanceEvidencia}} style={styles.uploadedImagePreview} /> : <><Ionicons name="camera-outline" size={30} color="#9CA3AF"/><Text style={styles.uploadText}>Subir Foto de Avance Diario</Text></>}
                </TouchableOpacity>

                <TouchableOpacity style={[styles.modalBtnSave, {marginTop: 10}]} onPress={guardarAvanceDiario} disabled={procesando}>
                  {procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Guardar y Enviar al Contratista</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={modalQueja} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><Ionicons name="shield-half" size={24} color="#D32F2F" style={{marginRight: 10}}/><Text style={[styles.modalTitle, {marginBottom: 0}]}>Reporte Oficial</Text></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <Text style={styles.modalLabel}>Fecha de Expedición</Text>
              <TextInput style={[styles.modalInput, {backgroundColor: '#E5E7EB', color: '#6B7280'}]} value={new Date().toLocaleDateString('es-MX')} editable={false} />

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
                  <Picker.Item label="Falta de pago" value="Falta de Pago" />
                  <Picker.Item label="Malos tratos / Acoso" value="Malos Tratos / Acoso" />
                  <Picker.Item label="Condiciones inseguras" value="Condiciones Inseguras" />
                  <Picker.Item label="Otro" value="Otro" />
                </Picker>
              </View>

              <Text style={styles.modalLabel}>Explica los hechos detalladamente</Text>
              <TextInput style={[styles.modalInput, {height: 100, textAlignVertical: 'top'}]} placeholder="El cliente se negó a pagar..." multiline value={quejaDesc} onChangeText={setQuejaDesc} />
              
              <TouchableOpacity style={styles.uploadArea} onPress={() => seleccionarFoto('queja')}>
                {quejaFoto ? <Image source={{uri: quejaFoto}} style={styles.uploadedImagePreview} /> : <><Ionicons name="document-attach-outline" size={30} color="#9CA3AF"/><Text style={styles.uploadText}>Evidencia: Subir Foto, Captura o Recibo</Text></>}
              </TouchableOpacity>
              
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalQueja(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#D32F2F'}]} onPress={enviarQueja} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Reportar al Admin</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalEvaluar} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <Text style={styles.modalTitle}>Evaluar a un Cliente</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <Text style={styles.modalLabel}>¿A quién deseas calificar?</Text>
              {!usuarioSeleccionadoParaEvaluar ? (
                <View>
                  <View style={[styles.searchContainerInteligente]}><Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} /><TextInput style={[styles.searchInput, {paddingVertical: 10}]} placeholder="Busca a un cliente o contratista..." value={busquedaUsuarioEvaluar} onChangeText={setBusquedaUsuarioEvaluar} /></View>
                  {busquedaUsuarioEvaluar.length > 1 && (
                    <View style={styles.searchResultsBox}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {listaUsuariosEvaluar.filter(u => `${u.nombre} ${u.apellidos}`.toLowerCase().includes(busquedaUsuarioEvaluar.toLowerCase())).map((u, i) => (
                          <TouchableOpacity key={i} style={styles.searchResultItem} onPress={() => setUsuarioSeleccionadoParaEvaluar(u)}>
                            <Image source={{uri: u.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.searchResultAvatar}/>
                            <View><Text style={styles.searchResultName}>{u.nombre} {u.apellidos}</Text><Text style={styles.searchResultRole}>{u.rol || 'Contratista'} • {u.ubicacion_texto?.split(',')[0] || 'México'}</Text></View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.selectedUserBox}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}><Image source={{uri: usuarioSeleccionadoParaEvaluar.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.selectedUserAvatar}/><View><Text style={styles.selectedUserName}>{usuarioSeleccionadoParaEvaluar.nombre} {usuarioSeleccionadoParaEvaluar.apellidos}</Text><Text style={styles.selectedUserRole}>Seleccionado</Text></View></View>
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
  
  headerDark: { backgroundColor: '#0D2340', padding: 20, paddingTop: 30, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerDarkTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  headerDarkSub: { color: '#9CA3AF', fontSize: 13, marginTop: 5 },

  headerCover: { height: 120, backgroundColor: '#0D2340', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  profileSection: { alignItems: 'center', marginTop: -50, paddingHorizontal: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#F3F4F6', backgroundColor: '#E5E7EB' },
  editAvatarBadge: { position: 'absolute', bottom: 10, left: -5, backgroundColor: '#0D2340', borderRadius: 15, padding: 5, borderWidth: 2, borderColor: '#FFF' },
  verifiedBadge: { position: 'absolute', bottom: 5, right: -5, backgroundColor: '#FFF', borderRadius: 12, padding: 2 },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#0D2340', marginTop: 10, textAlign: 'center' },
  userRole: { fontSize: 14, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 8 },
  locationText: { fontSize: 12, color: '#0D2340', fontWeight: 'bold', marginLeft: 4 },
  
  contactBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#25D366', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginTop: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  contactText: { fontSize: 14, color: '#FFF', fontWeight: 'bold', marginLeft: 6 },

  dispBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, marginTop: 10, elevation: 2 },
  dispDisponible: { backgroundColor: '#00D06C' },
  dispOcupado: { backgroundColor: '#F59E0B' },
  dispDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 6 },
  dispText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },

  statsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 15, marginTop: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, width: '100%', justifyContent: 'space-between' },
  statBox: { alignItems: 'center', flex: 1 },
  statNumber: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2, fontWeight: 'bold', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', height: '80%', alignSelf: 'center' },
  tabsContainer: { flexDirection: 'row', marginTop: 25, paddingHorizontal: 15 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabButtonActive: { borderColor: '#00D06C' },
  tabText: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF' },
  tabTextActive: { color: '#0D2340' },
  contentSection: { padding: 20, marginTop: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#0D2340', marginBottom: 15 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00D06C', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  addBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  emptyState: { backgroundColor: '#FFF', borderRadius: 16, padding: 40, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#D1D5DB' },
  emptyStateText: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginTop: 15, textAlign: 'center' },
  emptyStateSub: { fontSize: 12, color: '#9CA3AF', marginTop: 5, textAlign: 'center' },
  
  categoryTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 15, marginTop: 10 },
  projectCard: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, position: 'relative' },
  
  statusBadgeProceso: { position: 'absolute', top: 10, right: 10, backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, zIndex: 10, elevation: 2 },
  statusBadgeFinalizada: { position: 'absolute', top: 10, right: 10, backgroundColor: '#00D06C', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, zIndex: 10, elevation: 2 },
  statusBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },

  imagesRow: { flexDirection: 'row', height: 200 },
  imageHalfContainer: { flex: 1, position: 'relative', borderRightWidth: 1, borderColor: '#FFF' },
  projectImageHalf: { width: '100%', height: '100%' },
  imageTag: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  imageTagText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  projectInfo: { padding: 15 },
  projectTitle: { fontSize: 18, fontWeight: 'bold', color: '#0D2340', marginBottom: 5 },
  projectDetailsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  projectSubtitle: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  dotSeparator: { marginHorizontal: 8, color: '#D1D5DB', fontSize: 14 },
  projectDesc: { fontSize: 13, color: '#4B5563', marginTop: 8, lineHeight: 18, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8 },
  
  trackerContainer: { marginTop: 15, padding: 15, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  trackerTitle: { fontSize: 13, fontWeight: 'bold', color: '#0D2340', marginBottom: 10 },
  trackerRow: { flexDirection: 'row', marginBottom: 15 },
  trackerTimeline: { alignItems: 'center', width: 20, marginRight: 15 },
  trackerDot: { width: 14, height: 14, borderRadius: 7, zIndex: 2 },
  trackerLine: { width: 2, height: '100%', backgroundColor: '#E5E7EB', position: 'absolute', top: 14, zIndex: 1 },
  trackerContent: { flex: 1, paddingBottom: 5 },
  trackerDate: { fontSize: 13, fontWeight: 'bold', color: '#1F2937' },
  trackerNote: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  trackerEmpty: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 10 },
  btnAvance: { backgroundColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 8, marginTop: 5 },
  btnAvanceText: { color: '#0D2340', fontWeight: 'bold', fontSize: 12, marginLeft: 5 },

  settingsOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 12, marginBottom: 10, elevation: 1 },
  settingsRow: { flexDirection: 'row', alignItems: 'center' },
  settingsText: { fontSize: 14, fontWeight: 'bold', color: '#1F2937', marginLeft: 15 },
  
  bottomNavigation: { backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderColor: '#E5E7EB', elevation: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, paddingVertical: 12 },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' },
  navText: { fontSize: 10, color: '#6B7280', marginTop: 4, fontWeight: '600' },
  
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 15 },
  modalBgDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 15 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0D2340', marginBottom: 20 },
  modalSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 15, fontStyle: 'italic' },
  modalLabel: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: '#1F2937' },
  datePickerBtn: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 15, overflow: 'hidden' },
  uploadArea: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 15 },
  uploadText: { color: '#9CA3AF', marginTop: 5, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  uploadedImagePreview: { width: '100%', height: 120, borderRadius: 10 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  modalBtnCancel: { padding: 12, marginRight: 10 },
  modalBtnTextC: { color: '#6B7280', fontWeight: 'bold', fontSize: 14 },
  modalBtnSave: { backgroundColor: '#00D06C', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  modalBtnTextS: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  expandedImagesRow: { flexDirection: 'row', height: 250, position: 'relative' },
  expandedImageHalf: { flex: 1, position: 'relative', borderRightWidth: 1, borderColor: '#FFF' },
  closeExpandedBtn: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8, zIndex: 10 },
  statusBadgeProcesoRel: { backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeFinalizadaRel: { backgroundColor: '#00D06C', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  vistaClienteText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginLeft: 10 },
  projectTitleBig: { fontSize: 24, fontWeight: 'bold', color: '#0D2340', marginBottom: 5 },
  projectSubtitleBig: { fontSize: 14, color: '#6B7280', marginLeft: 4 },
  
  threeDotsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 20, paddingHorizontal: 10 },
  dotWrapper: { alignItems: 'center', flex: 1 },
  dotBig: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', elevation: 2, zIndex: 2 },
  dotLabel: { fontSize: 10, fontWeight: 'bold', color: '#6B7280', marginTop: 5 },
  dotLine: { height: 3, flex: 1, marginHorizontal: -20, marginTop: -15, zIndex: 1 },

  expandedFechasBox: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 15, borderRadius: 12, marginBottom: 20 },
  expandedFechasLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: 'bold', marginBottom: 2 },
  expandedFechasValue: { fontSize: 14, color: '#0D2340', fontWeight: 'bold' },
  expandedSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 10 },
  expandedDesc: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 20 },

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
  reviewComment: { fontSize: 13, color: '#4B5563', fontStyle: 'italic', lineHeight: 18 }
});