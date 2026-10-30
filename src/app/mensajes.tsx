import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LogBox,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// IGNORAR EL ERROR FALSO DE FIREBASE WEBCHANNEL EN EXPO
LogBox.ignoreLogs(['@firebase/firestore', "WebChannelConnection RPC", "Name: undefined Message: undefined"]);

// FIREBASE
// @ts-ignore
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { subirACloudinary, subirFotoACloudinary } from '@/lib/cloudinary';
import { accionContrato, ESTADOS, RESPUESTAS_RAPIDAS } from '@/lib/contratos';
import { useTecladoVisible } from '@/lib/teclado';
import { SelectorFotos, subirFotos } from '@/components/selector-fotos';

export default function Mensajes() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tecladoVisible = useTecladoVisible(); // CON TECLADO ABIERTO NO HACE FALTA EL ESPACIO DE LA BARRA DE NAVEGACIÓN
  
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [miPerfil, setMiPerfil] = useState<any>(null);
  
  // BANDEJA DE ENTRADA (INBOX)
  const [chats, setChats] = useState<any[]>([]);
  const [chatActivo, setChatActivo] = useState<any>(null); 
  
  // CHAT INDIVIDUAL
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // ESTADOS DEL NUEVO MENÚ DE ADJUNTOS
  const [modalAdjuntos, setModalAdjuntos] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<{uri: string, nombre: string, tipo: 'imagen' | 'archivo' | 'audio'} | null>(null);

  // ESTADOS DEL MENÚ DE OPCIONES Y REPORTES
  const [modalOpciones, setModalOpciones] = useState(false);
  const [modalReporte, setModalReporte] = useState(false);
  const [reporteMotivo, setReporteMotivo] = useState('Spam / Fraude');
  const [reporteDesc, setReporteDesc] = useState('');
  const [fotosReporte, setFotosReporte] = useState<string[]>([]);
  const [rapidasAbiertas, setRapidasAbiertas] = useState(false); // RESPUESTAS RÁPIDAS (BOTÓN ⚡)

  // ESTADOS PARA BUSCADOR INTELIGENTE DE NUEVO CHAT
  const [modalNuevoChat, setModalNuevoChat] = useState(false);
  const [listaUsuariosSistema, setListaUsuariosSistema] = useState<any[]>([]);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');

  // ESCUCHAS EN TIEMPO REAL. SE GUARDAN PARA PODER CERRARLAS: SI NO, SIGUEN VIVAS AUNQUE SALGAS DE LA PANTALLA,
  // GASTAN DATOS, Y LA DE UN CHAT VIEJO PUEDE PONER SUS MENSAJES EN EL CHAT QUE ESTÁS VIENDO.
  const escuchaChatsRef = useRef<(() => void) | null>(null);
  const escuchaMensajesRef = useRef<(() => void) | null>(null);

  // TRATOS PENDIENTES CON LA PERSONA DEL CHAT ABIERTO (PROPUESTAS O SOLICITUDES QUE AÚN NO SE ACEPTAN).
  // EL TRATO SE ACEPTA AQUÍ, EN EL CHAT, DESPUÉS DE PLATICAR: ASÍ NADIE CIERRA UN TRATO SIN HABERSE PUESTO DE ACUERDO.
  const [tratos, setTratos] = useState<any[]>([]);
  const mensajeAplicadoRef = useRef(''); // PARA PONER EL MENSAJE LISTO (autoOpenMensaje) UNA SOLA VEZ

  const cargarTratos = async (otroId?: string) => {
    if (!otroId || !auth.currentUser) { setTratos([]); return; }
    const soyTrabajador = miPerfilRef.current?.rol === 'Trabajador';
    try {
      const snap = await getDocs(query(collection(db, 'Postulaciones'), where(soyTrabajador ? 'id_trabajador' : 'id_contratista', '==', auth.currentUser.uid)));
      setTratos(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .filter(c => (soyTrabajador ? c.id_contratista : c.id_trabajador) === otroId)
        .filter(c => c.estado === ESTADOS.PROPUESTA || c.estado === ESTADOS.PENDIENTE));
    } catch (error) { console.log("Error cargando tratos", error); }
  };
  const miPerfilRef = useRef<any>(null);
  miPerfilRef.current = miPerfil;

  const responderTrato = (trato: any, accion: 'aceptar' | 'rechazar') => {
    const aceptar = accion === 'aceptar';
    Alert.alert(aceptar ? "Aceptar el trato" : "No aceptar", aceptar
      ? `¿Ya se pusieron de acuerdo en todo? "${trato.titulo_vacante}" empieza cuando los dos acepten.`
      : `¿Seguro que no quieres seguir con "${trato.titulo_vacante}"?`, [
      { text: "Volver", style: "cancel" },
      { text: aceptar ? "Sí, aceptar" : "Sí", style: aceptar ? 'default' : 'destructive', onPress: async () => {
          setProcesando(true);
          try {
            const resultado = await accionContrato(accion, { id_contrato: trato.id });
            if (!aceptar) Alert.alert("Listo", "Se le avisó a la otra persona.");
            else if (resultado.estado === ESTADOS.ACTIVA) Alert.alert("¡Trato cerrado!", "Los dos aceptaron. La obra ya está activa en la pestaña Obras.");
            else Alert.alert("Aceptaste el trato", "Le avisamos a la otra persona. La obra empieza cuando también acepte desde este chat.");
            await cargarTratos(trato.id_trabajador === miPerfil?.id ? trato.id_contratista : trato.id_trabajador);
          } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // FOTOS Y NOMBRES ACTUALES DE CADA PERSONA. EL CHAT GUARDA UNA COPIA DE CUANDO SE CREÓ (datos_usuarios), QUE NO
  // CAMBIA SI LA PERSONA CAMBIA SU FOTO: POR ESO SE LEE SU PERFIL Y SE USA ESTO PRIMERO.
  const [perfilesActuales, setPerfilesActuales] = useState<Record<string, { foto?: string; nombre?: string }>>({});
  const perfilesPedidosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!miPerfil) return;
    const pendientes = [...new Set(chats.flatMap(c => (Array.isArray(c.usuarios_ids) ? c.usuarios_ids : [])))]
      .filter((id: string) => id !== miPerfil.id && !perfilesPedidosRef.current.has(id));
    pendientes.forEach(async (id: string) => {
      perfilesPedidosRef.current.add(id);
      try {
        let perfil = await getDoc(doc(db, 'Usuarios', id));
        if (!perfil.exists()) perfil = await getDoc(doc(db, 'Contratistas', id));
        if (perfil.exists()) {
          const datos = perfil.data();
          setPerfilesActuales(prev => ({ ...prev, [id]: { foto: datos.foto_rostro_url, nombre: `${datos.nombre} ${datos.apellidos}`.trim() } }));
        }
      } catch (error) { console.log("No se pudo leer el perfil", id, error); }
    });
  }, [chats, miPerfil]);

  // DATOS DE LA OTRA PERSONA DE UN CHAT: LA COPIA DEL CHAT, CORREGIDA CON SU PERFIL ACTUAL
  const datosDe = (chat: any, id?: string) => {
    const copia = (id && chat.datos_usuarios?.[id]) || { nombre: 'Usuario Desconocido', rol: 'N/A' };
    const actual = id ? perfilesActuales[id] : undefined;
    return { ...copia, foto: actual?.foto || copia.foto, nombre: actual?.nombre || copia.nombre };
  };

  useEffect(() => {
    cargarMisChats();
    return () => {
      escuchaChatsRef.current?.();
      escuchaMensajesRef.current?.();
    };
  }, []);

  useEffect(() => {
    // BLINDAJE: Verificamos que los datos existan antes de usar includes
    if (!cargando && params.autoOpenId && miPerfil && chats) {
      const autoOpenStr = String(params.autoOpenId);
      const chatExistente = chats.find(c => c.usuarios_ids && Array.isArray(c.usuarios_ids) && c.usuarios_ids.includes(autoOpenStr));
      
      if (chatExistente) {
        if (!chatActivo || chatActivo.id !== chatExistente.id) abrirChat(chatExistente);
      } else {
        if (!chatActivo && params.autoOpenNombre) crearYabrirChatDirecto();
      }
    }
  }, [cargando, params.autoOpenId, chats, miPerfil]);

  const crearYabrirChatDirecto = async () => {
    setProcesando(true);
    try {
      const nuevoChatObj = {
        usuarios_ids: [miPerfil.id, String(params.autoOpenId)],
        datos_usuarios: {
          [miPerfil.id]: { nombre: `${miPerfil.nombre} ${miPerfil.apellidos}`, foto: miPerfil.foto_rostro_url || 'https://via.placeholder.com/150', rol: miPerfil.rol },
          [String(params.autoOpenId)]: { nombre: params.autoOpenNombre, foto: params.autoOpenFoto || 'https://via.placeholder.com/150', rol: params.autoOpenRol || 'Usuario' }
        },
        ultimo_mensaje: 'Iniciando conexión...',
        leido: true,
        bloqueado: false,
        timestamp: new Date().getTime()
      };
      const docRef = await addDoc(collection(db, 'Chats'), nuevoChatObj);
      abrirChat({ id: docRef.id, ...nuevoChatObj });
    } catch (error) { console.log("Error creando auto-chat", error); }
    setProcesando(false);
  };

  const cargarMisChats = async () => {
    try {
      const usuarioActual = auth.currentUser;
      if (!usuarioActual) { router.replace('/' as any); return; }

      let miRol = 'Trabajador';
      let userDoc = await getDoc(doc(db, 'Usuarios', usuarioActual.uid));
      if (!userDoc.exists()) {
        userDoc = await getDoc(doc(db, 'Contratistas', usuarioActual.uid));
        miRol = 'Contratista';
      }

      if (userDoc.exists()) {
        const datos = userDoc.data();
        setMiPerfil({ id: userDoc.id, rol: miRol, ...datos });
        
        const qChats = query(collection(db, 'Chats'), where('usuarios_ids', 'array-contains', usuarioActual.uid));
        escuchaChatsRef.current?.();
        escuchaChatsRef.current = onSnapshot(qChats, (snapshot) => {
          const listaChats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          listaChats.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
          setChats(listaChats);
          setCargando(false);
        }, () => setCargando(false)); // AL CERRAR SESIÓN SE PIERDE EL PERMISO ANTES DE CERRAR LA ESCUCHA: NO ES UN ERROR REAL
      }
    } catch (error) { console.log("Error cargando perfil", error); setCargando(false); }
  };

  const abrirChat = async (chat: any) => {
    // SE CIERRA LA ESCUCHA DEL CHAT ANTERIOR Y SE LIMPIA LA PANTALLA ANTES DE ABRIR EL NUEVO
    escuchaMensajesRef.current?.();
    escuchaMensajesRef.current = null;
    setMensajes([]);
    setChatActivo(chat);
    setTratos([]);
    cargarTratos(chat.usuarios_ids?.find((id: string) => id !== miPerfil.id));
    // MENSAJE LISTO PARA EMPEZAR LA PLÁTICA (P. EJ. "HOLA, VI TU PERFIL..."), SOLO SI VIENE DE OTRA PANTALLA CON UNO.
    // SE PONE HASTA SABER LOS MENSAJES DEL CHAT: SI YA MANDÉ ESE MISMO MENSAJE (LA MISMA OBRA), YA NO SE PONE.
    // SI ES DE OTRA OBRA, EL TEXTO ES DISTINTO Y SÍ SE PONE.
    const listo = String(params.autoOpenMensaje || '');
    let mensajePendiente = listo && mensajeAplicadoRef.current !== listo && chat.usuarios_ids?.includes(String(params.autoOpenId)) ? listo : '';
    if (mensajePendiente) mensajeAplicadoRef.current = listo;
    if (chat.ultimo_emisor_id !== miPerfil.id && chat.leido === false) {
      await updateDoc(doc(db, 'Chats', chat.id), { leido: true });
    }
    const qMensajes = query(collection(db, 'Chats', chat.id, 'Mensajes'));
    escuchaMensajesRef.current = onSnapshot(qMensajes, (snapshot) => {
      const listaMensajes: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      listaMensajes.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
      setMensajes(listaMensajes);
      if (mensajePendiente) {
        if (!listaMensajes.some(m => m.emisor_id === miPerfil.id && m.texto === mensajePendiente)) setNuevoMensaje(texto => texto || mensajePendiente);
        mensajePendiente = '';
      }
      setTimeout(() => { if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true }); }, 200);
    }, () => {});
  };

  const seleccionarImagen = async () => {
    setModalAdjuntos(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      setArchivoSeleccionado({ uri: `data:image/jpeg;base64,${result.assets[0].base64}`, nombre: 'Imagen adjunta', tipo: 'imagen' });
    }
  };

  const seleccionarDocumento = async (tipo: 'archivo' | 'audio') => {
    setModalAdjuntos(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: tipo === 'audio' ? 'audio/*' : '*/*',
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        setArchivoSeleccionado({ uri: doc.uri, nombre: doc.name, tipo: tipo });
      }
    } catch (error) { console.log("Error al seleccionar documento", error); }
  };

  const enviarMensaje = async () => {
    if (!nuevoMensaje.trim() && !archivoSeleccionado) return;
    if (!chatActivo || !miPerfil) return;

    setProcesando(true);
    const textoMensaje = nuevoMensaje;
    const archivoEnviar = archivoSeleccionado;
    
    setNuevoMensaje('');
    setArchivoSeleccionado(null);

    const timestampActual = new Date().getTime();
    const horaLegible = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    try {
      let urlArchivo = null;
      if (archivoEnviar) {
        if (archivoEnviar.tipo === 'imagen' && archivoEnviar.uri.startsWith('data:image')) {
          urlArchivo = await subirFotoACloudinary(archivoEnviar.uri);
        } else {
          urlArchivo = (await subirACloudinary({ uri: archivoEnviar.uri, name: archivoEnviar.nombre, type: 'application/octet-stream' }, 'publica', 'auto')).url;
        }
      }

      await addDoc(collection(db, 'Chats', chatActivo.id, 'Mensajes'), {
        emisor_id: miPerfil.id,
        texto: textoMensaje,
        archivo_url: urlArchivo,
        archivo_nombre: archivoEnviar?.nombre || null,
        archivo_tipo: archivoEnviar?.tipo || null,
        hora: horaLegible,
        timestamp: timestampActual
      });

      let textoPortada = textoMensaje;
      if (!textoMensaje.trim() && urlArchivo) {
        textoPortada = archivoEnviar?.tipo === 'imagen' ? '📸 Imagen enviada' : archivoEnviar?.tipo === 'audio' ? '🎤 Audio enviado' : '📄 Archivo enviado';
      }

      await updateDoc(doc(db, 'Chats', chatActivo.id), {
        ultimo_mensaje: textoPortada,
        ultimo_emisor_id: miPerfil.id,
        leido: false, 
        timestamp: timestampActual
      });

    } catch (error: any) {
      // SE MUESTRA EL MOTIVO REAL (POR EJEMPLO, UN ARCHIVO DEMASIADO GRANDE), NO SOLO "PROBLEMAS DE CONEXIÓN"
      console.log("Error enviando mensaje:", error);
      Alert.alert("No se pudo enviar", error?.message || "Revisa tu conexión e intenta de nuevo.");
    }
    setProcesando(false);
  };

  const abrirModalReporteChat = () => {
    setModalOpciones(false);
    setReporteMotivo('Spam / Fraude');
    setReporteDesc('');
    setModalReporte(true);
  };

  const enviarReporteChat = async () => {
    if (!reporteDesc) { Alert.alert("Aviso", "Por favor describe brevemente el problema."); return; }
    setProcesando(true);
    try {
      const otroUsuarioId = chatActivo.usuarios_ids?.find((id: string) => id !== miPerfil.id);
      const otroUsuarioData = otroUsuarioId ? chatActivo.datos_usuarios?.[otroUsuarioId] : { nombre: 'Usuario Desconocido' };
      
      const urls = await subirFotos(fotosReporte);
      await addDoc(collection(db, "Quejas_Soporte"), {
        id_reportante: miPerfil.id, nombre_reportante: `${miPerfil.nombre} ${miPerfil.apellidos}`, rol_reportante: miPerfil.rol,
        id_acusado: otroUsuarioId || 'Desconocido', acusado: otroUsuarioData.nombre, rol_acusado: otroUsuarioData.rol === 'Contratista' ? 'Contratista' : 'Trabajador',
        motivo: reporteMotivo, descripcion: reporteDesc, foto_evidencia: urls[0] || '', fotos_evidencia: urls,
        chat_origen_id: chatActivo.id, fecha_reporte: new Date().toISOString(), estado: "En Revisión"
      });
      setFotosReporte([]);
      
      Alert.alert("Reporte Enviado", "El administrador revisará el caso inmediatamente.");
      setModalReporte(false);
    } catch (error) { Alert.alert("Error", "No se pudo enviar el reporte."); }
    setProcesando(false);
  };

  const bloquearUsuario = () => {
    setModalOpciones(false);
    Alert.alert(
      "Bloquear Usuario", 
      "El chat se cerrará permanentemente. Ninguno de los dos podrá enviar o recibir mensajes. ¿Continuar?", 
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, Bloquear", style: "destructive", onPress: async () => {
            setProcesando(true);
            try {
              const otroUsuarioId = chatActivo.usuarios_ids?.find((id: string) => id !== miPerfil.id);
              
              await updateDoc(doc(db, 'Chats', chatActivo.id), {
                bloqueado: true,
                bloqueado_por: miPerfil.id
              });

              if (otroUsuarioId) {
                await updateDoc(doc(db, miPerfil.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas', miPerfil.id), {
                  bloqueados: arrayUnion(otroUsuarioId)
                });
              }

              Alert.alert("Bloqueado", "Este usuario ya no podrá contactarte.");
            } catch (error) { Alert.alert("Error", "No se pudo bloquear al usuario."); }
            setProcesando(false);
          }
        }
      ]
    );
  };

  const abrirBuscadorNuevoChat = async () => {
    setModalNuevoChat(true); setBusquedaUsuario(''); setProcesando(true);
    try {
      const snapCont = await getDocs(collection(db, 'Contratistas'));
      const snapTrab = await getDocs(collection(db, 'Usuarios'));
      const todos = [...snapCont.docs.map(d => ({id: d.id, rol: 'Contratista', ...d.data()})), ...snapTrab.docs.map(d => ({id: d.id, rol: 'Trabajador', ...d.data()}))];
      
      const bloqueados = miPerfil.bloqueados || [];
      const bloqueadosArray = Array.isArray(bloqueados) ? bloqueados : [];
      
      setListaUsuariosSistema(todos.filter(u => u.id !== miPerfil.id && !bloqueadosArray.includes(u.id)));
    } catch (error) { console.log("Error", error); }
    setProcesando(false);
  };

  const iniciarChatConUsuario = async (otroUsuario: any) => {
    setProcesando(true);
    try {
      const chatExistente = chats.find(c => c.usuarios_ids && Array.isArray(c.usuarios_ids) && c.usuarios_ids.includes(otroUsuario.id));
      
      if (chatExistente) { setModalNuevoChat(false); abrirChat(chatExistente); } 
      else {
        const nuevoChatObj = {
          usuarios_ids: [miPerfil.id, otroUsuario.id],
          datos_usuarios: {
            [miPerfil.id]: { nombre: `${miPerfil.nombre} ${miPerfil.apellidos}`, foto: miPerfil.foto_rostro_url || 'https://via.placeholder.com/150', rol: miPerfil.rol },
            [otroUsuario.id]: { nombre: `${otroUsuario.nombre} ${otroUsuario.apellidos}`, foto: otroUsuario.foto_rostro_url || 'https://via.placeholder.com/150', rol: otroUsuario.rol }
          },
          ultimo_mensaje: 'Conversación iniciada', leido: true, bloqueado: false, timestamp: new Date().getTime()
        };
        const docRef = await addDoc(collection(db, 'Chats'), nuevoChatObj);
        setModalNuevoChat(false); abrirChat({ id: docRef.id, ...nuevoChatObj });
      }
    } catch (error) { Alert.alert("Error", "No se pudo iniciar la conversación."); }
    setProcesando(false);
  };

  if (cargando) {
    return (
      <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#00D06C" /><Text style={styles.loadingText}>Conectando a tus mensajes...</Text></View>
    );
  }

  // =========================================================================
  // VISTA 1: CHAT ABIERTO 
  // =========================================================================
  if (chatActivo) {
    const datosChatEnTiempoReal = chats.find(c => c.id === chatActivo.id) || chatActivo;
    const estaBloqueado = datosChatEnTiempoReal.bloqueado === true;
    
    // BLINDAJE PARA EVITAR CRASH SI EL CHAT ESTÁ ROTO EN FIREBASE
    const otroUsuarioId = datosChatEnTiempoReal.usuarios_ids?.find((id: string) => id !== miPerfil.id);
    const otroUsuarioData = datosDe(datosChatEnTiempoReal, otroUsuarioId);

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* 'padding' TAMBIÉN EN ANDROID: CON LA PANTALLA "DE ORILLA A ORILLA", ANDROID YA NO SE ENCOGE SOLO AL ABRIR EL TECLADO */}
        <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
          
          <View style={styles.chatHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={() => { escuchaMensajesRef.current?.(); escuchaMensajesRef.current = null; setChatActivo(null); setTratos([]); router.setParams({ autoOpenId: '', autoOpenNombre: '', autoOpenMensaje: '' }); }}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Image source={{uri: otroUsuarioData.foto || undefined}} style={styles.chatAvatar} />
            <View style={{flex: 1}}>
              <Text style={styles.chatName} numberOfLines={1}>{otroUsuarioData.nombre}</Text>
              <Text style={styles.chatRole}>{otroUsuarioData.rol}</Text>
            </View>
            <TouchableOpacity onPress={() => setModalOpciones(true)}>
              <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {tratos.length === 0 ? (
            <View style={styles.privacyBanner}>
              <Ionicons name="shield-checkmark" size={16} color="#B45309" style={{marginRight: 8}} />
              <Text style={styles.privacyText}>Por tu seguridad, mantén el respeto. La plataforma sancionará fraudes o vocabulario inapropiado.</Text>
            </View>
          ) : tratos.map(trato => {
            // EL TRATO LO ACEPTAN LOS DOS AQUÍ (CADA UNO CON SU BOTÓN), Y SOLO CUANDO LOS DOS YA ESCRIBIERON EN ESTE CHAT.
            // LA OBRA EMPIEZA HASTA QUE ACEPTÓ EL ÚLTIMO.
            const aceptados: string[] = trato.aceptado_por || [];
            const yoAcepte = aceptados.includes(miPerfil.id);
            const elAcepto = !!otroUsuarioId && aceptados.includes(otroUsuarioId);
            const meToca = !yoAcepte;
            const yaPlaticaron = mensajes.some(m => m.emisor_id === miPerfil.id) && mensajes.some(m => m.emisor_id === otroUsuarioId);
            return (
              <View key={trato.id} style={styles.tratoBanner}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Ionicons name="briefcase" size={18} color="#1D4ED8" />
                  <Text style={styles.tratoTitulo} numberOfLines={1}>{trato.estado === ESTADOS.PROPUESTA ? 'Propuesta' : 'Solicitud'}: {trato.titulo_vacante}</Text>
                </View>
                {trato.vacante?.pago ? <Text style={styles.tratoDato}>{trato.vacante.pago}{trato.vacante.ubicacion ? ` • ${trato.vacante.ubicacion}` : ''}</Text> : null}
                <View style={{flexDirection: 'row', marginTop: 6}}>
                  <Text style={[styles.tratoEstado, yoAcepte && styles.tratoEstadoSi]}>{yoAcepte ? '✅ Tú aceptaste' : '⏳ Tú: falta aceptar'}</Text>
                  <Text style={[styles.tratoEstado, elAcepto && styles.tratoEstadoSi]} numberOfLines={1}>{elAcepto ? `✅ ${otroUsuarioData.nombre?.split(' ')[0]} aceptó` : `⏳ ${otroUsuarioData.nombre?.split(' ')[0]}: falta`}</Text>
                </View>
                {meToca ? (
                  <>
                    <Text style={styles.tratoAyuda}>{yaPlaticaron ? 'Si ya se pusieron de acuerdo en todo, acepta el trato. La obra empieza cuando los dos acepten.' : 'Primero platiquen los detalles aquí (los dos deben escribir). Después podrán aceptar el trato.'}</Text>
                    <View style={{flexDirection: 'row', marginTop: 8}}>
                      <TouchableOpacity style={[styles.tratoBoton, {backgroundColor: yaPlaticaron ? '#00D06C' : '#D1D5DB', flex: 2}]} disabled={!yaPlaticaron || procesando} onPress={() => responderTrato(trato, 'aceptar')}>
                        <Ionicons name="checkmark-circle" size={16} color="#FFF" /><Text style={styles.tratoBotonTexto}>Aceptar trato</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.tratoBoton, {backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DC2626', flex: 1, marginLeft: 8}]} disabled={procesando} onPress={() => responderTrato(trato, 'rechazar')}>
                        <Text style={[styles.tratoBotonTexto, {color: '#DC2626'}]}>Rechazar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <Text style={styles.tratoAyuda}>Ya aceptaste. Falta que {otroUsuarioData.nombre} acepte desde este chat; entonces empieza la obra.</Text>
                )}
              </View>
            );
          })}

          <FlatList
            ref={flatListRef}
            data={mensajes}
            keyExtractor={(item, index) => item.id || index.toString()}
            contentContainerStyle={styles.messagesContainer}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
            renderItem={({ item }) => {
              const esMio = item.emisor_id === miPerfil.id;
              return (
                <View style={[styles.messageBubbleWrapper, esMio ? styles.messageMineWrapper : styles.messageTheirsWrapper]}>
                  <View style={[styles.messageBubble, esMio ? styles.messageMine : styles.messageTheirs]}>
                    
                    {/* ADJUNTOS */}
                    {item.archivo_tipo === 'imagen' && <Image source={{uri: item.archivo_url}} style={styles.messageImage} />}
                    {item.archivo_tipo === 'archivo' && (
                      <View style={styles.fileMessageBox}>
                        <Ionicons name="document-text" size={24} color={esMio ? "#FFF" : "#0D2340"} />
                        <Text style={[styles.fileMessageText, esMio ? {color: '#FFF'} : {color: '#0D2340'}]} numberOfLines={1}>{item.archivo_nombre}</Text>
                      </View>
                    )}
                    {item.archivo_tipo === 'audio' && (
                      <View style={styles.fileMessageBox}>
                        <Ionicons name="mic" size={24} color={esMio ? "#FFF" : "#0D2340"} />
                        <Text style={[styles.fileMessageText, esMio ? {color: '#FFF'} : {color: '#0D2340'}]}>Nota de voz enviada</Text>
                      </View>
                    )}

                    {/* TEXTO NORMAL */}
                    {item.texto ? <Text style={[styles.messageText, esMio ? styles.messageTextMine : styles.messageTextTheirs]}>{item.texto}</Text> : null}
                    
                    <Text style={[styles.messageTime, esMio ? styles.messageTimeMine : styles.messageTimeTheirs]}>{item.hora}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyMessagesBox}>
                <Ionicons name="hand-right-outline" size={40} color="#9CA3AF" />
                <Text style={styles.emptyMessagesText}>¡Saluda a {otroUsuarioData.nombre}!</Text>
                <Text style={styles.emptyMessagesSub}>Comiencen a negociar su próximo proyecto.</Text>
              </View>
            }
          />

          {/* PREVISUALIZADOR DE ADJUNTOS ANTES DE ENVIAR */}
          {archivoSeleccionado && !estaBloqueado && (
            <View style={styles.previewBox}>
              {archivoSeleccionado.tipo === 'imagen' ? (
                <Image source={{uri: archivoSeleccionado.uri}} style={styles.previewImage} />
              ) : (
                <View style={styles.previewFile}>
                  <Ionicons name={archivoSeleccionado.tipo === 'audio' ? "mic" : "document"} size={30} color="#0D2340" />
                  <Text style={styles.previewFileText} numberOfLines={1}>{archivoSeleccionado.nombre}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removePreviewBtn} onPress={() => setArchivoSeleccionado(null)}>
                <Ionicons name="close-circle" size={28} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )}

          {/* ÁREA DE INPUT O BLOQUEO */}
          {estaBloqueado ? (
            <View style={[styles.blockedBannerContainer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : insets.bottom + 20 }]}>
              <Ionicons name="lock-closed" size={24} color="#DC2626" />
              <Text style={styles.blockedBannerText}>Este chat ha sido bloqueado por seguridad. Ya no pueden enviarse mensajes.</Text>
            </View>
          ) : (
            <>
            {/* RESPUESTAS RÁPIDAS: SE ABREN CON EL BOTÓN ⚡ Y SE ACOMODAN EN VARIAS LÍNEAS (YA NO SE CORTAN).
                AL TOCAR UNA SE ESCRIBE EN LA CAJA Y SE PUEDE CAMBIAR ANTES DE ENVIAR */}
            {rapidasAbiertas && !archivoSeleccionado && (
              <View style={styles.rapidasCaja}>
                {(RESPUESTAS_RAPIDAS[miPerfil.rol] || RESPUESTAS_RAPIDAS.Trabajador).map(r => (
                  <TouchableOpacity key={r} style={styles.rapida} onPress={() => { setNuevoMensaje(r); setRapidasAbiertas(false); }}><Text style={styles.rapidaTexto}>{r}</Text></TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[styles.inputContainer, { paddingBottom: tecladoVisible ? 10 : Math.max(insets.bottom, 0) + 10 }]}>
              <TouchableOpacity style={styles.attachBtn} onPress={() => setModalAdjuntos(true)}>
                <Ionicons name="add-circle" size={28} color="#0D2340" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachBtn} onPress={() => setRapidasAbiertas(!rapidasAbiertas)}>
                <Ionicons name={rapidasAbiertas ? 'flash' : 'flash-outline'} size={26} color="#F59E0B" />
              </TouchableOpacity>
              
              <TextInput style={styles.textInput} placeholder="Escribe un mensaje..." value={nuevoMensaje} onChangeText={setNuevoMensaje} multiline />

              <TouchableOpacity style={[styles.sendBtn, (!nuevoMensaje.trim() && !archivoSeleccionado) && {backgroundColor: '#D1D5DB'}]} onPress={enviarMensaje} disabled={(!nuevoMensaje.trim() && !archivoSeleccionado) || procesando}>
                {procesando ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" style={{marginLeft: 3}} />}
              </TouchableOpacity>
            </View>
            </>
          )}

        </KeyboardAvoidingView>

        <Modal visible={modalOpciones} transparent animationType="fade">
          <TouchableOpacity style={styles.modalBgDark} activeOpacity={1} onPress={() => setModalOpciones(false)}>
            <View style={styles.bottomSheet}>
              <Text style={styles.sheetTitle}>Opciones del Chat</Text>
              <TouchableOpacity style={styles.sheetOption} onPress={abrirModalReporteChat}>
                <Ionicons name="warning-outline" size={24} color="#F59E0B" style={{marginRight: 15}}/>
                <Text style={styles.sheetOptionText}>Reportar Usuario</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetOption, {borderBottomWidth: 0}]} onPress={bloquearUsuario}>
                <Ionicons name="ban-outline" size={24} color="#DC2626" style={{marginRight: 15}}/>
                <Text style={[styles.sheetOptionText, {color: '#DC2626'}]}>Bloquear Usuario</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal visible={modalReporte} animationType="slide" transparent>
          <View style={styles.modalBgDarkCenter}>
            <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}>
                <Ionicons name="warning" size={24} color="#F59E0B" style={{marginRight: 10}}/>
                <Text style={[styles.modalTitle, {marginBottom: 0}]}>Reportar Comportamiento</Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalLabel}>Selecciona el Motivo</Text>
                <View style={styles.pickerBox}>
                  <Picker selectedValue={reporteMotivo} onValueChange={(itemValue) => setReporteMotivo(itemValue)}>
                    <Picker.Item label="Spam / Fraude" value="Spam / Fraude" />
                    <Picker.Item label="Acoso o Insultos" value="Acoso o Insultos" />
                    <Picker.Item label="Servicio no pagado / incumplido" value="Servicio no pagado / incumplido" />
                    <Picker.Item label="Contenido Inapropiado" value="Contenido Inapropiado" />
                    <Picker.Item label="Otro" value="Otro" />
                  </Picker>
                </View>
                <Text style={styles.modalLabel}>Describe la situación (Para el Administrador)</Text>
                <TextInput style={[styles.modalInput, {height: 100, textAlignVertical: 'top'}]} placeholder="El usuario me insultó cuando le pedí..." multiline value={reporteDesc} onChangeText={setReporteDesc} />
                <SelectorFotos fotos={fotosReporte} onCambio={setFotosReporte} texto="Fotos o capturas de evidencia (opcional)" />
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalReporte(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#F59E0B'}]} onPress={enviarReporteChat} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Enviar Reporte</Text>}</TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={modalAdjuntos} transparent animationType="fade">
          <TouchableOpacity style={styles.modalBgDark} activeOpacity={1} onPress={() => setModalAdjuntos(false)}>
            <View style={styles.attachmentSheet}>
              <View style={styles.attachRow}>
                <TouchableOpacity style={styles.attachItem} onPress={seleccionarImagen}>
                  <View style={[styles.attachIconBg, {backgroundColor: '#3B82F6'}]}><Ionicons name="image" size={28} color="#FFF" /></View>
                  <Text style={styles.attachLabel}>Fotos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachItem} onPress={() => seleccionarDocumento('archivo')}>
                  <View style={[styles.attachIconBg, {backgroundColor: '#8B5CF6'}]}><Ionicons name="document-text" size={28} color="#FFF" /></View>
                  <Text style={styles.attachLabel}>Documento</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachItem} onPress={() => seleccionarDocumento('audio')}>
                  <View style={[styles.attachIconBg, {backgroundColor: '#F97316'}]}><Ionicons name="mic" size={28} color="#FFF" /></View>
                  <Text style={styles.attachLabel}>Audio</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView>
    );
  }

  // =========================================================================
  // VISTA 2: BANDEJA DE ENTRADA (INBOX - LISTA DE CHATS)
  // =========================================================================
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      <View style={styles.inboxHeader}>
        <Text style={styles.inboxTitle}>Bandeja de Entrada</Text>
        <Text style={styles.inboxSubtitle}>Conecta con talento o consigue trabajo</Text>
      </View>

      {/* LA LISTA Y EL BOTÓN FLOTANTE VIVEN EN ESTA ZONA, QUE TERMINA DONDE EMPIEZA LA BARRA DE ABAJO:
          ASÍ EL BOTÓN SIEMPRE QUEDA ARRIBA DE LA BARRA Y NUNCA TAPADO POR ELLA, EN CUALQUIER TAMAÑO DE PANTALLA */}
      <View style={{flex: 1}}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding: 20, paddingBottom: 100}}>
        {chats.length > 0 ? (
          chats.map((chat, index) => {
            // BLINDAJE: Si el chat no tiene el formato correcto, lo ignoramos para no tronar la app
            if (!chat.usuarios_ids || !Array.isArray(chat.usuarios_ids) || !chat.datos_usuarios) return null;

            const otroUsuarioId = chat.usuarios_ids.find((id: string) => id !== miPerfil?.id);
            if (!otroUsuarioId) return null;

            if (!chat.datos_usuarios[otroUsuarioId]) return null;
            const otroUsuarioData = datosDe(chat, otroUsuarioId);

            const esUltimoMio = chat.ultimo_emisor_id === miPerfil.id;
            const noLeido = !esUltimoMio && chat.leido === false;

            return (
              <TouchableOpacity key={index} style={[styles.chatListItem, noLeido && styles.chatListItemUnread, chat.bloqueado && {opacity: 0.5}]} activeOpacity={0.7} onPress={() => abrirChat(chat)}>
                <Image source={{uri: otroUsuarioData.foto || undefined}} style={styles.chatListAvatar} />
                <View style={{flex: 1}}>
                  <View style={styles.chatListTopRow}>
                    <Text style={[styles.chatListName, noLeido && {fontWeight: '900', color: '#000'}]} numberOfLines={1}>{otroUsuarioData.nombre}</Text>
                    <Text style={[styles.chatListDate, noLeido && {color: '#00D06C'}]}>
                      {new Date(chat.timestamp).toLocaleDateString() === new Date().toLocaleDateString() ? new Date(chat.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : new Date(chat.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.chatListRole}>{otroUsuarioData.rol}</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={[styles.chatListLastMsg, noLeido && {color: '#1F2937', fontWeight: 'bold'}]} numberOfLines={1}>
                      {chat.bloqueado && <Ionicons name="lock-closed" size={12} color="#DC2626" /> }
                      <Text style={{fontWeight: esUltimoMio ? 'bold' : 'normal', color: '#6B7280'}}>{esUltimoMio ? ' Tú: ' : ' '}</Text>
                      {chat.ultimo_mensaje}
                    </Text>
                    {noLeido && <View style={styles.unreadDot} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyInbox}>
            <Ionicons name="chatbubble-ellipses-outline" size={60} color="#D1D5DB" />
            <Text style={styles.emptyInboxTitle}>No tienes mensajes aún</Text>
            <Text style={styles.emptyInboxText}>Toca el botón flotante verde para buscar a un usuario e iniciar un chat.</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={abrirBuscadorNuevoChat}>
        <Ionicons name="chatbubbles" size={24} color="#FFF" />
      </TouchableOpacity>
      </View>

      {/* --- MENÚ INFERIOR CON ORDEN CORRECTO Y PARÁMETROS --- */}
      <View style={styles.bottomNavigation}>
        {miPerfil?.rol === 'Contratista' ? (
          <>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-contratista', params: { tab: 'Explorar' } } as any)}><Ionicons name="search-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Explorar</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-contratista', params: { tab: 'Vacantes' } } as any)}><Ionicons name="megaphone-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Anuncios</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-contratista', params: { tab: 'Obras' } } as any)}><Ionicons name="construct-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Obras</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-contratista', params: { tab: 'Candidatos' } } as any)}><Ionicons name="people-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Solicitud</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem}><Ionicons name="chatbubbles" size={26} color="#00D06C" /><Text style={[styles.navText, {color: '#00D06C', fontWeight: 'bold'}]}>Mensajes</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-contratista', params: { tab: 'Perfil' } } as any)}><Ionicons name="person-circle-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Perfil</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/feed' as any)}><Ionicons name="briefcase-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Trabajo</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-trabajador', params: { tab: 'Mis Trabajos' } } as any)}><Ionicons name="construct-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Obras</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem}><Ionicons name="chatbubbles" size={26} color="#00D06C" /><Text style={[styles.navText, {color: '#00D06C', fontWeight: 'bold'}]}>Mensajes</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/dashboard-trabajador', params: { tab: 'Portafolio' } } as any)}><Ionicons name="person-outline" size={26} color="#6B7280" /><Text style={styles.navText}>Perfil</Text></TouchableOpacity>
          </>
        )}
      </View>

      <Modal visible={modalNuevoChat} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          <SafeAreaView style={{flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, overflow: 'hidden', marginTop: 50}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}><Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 17}}>Nuevo Mensaje</Text><TouchableOpacity onPress={() => setModalNuevoChat(false)}><Ionicons name="close" size={28} color="#FFF"/></TouchableOpacity></View>
            <View style={{padding: 20, flex: 1}}>
              <View style={styles.searchContainerInteligente}>
                <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput style={styles.searchInput} placeholder="Busca el nombre de un usuario..." value={busquedaUsuario} onChangeText={setBusquedaUsuario} autoFocus />
              </View>
              {procesando ? ( <ActivityIndicator size="large" color="#00D06C" style={{marginTop: 50}} /> ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{marginTop: 15}}>
                  {busquedaUsuario.length > 0 ? (
                    listaUsuariosSistema
                      .filter(u => `${u.nombre || ''} ${u.apellidos || ''}`.toLowerCase().includes(busquedaUsuario.toLowerCase()))
                      .map((u, i) => (
                        <TouchableOpacity key={i} style={styles.searchResultItem} onPress={() => iniciarChatConUsuario(u)}>
                          <Image source={{uri: u.foto_rostro_url || 'https://via.placeholder.com/150'}} style={styles.searchResultAvatar}/>
                          <View><Text style={styles.searchResultName}>{u.nombre} {u.apellidos}</Text><Text style={styles.searchResultRole}>{u.rol} • {u.ubicacion_texto?.split(',')[0] || 'México'}</Text></View>
                        </TouchableOpacity>
                    ))
                  ) : ( <Text style={{textAlign: 'center', color: '#9CA3AF', marginTop: 40}}>Escribe un nombre para buscar a un Trabajador o Contratista en la plataforma.</Text> )}
                </ScrollView>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#0D2340', fontWeight: 'bold' },
  inboxHeader: { backgroundColor: '#0D2340', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 25, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  inboxTitle: { fontSize: 26, fontWeight: 'bold', color: '#FFF' },
  inboxSubtitle: { fontSize: 15, color: '#9CA3AF', marginTop: 2 },
  chatListItem: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, borderWidth: 1, borderColor: '#F9FAFB' },
  chatListItemUnread: { backgroundColor: '#F0FDF4', borderColor: '#BBEFD3' },
  chatListAvatar: { width: 56, height: 56, borderRadius: 28, marginRight: 15, backgroundColor: '#E5E7EB', borderWidth: 1, borderColor: '#E5E7EB' },
  chatListTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  chatListName: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', flex: 1, marginRight: 10 },
  chatListDate: { fontSize: 13, color: '#9CA3AF', fontWeight: 'bold' },
  chatListRole: { fontSize: 13, color: '#00D06C', fontWeight: 'bold', marginBottom: 4 },
  chatListLastMsg: { fontSize: 16, color: '#4B5563', flex: 1 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00D06C', marginLeft: 10 },
  emptyInbox: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyInboxTitle: { fontSize: 19, fontWeight: 'bold', color: '#0D2340', marginTop: 15, marginBottom: 5 },
  emptyInboxText: { fontSize: 16, color: '#6B7280', textAlign: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#00D06C', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', paddingHorizontal: 15, paddingVertical: 15, borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  backBtn: { padding: 5, marginRight: 10 },
  chatAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#E5E7EB', borderWidth: 1, borderColor: '#FFF' },
  chatName: { fontSize: 17, fontWeight: 'bold', color: '#FFF' },
  chatRole: { fontSize: 13, color: '#00D06C', fontWeight: 'bold' },
  privacyBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#FDE68A' },
  privacyText: { flex: 1, fontSize: 13, color: '#B45309', fontWeight: 'bold' },
  tratoBanner: { backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderColor: '#BFDBFE', padding: 12 },
  tratoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#1E3A8A', marginLeft: 6, flex: 1 },
  tratoDato: { fontSize: 14, color: '#00A355', fontWeight: 'bold', marginTop: 2 },
  tratoAyuda: { fontSize: 14, color: '#1E40AF', marginTop: 4 },
  tratoEstado: { flex: 1, fontSize: 13, fontWeight: 'bold', color: '#B45309', backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginRight: 6, overflow: 'hidden' },
  tratoEstadoSi: { color: '#047857', backgroundColor: '#D1FAE5' },
  tratoBoton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 9 },
  tratoBotonTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 4 },
  rapidasCaja: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#F3F4F6', paddingHorizontal: 10, paddingTop: 8 },
  rapida: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  rapidaTexto: { fontSize: 14, color: '#1D4ED8', fontWeight: '600' },
  messagesContainer: { padding: 15, flexGrow: 1, justifyContent: 'flex-end' },
  messageBubbleWrapper: { marginBottom: 12, flexDirection: 'row' },
  messageMineWrapper: { justifyContent: 'flex-end' },
  messageTheirsWrapper: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 18, overflow: 'hidden' },
  messageMine: { backgroundColor: '#00D06C', borderBottomRightRadius: 4 },
  messageTheirs: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  messageText: { fontSize: 17, lineHeight: 20 },
  messageTextMine: { color: '#FFF' },
  messageTextTheirs: { color: '#1F2937' },
  messageTime: { fontSize: 13, marginTop: 5, alignSelf: 'flex-end' },
  messageTimeMine: { color: 'rgba(255,255,255,0.8)' },
  messageTimeTheirs: { color: '#9CA3AF' },
  messageImage: { width: 220, height: 220, borderRadius: 12, marginBottom: 8, backgroundColor: '#E5E7EB', alignSelf: 'center' },
  fileMessageBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)' },
  fileMessageText: { fontSize: 15, fontWeight: 'bold', marginLeft: 8, flexShrink: 1 },
  emptyMessagesBox: { alignItems: 'center', marginVertical: 40 },
  emptyMessagesText: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginTop: 10 },
  emptyMessagesSub: { fontSize: 15, color: '#6B7280' },
  blockedBannerContainer: { backgroundColor: '#FEE2E2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderTopWidth: 1, borderColor: '#FCA5A5' },
  blockedBannerText: { color: '#DC2626', fontWeight: 'bold', fontSize: 14, marginLeft: 10, flexShrink: 1, textAlign: 'center' },
  previewBox: { flexDirection: 'row', padding: 15, backgroundColor: '#F3F4F6', borderTopWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  previewImage: { width: 60, height: 60, borderRadius: 10 },
  previewFile: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 12, flex: 1, borderWidth: 1, borderColor: '#E5E7EB' },
  previewFileText: { marginLeft: 10, fontSize: 16, fontWeight: 'bold', color: '#0D2340', flex: 1 },
  removePreviewBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 14 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 15, paddingTop: 10, borderTopWidth: 1, borderColor: '#E5E7EB' },
  attachBtn: { marginRight: 10, padding: 5 },
  textInput: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, fontSize: 17, color: '#1F2937', maxHeight: 100, borderWidth: 1, borderColor: '#E5E7EB' },
  sendBtn: { backgroundColor: '#00D06C', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  bottomNavigation: { backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderColor: '#E5E7EB', elevation: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, paddingVertical: 12 },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' },
  navText: { fontSize: 13, color: '#6B7280', marginTop: 4, fontWeight: '600' },
  modalBgDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  modalBgDarkCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 21, fontWeight: 'bold', color: '#0D2340', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 16, color: '#1F2937' },
  pickerBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 15, overflow: 'hidden' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  modalBtnCancel: { padding: 12, marginRight: 10 },
  modalBtnTextC: { color: '#6B7280', fontWeight: 'bold', fontSize: 16 },
  modalBtnSave: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  modalBtnTextS: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  bottomSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },
  sheetTitle: { fontSize: 19, fontWeight: 'bold', color: '#0D2340', marginBottom: 15, textAlign: 'center' },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  sheetOptionText: { fontSize: 17, fontWeight: 'bold', color: '#1F2937' },
  attachmentSheet: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#FFF', borderRadius: 20, padding: 20 },
  attachRow: { flexDirection: 'row', justifyContent: 'space-around' },
  attachItem: { alignItems: 'center' },
  attachIconBg: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8, elevation: 3 },
  attachLabel: { fontSize: 15, color: '#4B5563', fontWeight: 'bold' },
  searchContainerInteligente: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 17, color: '#1F2937', paddingVertical: 12 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 1 },
  searchResultAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 15, backgroundColor: '#E5E7EB' },
  searchResultName: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  searchResultRole: { fontSize: 14, color: '#00D06C', fontWeight: 'bold', marginTop: 2 },
});