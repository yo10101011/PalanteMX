import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  LogBox,
  Modal,
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

const { width } = Dimensions.get('window');

export default function AdminDashboard() {
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [pestañaActiva, setPestañaActiva] = useState('Usuarios'); 
  const [subTabUsuarios, setSubTabUsuarios] = useState('Trabajadores');
  const [subTabReportes, setSubTabReportes] = useState('Pendientes');

  // DATOS DEL SISTEMA
  const [adminData, setAdminData] = useState<any>({ nombre: 'Administrador Principal', cargo: 'Super Admin', foto: 'https://via.placeholder.com/150' });
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [contratistas, setContratistas] = useState<any[]>([]);
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [quejas, setQuejas] = useState<any[]>([]);
  const [personalSoporte, setPersonalSoporte] = useState<any[]>([]);

  const [usuarioExpandido, setUsuarioExpandido] = useState<any>(null);
  const [vacanteExpandida, setVacanteExpandida] = useState<any>(null);
  const [fotoEvidencia, setFotoEvidencia] = useState<string | null>(null);

  const [modalEditarAdmin, setModalEditarAdmin] = useState(false);
  const [editAdminNombre, setEditAdminNombre] = useState('');
  const [editAdminCargo, setEditAdminCargo] = useState('');

  const [modalCrear, setModalCrear] = useState(false);
  const [nuevoRol, setNuevoRol] = useState('Soporte Técnico');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCorreo, setNuevoCorreo] = useState('');

  const cargarDatosAdmin = async () => {
    try {
      // MAGIA: Ejecutar todas las lecturas al mismo tiempo en paralelo para que cargue súper rápido
      const adminRef = doc(db, 'Sistema', 'AdminProfile');
      
      const [adminDoc, snapTrabajadores, snapContratistas, snapVacantes, snapQuejas, snapSoporte] = await Promise.all([
        getDoc(adminRef),
        getDocs(collection(db, 'Usuarios')),
        getDocs(collection(db, 'Contratistas')),
        getDocs(collection(db, 'Vacantes')),
        getDocs(collection(db, 'Quejas_Soporte')),
        getDocs(collection(db, 'Equipo_Soporte'))
      ]);

      if (adminDoc.exists()) {
        setAdminData(adminDoc.data());
        setEditAdminNombre(adminDoc.data().nombre || '');
        setEditAdminCargo(adminDoc.data().cargo || 'Super Admin');
      } else {
        await setDoc(adminRef, { nombre: 'Administrador Principal', cargo: 'Super Admin', foto: 'https://via.placeholder.com/150' });
        setEditAdminNombre('Administrador Principal');
        setEditAdminCargo('Super Admin');
      }

      setTrabajadores(snapTrabajadores.docs.map(d => ({ id: d.id, rol: 'Trabajador', ...d.data() })));
      setContratistas(snapContratistas.docs.map(d => ({ id: d.id, rol: 'Contratista', ...d.data() })));

      const listaVacantes: any[] = snapVacantes.docs.map(d => ({ id: d.id, ...d.data() }));
      listaVacantes.sort((a, b) => new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime());
      setVacantes(listaVacantes);

      const listaQuejas = snapQuejas.docs.map(d => ({ id: d.id, ...d.data() }));
      listaQuejas.sort((a: any, b: any) => new Date(b.fecha_reporte).getTime() - new Date(a.fecha_reporte).getTime());
      setQuejas(listaQuejas);

      setPersonalSoporte(snapSoporte.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) { console.log("Error cargando panel admin:", error); } finally { setCargando(false); }
  };

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

  const cerrarSesionAdmin = async () => {
    await signOut(auth);
    router.replace('/' as any);
  };

  const subirFotoACloudinary = async (base64String: string) => {
    const CLOUD_NAME = "ylqsvel1"; const UPLOAD_PRESET = "palante_fotos"; 
    const data = new FormData(); 
    data.append('file', base64String); data.append('upload_preset', UPLOAD_PRESET); data.append('cloud_name', CLOUD_NAME);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: data });
    const result = await response.json(); return result.secure_url; 
  };

  const cambiarFotoAdmin = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      Alert.alert("Actualizar Foto", "¿Deseas cambiar tu foto de administrador?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí", onPress: async () => {
            setProcesando(true);
            const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
            const urlSegura = await subirFotoACloudinary(base64Data);
            await updateDoc(doc(db, 'Sistema', 'AdminProfile'), { foto: urlSegura });
            await cargarDatosAdmin();
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
      const nuevoId = new Date().getTime().toString();
      const nuevoObj = {
        nombre: nuevoNombre.toUpperCase(),
        correo: nuevoCorreo,
        rol_usuario: nuevoRol,
        estado_cuenta: 'Activa',
        fecha_registro: new Date().toISOString(),
        foto_rostro_url: 'https://via.placeholder.com/150',
        permisos: ['monitoreo', 'resolucion_quejas']
      };

      await setDoc(doc(db, 'Equipo_Soporte', nuevoId), nuevoObj);
      Alert.alert("Éxito", `El usuario de ${nuevoRol} ha sido creado y podrá monitorear la plataforma.`);
      
      setModalCrear(false);
      setNuevoNombre(''); setNuevoCorreo('');
      await cargarDatosAdmin();
    } catch (error) { Alert.alert("Error", "No se pudo registrar en la base de datos."); }
    setProcesando(false);
  };

  const alternarBloqueoUsuario = async (id: string, coleccion: string, estadoActual: string) => {
    const nuevoEstado = estadoActual === 'Bloqueada' ? 'Activa' : 'Bloqueada';
    Alert.alert("Modificar Acceso", `¿Estás seguro de que deseas marcar esta cuenta como ${nuevoEstado}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, modificar", style: nuevoEstado === 'Bloqueada' ? 'destructive' : 'default', onPress: async () => {
          setProcesando(true);
          await updateDoc(doc(db, coleccion, id), { estado_cuenta: nuevoEstado });
          await cargarDatosAdmin();
          setProcesando(false);
          if(usuarioExpandido) {
            setUsuarioExpandido({...usuarioExpandido, estado_cuenta: nuevoEstado});
          }
        }
      }
    ]);
  };

  const eliminarDocumento = (id: string, coleccion: string, mensaje: string, esModal: boolean = false) => {
    Alert.alert("ELIMINACIÓN DEFINITIVA", mensaje, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: 'destructive', onPress: async () => {
          setProcesando(true);
          await deleteDoc(doc(db, coleccion, id));
          await cargarDatosAdmin();
          setProcesando(false);
          if (esModal) {
            setUsuarioExpandido(null);
            setVacanteExpandida(null);
          }
        }
      }
    ]);
  };

  const eliminarObraDeUsuario = (idUsuario: string, idObra: string, coleccion: string) => {
    Alert.alert("Borrar Obra del Portafolio", "¿Estás seguro de que deseas eliminar este trabajo del perfil de este usuario?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar Obra", style: "destructive", onPress: async () => {
          setProcesando(true);
          try {
            const userRef = doc(db, coleccion, idUsuario);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
              const portafolioActualizado = (userDoc.data().portafolio || []).filter((o: any) => o && o.id_obra !== idObra);
              await updateDoc(userRef, { portafolio: portafolioActualizado });
              await cargarDatosAdmin();
              setUsuarioExpandido({...usuarioExpandido, portafolio: portafolioActualizado});
            }
          } catch (error) { Alert.alert("Error", "No se pudo borrar."); }
          setProcesando(false);
        }
      }
    ]);
  };

  // TEMPORAL: MUEVE LAS FOTOS DE LA INE DE LOS PERFILES VIEJOS A /Verificaciones (PRIVADA).
  // LO HACE EL WORKER, QUE COMPRUEBA QUE QUIEN LLAMA SEA ADMIN. SE QUITA EN CUANTO SE HAYA USADO.
  const migrarFotosINE = () => {
    Alert.alert("Proteger fotos de INE", "Se moverán las fotos de la INE de los perfiles antiguos a un área privada que solo ve el administrador. ¿Continuar?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, proteger", onPress: async () => {
          setProcesando(true);
          try {
            const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
            const idToken = await auth.currentUser?.getIdToken();
            const response = await fetch(`${KYC_API_URL}/admin/migrar-ine`, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
            const resultado = await response.json();
            if (!response.ok) throw new Error(resultado.error || "El servidor no respondió.");
            Alert.alert("✅ Listo", `Perfiles revisados: ${resultado.revisados}\nPerfiles protegidos: ${resultado.migrados}`);
            await cargarDatosAdmin();
          } catch (error: any) { Alert.alert("Error", error.message); }
          setProcesando(false);
        }
      }
    ]);
  };

  const resolverQueja = async (id: string) => {
    Alert.alert("Atender Reporte", "¿Marcar esta queja como atendida/resuelta? Se guardará en el historial legal.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, Resolver", onPress: async () => {
          setProcesando(true);
          await updateDoc(doc(db, 'Quejas_Soporte', id), { 
            estado: 'Resuelta', 
            fecha_resolucion: new Date().toISOString(),
            atendida_por: adminData.nombre
          });
          await cargarDatosAdmin();
          setProcesando(false);
        }
      }
    ]);
  };

  if (cargando) { return ( <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#D32F2F" /><Text style={styles.loadingText}>Accediendo a la Base de Datos...</Text></View> ); }

  const quejasPendientes = quejas.filter(q => q.estado !== 'Resuelta');
  const quejasResueltas = quejas.filter(q => q.estado === 'Resuelta');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Ionicons name="shield-checkmark" size={28} color="#FFF" style={{marginRight: 10}}/>
          <View>
            <Text style={styles.headerTitle}>Panel de Control</Text>
            <Text style={styles.headerSubtitle}>Centro de Monitoreo</Text>
          </View>
        </View>
        <TouchableOpacity onPress={cerrarSesionAdmin}>
          <Ionicons name="log-out-outline" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        {['Usuarios', 'Feed', 'Auditoría', 'Staff'].map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tabButton, pestañaActiva === tab && styles.tabButtonActive]} onPress={() => setPestañaActiva(tab)}>
            <Text style={[styles.tabText, pestañaActiva === tab && styles.tabTextActive]}>{tab}</Text>
            {tab === 'Auditoría' && quejasPendientes.length > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{quejasPendientes.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        
        {pestañaActiva === 'Usuarios' && (
          <View>
            <View style={styles.subTabsContainer}>
              <TouchableOpacity style={[styles.subTab, subTabUsuarios === 'Trabajadores' && styles.subTabActive]} onPress={() => setSubTabUsuarios('Trabajadores')}>
                <Text style={[styles.subTabText, subTabUsuarios === 'Trabajadores' && styles.subTabTextActive]}>Trabajadores ({trabajadores.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.subTab, subTabUsuarios === 'Contratistas' && styles.subTabActive]} onPress={() => setSubTabUsuarios('Contratistas')}>
                <Text style={[styles.subTabText, subTabUsuarios === 'Contratistas' && styles.subTabTextActive]}>Contratistas ({contratistas.length})</Text>
              </TouchableOpacity>
            </View>

            {subTabUsuarios === 'Trabajadores' && (
              trabajadores.map((user, index) => (
                <TouchableOpacity key={index} style={[styles.adminCard, user.estado_cuenta === 'Bloqueada' && {borderColor: '#FCA5A5', borderWidth: 1}]} activeOpacity={0.8} onPress={() => setUsuarioExpandido(user)}>
                  <View style={styles.userCardHeader}>
                    <Image source={{ uri: user.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.userAvatar} />
                    <View style={{flex: 1}}>
                      <Text style={styles.userName}>{user.nombre} {user.apellidos}</Text>
                      <Text style={styles.userSub}>{user.correo} | {user.numero_telefono}</Text>
                      <Text style={styles.userOficio}>{user.oficio_principal || 'Sin Oficio'} • {user.ubicacion_texto || 'Sin Ubicación'}</Text>
                    </View>
                    {user.estado_cuenta === 'Bloqueada' ? <Ionicons name="lock-closed" size={24} color="#DC2626" /> : <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />}
                  </View>
                </TouchableOpacity>
              ))
            )}

            {subTabUsuarios === 'Contratistas' && (
              contratistas.map((user, index) => (
                <TouchableOpacity key={index} style={[styles.adminCard, user.estado_cuenta === 'Bloqueada' && {borderColor: '#FCA5A5', borderWidth: 1}]} activeOpacity={0.8} onPress={() => setUsuarioExpandido(user)}>
                  <View style={styles.userCardHeader}>
                    <Image source={{ uri: user.foto_rostro_url || 'https://via.placeholder.com/150' }} style={styles.userAvatar} />
                    <View style={{flex: 1}}>
                      <Text style={styles.userName}>{user.nombre} {user.apellidos}</Text>
                      <Text style={styles.userSub}>{user.correo} | {user.numero_telefono}</Text>
                      <Text style={styles.userOficio}>{user.empresa || 'Independiente'} • {user.ubicacion_texto || 'Sin Ubicación'}</Text>
                    </View>
                    {user.estado_cuenta === 'Bloqueada' ? <Ionicons name="lock-closed" size={24} color="#DC2626" /> : <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {pestañaActiva === 'Feed' && (
          <View>
            <Text style={styles.sectionTitle}>Gestión de Obras y Vacantes</Text>
            {vacantes.length > 0 ? (
              vacantes.map((vac, index) => (
                <TouchableOpacity key={index} style={styles.adminCard} activeOpacity={0.8} onPress={() => setVacanteExpandida(vac)}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    <View style={[styles.statusTag, vac.estado === 'Cerrada' ? {backgroundColor: '#F3F4F6'} : {backgroundColor: '#D1FAE5'}]}>
                      <Text style={[styles.statusTagText, vac.estado === 'Cerrada' ? {color: '#6B7280'} : {color: '#059669'}]}>{vac.estado}</Text>
                    </View>
                    <Text style={styles.dateText}>{new Date(vac.fecha_publicacion).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.userName, {marginTop: 10}]}>{vac.titulo}</Text>
                  <Text style={styles.userSub}>Publicado por: {vac.contratista}</Text>
                  <Text style={styles.userOficio} numberOfLines={2}>{vac.descripcion}</Text>
                  <Text style={{color: '#D32F2F', fontSize: 11, marginTop: 10, fontWeight: 'bold'}}>👁️ Toca para revisar detalles y expandir</Text>
                </TouchableOpacity>
              ))
            ) : (
               <Text style={styles.emptyText}>No hay vacantes publicadas en el sistema.</Text>
            )}
          </View>
        )}

        {/* --- AUDITORÍA LEGAL (HISTORIAL DE REPORTES INMUTABLES) --- */}
        {pestañaActiva === 'Auditoría' && (
          <View>
            <Text style={styles.sectionTitle}>Auditoría Legal y Reportes</Text>
            
            <View style={styles.subTabsContainer}>
              <TouchableOpacity style={[styles.subTab, subTabReportes === 'Pendientes' && styles.subTabActive]} onPress={() => setSubTabReportes('Pendientes')}>
                <Text style={[styles.subTabText, subTabReportes === 'Pendientes' && styles.subTabTextActive]}>Requieren Atención ({quejasPendientes.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.subTab, subTabReportes === 'Historial' && styles.subTabActive]} onPress={() => setSubTabReportes('Historial')}>
                <Text style={[styles.subTabText, subTabReportes === 'Historial' && styles.subTabTextActive]}>Historial Legal ({quejasResueltas.length})</Text>
              </TouchableOpacity>
            </View>

            {(subTabReportes === 'Pendientes' ? quejasPendientes : quejasResueltas).length > 0 ? (
              (subTabReportes === 'Pendientes' ? quejasPendientes : quejasResueltas).map((queja, index) => (
                <View key={index} style={[styles.adminCard, queja.estado === 'Resuelta' ? {opacity: 0.8, borderColor: '#D1D5DB', borderWidth: 1} : {borderLeftWidth: 4, borderLeftColor: '#D32F2F'}]}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                    <Text style={styles.dateText}>{new Date(queja.fecha_reporte).toLocaleString('es-MX')}</Text>
                    <Text style={[styles.statusTagText, queja.estado === 'Resuelta' ? {color: '#00D06C'} : {color: '#D32F2F'}]}>{queja.estado}</Text>
                  </View>
                  
                  <Text style={{fontSize: 16, fontWeight: 'bold', color: '#0D2340'}}>{queja.motivo}</Text>
                  <Text style={{fontSize: 12, color: '#6B7280', marginTop: 2}}><Text style={{fontWeight: 'bold'}}>Reporta:</Text> {queja.nombre_reportante} ({queja.rol_reportante || 'Usuario'})</Text>
                  <Text style={{fontSize: 12, color: '#DC2626', marginTop: 2}}><Text style={{fontWeight: 'bold'}}>Acusa a:</Text> {queja.acusado}</Text>
                  
                  <View style={styles.quejaDescBox}>
                    <Text style={{fontSize: 13, color: '#4B5563'}}>{queja.descripcion}</Text>
                  </View>

                  {queja.foto_evidencia && (
                    <TouchableOpacity style={styles.btnVerEvidencia} onPress={() => setFotoEvidencia(queja.foto_evidencia)}>
                      <Ionicons name="image-outline" size={16} color="#0D2340" style={{marginRight: 5}}/>
                      <Text style={{fontSize: 12, fontWeight: 'bold', color: '#0D2340'}}>Ver Evidencia de Fraude/Acoso</Text>
                    </TouchableOpacity>
                  )}

                  {queja.estado !== 'Resuelta' ? (
                    <View style={[styles.actionButtonsRow, {marginTop: 15}]}>
                      <TouchableOpacity style={[styles.btnWarning, {flex: 1, backgroundColor: '#00D06C'}]} onPress={() => resolverQueja(queja.id)}>
                        <Text style={styles.btnTextWhite}>Atender y Archivar al Historial</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{marginTop: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8}}>
                      <Ionicons name="lock-closed" size={16} color="#6B7280" style={{marginRight: 8}}/>
                      <Text style={{fontSize: 11, color: '#6B7280', flex: 1}}>Registro inmutable para fines legales. Atendida por: {queja.atendida_por || 'Admin'}</Text>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="shield-checkmark-outline" size={50} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>{subTabReportes === 'Pendientes' ? 'Cero Problemas' : 'Historial Vacío'}</Text>
                <Text style={styles.emptyText}>{subTabReportes === 'Pendientes' ? 'No hay reportes ni quejas esperando atención.' : 'Aún no se ha archivado ningún reporte.'}</Text>
              </View>
            )}
          </View>
        )}

        {/* --- PESTAÑA STAFF / PERFIL ADMIN --- */}
        {pestañaActiva === 'Staff' && (
          <View style={{alignItems: 'center', marginTop: 10}}>
            <TouchableOpacity style={styles.avatarContainer} onPress={cambiarFotoAdmin}>
              <Image source={{ uri: adminData.foto }} style={styles.avatarBig} />
              <View style={styles.editAvatarBadge}><Ionicons name="camera" size={16} color="#FFF" /></View>
            </TouchableOpacity>
            
            <Text style={{fontSize: 24, fontWeight: 'bold', color: '#0D2340', marginTop: 15}}>{adminData.nombre}</Text>
            <Text style={{fontSize: 14, color: '#D32F2F', fontWeight: 'bold', marginTop: 2}}>{adminData.cargo?.toUpperCase()}</Text>

            <View style={{width: '100%', marginTop: 30}}>
              <Text style={styles.sectionTitle}>Equipo de Monitoreo</Text>
              {personalSoporte.map((staff, i) => (
                <View key={i} style={[styles.adminCard, {flexDirection: 'row', alignItems: 'center'}]}>
                  <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center', marginRight: 15}}>
                    <Ionicons name="headset" size={20} color="#059669" />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={{fontWeight: 'bold', fontSize: 15, color: '#0D2340'}}>{staff.nombre}</Text>
                    <Text style={{fontSize: 12, color: '#6B7280'}}>{staff.rol_usuario} | {staff.correo}</Text>
                  </View>
                </View>
              ))}

              <Text style={[styles.sectionTitle, {marginTop: 20}]}>Opciones Avanzadas</Text>
              <TouchableOpacity style={styles.settingsOption} onPress={() => setModalEditarAdmin(true)}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Ionicons name="pencil-outline" size={24} color="#0D2340" />
                  <Text style={styles.settingsText}>Editar Mi Perfil Administrativo</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsOption} onPress={cargarDatosAdmin}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Ionicons name="refresh-outline" size={24} color="#00D06C" />
                  <Text style={[styles.settingsText, {color: '#00D06C'}]}>Refrescar Base de Datos</Text>
                </View>
              </TouchableOpacity>

              {/* TEMPORAL: SE QUITA EN CUANTO SE HAYA USADO UNA VEZ */}
              <TouchableOpacity style={styles.settingsOption} onPress={migrarFotosINE} disabled={procesando}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Ionicons name="shield-checkmark-outline" size={24} color="#D32F2F" />
                  <Text style={[styles.settingsText, {color: '#D32F2F'}]}>Proteger fotos de INE (una sola vez)</Text>
                </View>
                {procesando && <ActivityIndicator color="#D32F2F" />}
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>

      {/* BOTÓN FLOTANTE PARA CREAR PERSONAL DE MONITOREO DESDE EL DASHBOARD */}
      {pestañaActiva === 'Staff' && (
        <TouchableOpacity style={styles.fab} onPress={() => setModalCrear(true)}>
          <Ionicons name="person-add" size={24} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* --- MODALES DEL ADMIN --- */}

      {/* MODAL CREAR PERSONAL DE MONITOREO/SOPORTE */}
      <Modal visible={modalCrear} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContainer, {maxHeight: '90%'}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}>
              <Ionicons name="headset" size={24} color="#00D06C" style={{marginRight: 10}}/>
              <Text style={[styles.modalTitle, {marginBottom: 0}]}>Crear Cuenta de Monitoreo</Text>
            </View>
            <Text style={{fontSize: 12, color: '#6B7280', marginBottom: 20}}>Estas cuentas tendrán acceso para vigilar el comportamiento y revisar la auditoría legal.</Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>Puesto de Monitoreo</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={nuevoRol} onValueChange={(itemValue) => setNuevoRol(itemValue)}>
                  <Picker.Item label="Soporte Técnico" value="Soporte Técnico" />
                  <Picker.Item label="Auditor Legal" value="Auditor Legal" />
                  <Picker.Item label="Moderador de Quejas" value="Moderador" />
                </Picker>
              </View>

              <Text style={styles.modalLabel}>Nombre del Agente</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Ana Laura" value={nuevoNombre} onChangeText={setNuevoNombre} />
              
              <Text style={styles.modalLabel}>Correo Institucional</Text>
              <TextInput style={styles.modalInput} placeholder="soporte@palantemx.com" value={nuevoCorreo} onChangeText={setNuevoCorreo} keyboardType="email-address" autoCapitalize="none" />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalCrear(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#00D06C'}]} onPress={crearPersonalMonitoreo} disabled={procesando}>{procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Crear Personal</Text>}</TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* VISTA DETALLADA DEL USUARIO/TRABAJADOR */}
      <Modal visible={!!usuarioExpandido} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          {usuarioExpandido && (
            <SafeAreaView style={{flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, overflow: 'hidden'}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15}}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Ionicons name="person-circle" size={28} color="#00D06C" style={{marginRight: 10}}/>
                  <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>Perfil de {usuarioExpandido?.rol}</Text>
                </View>
                <TouchableOpacity onPress={() => setUsuarioExpandido(null)}>
                  <Ionicons name="close-circle" size={28} color="#FFF"/>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{padding: 20}}>
                <View style={{alignItems: 'center', marginBottom: 20}}>
                  <Image source={{ uri: usuarioExpandido?.foto_rostro_url || 'https://via.placeholder.com/150' }} style={{width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#D1D5DB'}} />
                  <Text style={{fontSize: 22, fontWeight: 'bold', color: '#0D2340', marginTop: 10}}>{usuarioExpandido?.nombre} {usuarioExpandido?.apellidos}</Text>
                  <Text style={{fontSize: 14, color: '#6B7280'}}>{usuarioExpandido?.correo} | {usuarioExpandido?.numero_telefono}</Text>
                  <View style={[styles.statusTag, {marginTop: 10}, usuarioExpandido?.estado_cuenta === 'Bloqueada' ? {backgroundColor: '#FEE2E2'} : {backgroundColor: '#D1FAE5'}]}>
                    <Text style={[styles.statusTagText, usuarioExpandido?.estado_cuenta === 'Bloqueada' ? {color: '#DC2626'} : {color: '#059669'}]}>CUENTA {usuarioExpandido?.estado_cuenta?.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={{backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB'}}>
                  <Text style={{fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', marginBottom: 10}}>INFORMACIÓN TÉCNICA</Text>
                  {usuarioExpandido?.rol === 'Trabajador' ? (
                    <>
                      <Text style={{fontSize: 14, color: '#1F2937'}}><Text style={{fontWeight: 'bold'}}>Oficio Principal:</Text> {usuarioExpandido?.oficio_principal}</Text>
                      <Text style={{fontSize: 14, color: '#1F2937', marginTop: 5}}><Text style={{fontWeight: 'bold'}}>Calificación:</Text> {usuarioExpandido?.calificacion || '0'} <Ionicons name="star" color="#F59E0B"/></Text>
                      <Text style={{fontSize: 14, color: '#1F2937', marginTop: 5}}><Text style={{fontWeight: 'bold'}}>Obras en Portafolio:</Text> {usuarioExpandido?.portafolio?.length || 0}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{fontSize: 14, color: '#1F2937'}}><Text style={{fontWeight: 'bold'}}>Empresa:</Text> {usuarioExpandido?.empresa || 'Contratista Independiente'}</Text>
                      <Text style={{fontSize: 14, color: '#1F2937', marginTop: 5}}><Text style={{fontWeight: 'bold'}}>Reputación:</Text> {usuarioExpandido?.calificacion || '0'} <Ionicons name="star" color="#F59E0B"/></Text>
                    </>
                  )}
                  <Text style={{fontSize: 14, color: '#1F2937', marginTop: 5}}><Text style={{fontWeight: 'bold'}}>Ubicación:</Text> {usuarioExpandido?.ubicacion_texto}</Text>
                </View>

                <Text style={styles.sectionTitle}>Reportes en su contra</Text>
                {(() => {
                  // BLINDAJE: indexOf undefined error safe-check
                  const reportesDelUsuario = quejas.filter(q => {
                    const acusadoSeguro = q.acusado || '';
                    const nombreSeguro = usuarioExpandido?.nombre || '';
                    return acusadoSeguro.toLowerCase().includes(nombreSeguro.toLowerCase());
                  });
                  
                  if (reportesDelUsuario.length === 0) {
                    return <Text style={{textAlign: 'center', color: '#6B7280', marginBottom: 20}}>Este usuario no tiene reportes en su contra.</Text>;
                  }
                  return reportesDelUsuario.map((queja, idx) => (
                    <View key={idx} style={[styles.adminCard, queja.estado === 'Resuelta' ? {opacity: 0.7} : {borderLeftWidth: 4, borderLeftColor: '#D32F2F'}]}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5}}>
                        <Text style={styles.dateText}>{new Date(queja.fecha_reporte).toLocaleDateString()}</Text>
                        <Text style={[styles.statusTagText, queja.estado === 'Resuelta' ? {color: '#00D06C'} : {color: '#D32F2F'}]}>{queja.estado}</Text>
                      </View>
                      <Text style={{fontSize: 14, fontWeight: 'bold', color: '#0D2340'}}>{queja.motivo}</Text>
                      <Text style={{fontSize: 12, color: '#6B7280', marginTop: 2}}><Text style={{fontWeight: 'bold'}}>Reportado por:</Text> {queja.nombre_reportante}</Text>
                      <Text style={{fontSize: 13, color: '#4B5563', marginTop: 5, fontStyle: 'italic'}}>{queja.descripcion}</Text>
                    </View>
                  ));
                })()}

                {usuarioExpandido?.rol === 'Trabajador' && (
                  <View>
                    <Text style={styles.sectionTitle}>Historial de Obras</Text>
                    {usuarioExpandido?.portafolio && usuarioExpandido.portafolio.length > 0 ? (
                      usuarioExpandido.portafolio.map((trabajo: any, idx: number) => (
                        <View key={idx} style={[styles.adminCard, {padding: 0, overflow: 'hidden', position: 'relative'}]}>
                          
                          <TouchableOpacity style={{position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(220, 38, 38, 0.9)', padding: 8, borderRadius: 20, zIndex: 10}} onPress={() => eliminarObraDeUsuario(usuarioExpandido.id, trabajo.id_obra, 'Usuarios')} disabled={procesando}>
                            <Ionicons name="trash" size={18} color="#FFF" />
                          </TouchableOpacity>

                          <View style={{flexDirection: 'row', height: 150}}>
                            {trabajo.foto_antes && (
                              <View style={{flex: 1, borderRightWidth: 1, borderColor: '#FFF', position: 'relative'}}>
                                <Image source={{uri: trabajo.foto_antes}} style={{width: '100%', height: '100%'}}/>
                                <View style={styles.imageTag}><Text style={styles.imageTagText}>Antes</Text></View>
                              </View>
                            )}
                            {trabajo.foto_despues && (
                              <View style={{flex: 1, position: 'relative'}}>
                                <Image source={{uri: trabajo.foto_despues}} style={{width: '100%', height: '100%'}}/>
                                <View style={styles.imageTag}><Text style={styles.imageTagText}>Después</Text></View>
                              </View>
                            )}
                          </View>
                          <View style={{padding: 15}}>
                            <Text style={{fontSize: 16, fontWeight: 'bold', color: '#0D2340'}}>{trabajo.titulo}</Text>
                            <Text style={{fontSize: 13, color: '#6B7280'}}>{trabajo.lugar} | {trabajo.estado}</Text>
                            <Text style={{marginTop: 5, fontSize: 13, color: '#4B5563'}}>{trabajo.descripcion}</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={{textAlign: 'center', color: '#6B7280'}}>El portafolio de este trabajador está vacío.</Text>
                    )}
                  </View>
                )}

                <View style={[styles.actionButtonsRow, {marginTop: 30, justifyContent: 'space-between', borderTopWidth: 0}]}>
                  <TouchableOpacity style={[styles.btnWarning, {flex: 1, height: 50, alignItems: 'center'}]} onPress={() => alternarBloqueoUsuario(usuarioExpandido?.id, usuarioExpandido?.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas', usuarioExpandido?.estado_cuenta)}>
                    <Text style={styles.btnTextWhite}>{usuarioExpandido?.estado_cuenta === 'Bloqueada' ? 'Desbloquear Acceso' : 'Bloquear Cuenta'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnDanger, {flex: 1, height: 50, alignItems: 'center', marginLeft: 10}]} onPress={() => eliminarDocumento(usuarioExpandido?.id, usuarioExpandido?.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas', `¿Eliminar a ${usuarioExpandido?.nombre} de la base de datos permanentemente?`, true)}>
                    <Text style={styles.btnTextWhite}>Eliminar del Sistema</Text>
                  </TouchableOpacity>
                </View>

              </ScrollView>
            </SafeAreaView>
          )}
        </View>
      </Modal>

      <Modal visible={!!vacanteExpandida} animationType="slide" transparent>
        <View style={styles.modalBgDark}>
          {vacanteExpandida && (
            <View style={[styles.modalContainer, {maxHeight: '90%', padding: 0, overflow: 'hidden'}]}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#D32F2F', padding: 15}}>
                <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>👁️ Detalles de la Vacante</Text>
                <TouchableOpacity onPress={() => setVacanteExpandida(null)}><Ionicons name="close" size={24} color="#FFF"/></TouchableOpacity>
              </View>
              
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding: 20}}>
                <View style={[styles.feedJobCard, {elevation: 0, borderWidth: 1, borderColor: '#E5E7EB'}]}>
                  <View style={styles.feedJobHeader}>
                    <Image source={{ uri: vacanteExpandida?.foto_contratista || 'https://via.placeholder.com/150' }} style={styles.feedContractorAvatar} />
                    <View style={{flex: 1}}>
                      <Text style={styles.feedJobTitle}>{vacanteExpandida?.titulo}</Text>
                      <Text style={styles.feedJobCompany}>{vacanteExpandida?.contratista} | {vacanteExpandida?.empresa}</Text>
                    </View>
                  </View>

                  {vacanteExpandida?.foto_trabajo && (
                    <View style={styles.feedJobImageContainer}>
                      <Image source={{ uri: vacanteExpandida.foto_trabajo }} style={styles.feedJobImage} />
                    </View>
                  )}

                  <View style={styles.feedJobDetailsGrid}>
                    <View style={styles.feedJobDetailRow}><Ionicons name="location-outline" size={16} color="#6B7280" /><Text style={styles.feedJobDetailText}>{vacanteExpandida?.ubicacion}</Text></View>
                    <View style={styles.feedJobDetailRow}><Ionicons name="cash-outline" size={16} color="#00D06C" /><Text style={[styles.feedJobDetailText, {color: '#00D06C', fontWeight: 'bold'}]}>{vacanteExpandida?.pago}</Text></View>
                    <View style={styles.feedJobDetailRow}><Ionicons name="calendar-outline" size={16} color="#F59E0B" /><Text style={[styles.feedJobDetailText, {color: '#B45309'}]}>{vacanteExpandida?.horario}</Text></View>
                  </View>
                  <Text style={styles.feedJobDesc}>{vacanteExpandida?.descripcion}</Text>
                </View>

                <View style={styles.expandedProgressBox}>
                  <Text style={{fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5}}>PROGRESO DE CONTRATACIÓN</Text>
                  <View style={[styles.progressBarBg, {height: 8}]}>
                    <View style={[styles.progressBarFill, {width: `${((vacanteExpandida?.cupo_actual || 0) / (vacanteExpandida?.cupo_total || 1)) * 100}%`}]} />
                  </View>
                  <Text style={{fontSize: 14, fontWeight: 'bold', color: '#0D2340', marginTop: 5}}>{vacanteExpandida?.cupo_actual || 0} de {vacanteExpandida?.cupo_total || 1} personas contratadas</Text>
                </View>

                <TouchableOpacity style={[styles.btnDanger, {marginTop: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center'}]} onPress={() => eliminarDocumento(vacanteExpandida?.id, 'Vacantes', `¿Eliminar esta vacante del sistema?`, true)}>
                  <Ionicons name="trash" size={20} color="#FFF" style={{marginRight: 8}}/>
                  <Text style={styles.btnTextWhite}>Eliminar esta Vacante</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

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

      <Modal visible={modalEditarAdmin} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Editar Administrador</Text>
            <Text style={styles.modalLabel}>Nombre Completo (Visible en soporte)</Text>
            <TextInput style={styles.modalInput} value={editAdminNombre} onChangeText={setEditAdminNombre} />
            <Text style={styles.modalLabel}>Cargo Administrativo (Ej. Soporte, Director)</Text>
            <TextInput style={styles.modalInput} value={editAdminCargo} onChangeText={setEditAdminCargo} />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalEditarAdmin(false)}><Text style={styles.modalBtnTextC}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnSave, {backgroundColor: '#D32F2F'}]} onPress={guardarPerfilAdmin} disabled={procesando}>
                {procesando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextS}>Guardar Perfil</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#D32F2F', fontWeight: 'bold' },
  header: { backgroundColor: '#D32F2F', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },
  headerSubtitle: { fontSize: 12, color: '#FCA5A5', fontWeight: 'bold', letterSpacing: 1 },
  tabsContainer: { flexDirection: 'row', marginTop: 15, paddingHorizontal: 15 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderColor: 'transparent', position: 'relative' },
  tabButtonActive: { borderColor: '#D32F2F' },
  tabText: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF' },
  tabTextActive: { color: '#D32F2F' },
  badge: { position: 'absolute', top: 0, right: 10, backgroundColor: '#D32F2F', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  subTabsContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 10, padding: 4, marginBottom: 20 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  subTabActive: { backgroundColor: '#FFF', elevation: 1 },
  subTabText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  subTabTextActive: { color: '#0D2340', fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 15 },
  adminCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  userCardHeader: { flexDirection: 'row', alignItems: 'center' },
  userAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: '#E5E7EB' },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  userSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  userOficio: { fontSize: 12, color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, borderTopWidth: 1, borderColor: '#F3F4F6', paddingTop: 15 },
  btnWarning: { backgroundColor: '#F59E0B', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginRight: 10, justifyContent: 'center' },
  btnDanger: { backgroundColor: '#DC2626', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
  btnTextWhite: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  statusTagText: { fontSize: 10, fontWeight: 'bold' },
  dateText: { fontSize: 11, color: '#9CA3AF', fontWeight: 'bold' },
  quejaDescBox: { backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  btnVerEvidencia: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#D1D5DB' },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyStateTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginTop: 10 },
  emptyText: { color: '#6B7280', textAlign: 'center', marginTop: 5, fontSize: 13 },
  avatarContainer: { position: 'relative' },
  avatarBig: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: '#FFF', backgroundColor: '#E5E7EB' },
  editAvatarBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: '#D32F2F', borderRadius: 20, padding: 8, borderWidth: 2, borderColor: '#FFF' },
  settingsOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 12, marginBottom: 10, elevation: 1 },
  settingsText: { fontSize: 14, fontWeight: 'bold', color: '#1F2937', marginLeft: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 15 },
  modalBgDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 15 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0D2340', marginBottom: 20 },
  modalLabel: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 15, fontSize: 14, color: '#1F2937' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  modalBtnCancel: { padding: 12, marginRight: 10 },
  modalBtnTextC: { color: '#6B7280', fontWeight: 'bold', fontSize: 14 },
  modalBtnSave: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  modalBtnTextS: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  imageTag: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  imageTagText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
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
  progressBarBg: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00D06C' },
  pickerBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 15, overflow: 'hidden' },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#00D06C', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5 },
});