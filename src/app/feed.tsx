import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// FIREBASE
// @ts-ignore
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export default function FeedTrabajador() {
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // NUEVO ESTADO PARA RECARGAR
  
  // PESTAÑAS DEL FEED
  const [pestañaFeed, setPestañaFeed] = useState('Explorar'); // 'Explorar' o 'Postulaciones'
  
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [misPostulaciones, setMisPostulaciones] = useState<any[]>([]);
  
  const [filtroActivo, setFiltroActivo] = useState('Todos');
  const [busqueda, setBusqueda] = useState('');

  const categorias = ['Todos', 'Albañilería', 'Plomería', 'Electricidad', 'Carpintería', 'Pintura', 'Limpieza', 'Varios'];

  const cargarDatos = async () => {
    try {
      const usuarioActual = auth.currentUser;
      if (!usuarioActual) { router.replace('/' as any); return; }

      // 1. CARGAR VACANTES REALES DESDE FIREBASE (Solo las Activas)
      const vacantesRef = collection(db, 'Vacantes');
      const qVacantes = query(vacantesRef, where('estado', '==', 'Activa'));
      const vacantesSnap = await getDocs(qVacantes);
      
      const listaVacantes: any[] = [];
      vacantesSnap.forEach(doc => listaVacantes.push({ id: doc.id, ...doc.data() }));
      
      // Ordenamos para que las más nuevas salgan arriba
      listaVacantes.sort((a, b) => new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime());
      setVacantes(listaVacantes);

      // 2. CARGAR MIS POSTULACIONES REALES
      const postulacionesRef = collection(db, 'Postulaciones');
      const qPostulaciones = query(postulacionesRef, where('id_trabajador', '==', usuarioActual.uid));
      const postSnap = await getDocs(qPostulaciones);
      
      const listaPostulaciones: any[] = [];
      postSnap.forEach(doc => listaPostulaciones.push({ id_postulacion: doc.id, ...doc.data() }));
      
      // Ordenamos para que las postulaciones más recientes salgan arriba
      listaPostulaciones.sort((a, b) => b.timestamp - a.timestamp);
      setMisPostulaciones(listaPostulaciones);

    } catch (error) {
      console.log("Error cargando datos del feed:", error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarDatos(); }, []);

  // FUNCIÓN PARA EL BOTÓN DE RECARGAR
  const onRefresh = async () => {
    setRefreshing(true);
    await cargarDatos();
    setRefreshing(false);
  };

  const postularse = async (vacante: any) => {
    Alert.alert(
      "Postular a esta obra",
      `¿Enviar tu perfil profesional a ${vacante.contratista}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, postularme", onPress: async () => {
            setProcesando(true);
            try {
              const usuarioActual = auth.currentUser;
              if (!usuarioActual) { Alert.alert("Error", "Inicia sesión primero."); return; }

              // VERIFICAR SI YA ESTÁ POSTULADO PARA NO DUPLICAR
              const yaPostulado = misPostulaciones.find(p => p.id_vacante === vacante.id);
              if (yaPostulado) {
                Alert.alert("Aviso", "Ya te has postulado a esta vacante anteriormente. Revisa la pestaña 'Mis Postulaciones'.");
                setProcesando(false);
                return;
              }

              // GUARDAMOS LA POSTULACIÓN REAL EN FIREBASE
              await addDoc(collection(db, 'Postulaciones'), {
                id_trabajador: usuarioActual.uid,
                id_vacante: vacante.id,
                titulo_vacante: vacante.titulo,
                contratista: vacante.contratista,
                vacante: {
                  titulo: vacante.titulo,
                  contratista: vacante.contratista,
                  ubicacion: vacante.ubicacion,
                  pago: vacante.pago,
                  foto_contratista: vacante.foto_contratista || 'https://via.placeholder.com/150'
                },
                estado: 'Pendiente',
                fecha_postulacion: new Date().toLocaleDateString('es-MX'),
                timestamp: new Date().getTime()
              });

              // RECARGAMOS LOS DATOS Y CAMBIAMOS DE PESTAÑA PARA QUE VEA SU POSTULACIÓN
              await cargarDatos();
              Alert.alert("¡Postulación Enviada!", "El contratista ahora puede revisar tu portafolio.");
              setPestañaFeed('Postulaciones');
              
            } catch (error) {
              Alert.alert("Error", "No se pudo enviar la postulación. Revisa tu conexión.");
            } finally {
              setProcesando(false);
            }
          }
        }
      ]
    );
  };

  const vacantesFiltradas = vacantes.filter(v => 
    (filtroActivo === 'Todos' || v.categoria === filtroActivo) &&
    v.titulo.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      {/* HEADER SUPERIOR CON BOTÓN DE RECARGAR FUNCIONAL */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Bolsa de Trabajo</Text>
          <Text style={styles.headerSubtitle}>Encuentra tu próximo proyecto hoy</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? <ActivityIndicator size="small" color="#0D2340" /> : <Ionicons name="refresh" size={24} color="#0D2340" />}
        </TouchableOpacity>
      </View>

      {/* PESTAÑAS PRINCIPALES DEL FEED */}
      <View style={styles.mainTabsContainer}>
        <TouchableOpacity 
          style={[styles.mainTab, pestañaFeed === 'Explorar' && styles.mainTabActive]} 
          onPress={() => setPestañaFeed('Explorar')}
        >
          <Text style={[styles.mainTabText, pestañaFeed === 'Explorar' && styles.mainTabTextActive]}>Explorar Vacantes</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.mainTab, pestañaFeed === 'Postulaciones' && styles.mainTabActive]} 
          onPress={() => setPestañaFeed('Postulaciones')}
        >
          <Text style={[styles.mainTabText, pestañaFeed === 'Postulaciones' && styles.mainTabTextActive]}>Mis Postulaciones</Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#00D06C" />
          <Text style={styles.loadingText}>Conectando con la base de datos...</Text>
        </View>
      ) : (
        <>
          {/* PANTALLA 1: EXPLORAR VACANTES */}
          {pestañaFeed === 'Explorar' && (
            <View style={{flex: 1}}>
              {/* BARRA DE BÚSQUEDA */}
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput 
                  style={styles.searchInput} 
                  placeholder="Buscar oficios, obras..." 
                  value={busqueda}
                  onChangeText={setBusqueda}
                />
              </View>

              {/* FILTROS RÁPIDOS */}
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
                  {categorias.map((cat, index) => (
                    <TouchableOpacity key={index} style={[styles.filterChip, filtroActivo === cat && styles.filterChipActive]} onPress={() => setFiltroActivo(cat)}>
                      <Text style={[styles.filterText, filtroActivo === cat && styles.filterTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={styles.feedContainer}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00D06C']} />}
              >
                <Text style={styles.feedResultsText}>{vacantesFiltradas.length} oportunidades publicadas</Text>

                {vacantesFiltradas.length > 0 ? (
                  vacantesFiltradas.map((item, index) => (
                    <View key={index} style={styles.jobCard}>
                      
                      {/* CABECERA: FOTO DEL CONTRATISTA Y EMPRESA */}
                      <View style={styles.jobHeader}>
                        <Image source={{ uri: item.foto_contratista || 'https://via.placeholder.com/150' }} style={styles.contractorAvatar} />
                        <View style={{flex: 1}}>
                          <Text style={styles.jobTitle} numberOfLines={2}>{item.titulo}</Text>
                          <Text style={styles.jobCompany}>{item.contratista} • {item.empresa}</Text>
                        </View>
                      </View>

                      {/* FOTO DE LA OBRA */}
                      {item.foto_trabajo && (
                        <View style={styles.jobImageContainer}>
                          <Image source={{ uri: item.foto_trabajo }} style={styles.jobImage} />
                          <View style={styles.jobImageTag}><Text style={styles.jobImageTagText}>Foto del proyecto</Text></View>
                        </View>
                      )}

                      {/* DETALLES TÉCNICOS Y DE HORARIO */}
                      <View style={styles.jobDetailsGrid}>
                        <View style={styles.jobDetailRow}>
                          <Ionicons name="location-outline" size={16} color="#6B7280" />
                          <Text style={styles.jobDetailText}>{item.ubicacion}</Text>
                        </View>
                        <View style={styles.jobDetailRow}>
                          <Ionicons name="cash-outline" size={16} color="#00D06C" />
                          <Text style={[styles.jobDetailText, {color: '#00D06C', fontWeight: 'bold'}]}>{item.pago}</Text>
                        </View>
                        <View style={styles.jobDetailRow}>
                          <Ionicons name="calendar-outline" size={16} color="#F59E0B" />
                          <Text style={[styles.jobDetailText, {color: '#B45309'}]}>{item.horario}</Text>
                        </View>
                      </View>

                      <Text style={styles.jobDesc}>{item.descripcion}</Text>

                      {/* ETIQUETAS */}
                      {item.etiquetas && (
                        <View style={styles.tagsContainer}>
                          {item.etiquetas.map((tag: string, i: number) => (
                            <View key={i} style={styles.tagBadge}><Text style={styles.tagText}>{tag}</Text></View>
                          ))}
                        </View>
                      )}

                      <TouchableOpacity style={styles.applyBtn} onPress={() => postularse(item)} disabled={procesando}>
                        {procesando ? <ActivityIndicator color="#FFF"/> : <><Text style={styles.applyBtnText}>Postularme a esta obra</Text><Ionicons name="arrow-forward" size={18} color="#FFF" style={{marginLeft: 5}}/></>}
                      </TouchableOpacity>

                    </View>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={50} color="#D1D5DB" />
                    <Text style={styles.emptyStateTitle}>El muro está vacío</Text>
                    <Text style={styles.emptyStateText}>Actualmente no hay vacantes activas publicadas por los contratistas en esta categoría.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {/* PANTALLA 2: MIS POSTULACIONES REALES */}
          {pestañaFeed === 'Postulaciones' && (
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              contentContainerStyle={styles.feedContainer}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00D06C']} />}
            >
              <Text style={styles.feedResultsText}>Historial de tus solicitudes</Text>

              {misPostulaciones.length > 0 ? (
                misPostulaciones.map((post, index) => (
                  <View key={index} style={styles.postulacionCard}>
                    
                    <View style={styles.postulacionHeader}>
                      <Image source={{ uri: post.vacante?.foto_contratista }} style={styles.postulacionAvatar} />
                      <View style={{flex: 1}}>
                        <Text style={styles.postulacionTitle}>{post.vacante?.titulo}</Text>
                        <Text style={styles.postulacionCompany}>{post.vacante?.contratista}</Text>
                      </View>
                    </View>

                    <View style={styles.postulacionInfoRow}>
                      <Ionicons name="location-outline" size={14} color="#6B7280" />
                      <Text style={styles.postulacionInfoText}>{post.vacante?.ubicacion}</Text>
                      <Text style={styles.dotSeparator}>•</Text>
                      <Text style={styles.postulacionInfoText}>{post.vacante?.pago}</Text>
                    </View>

                    <View style={styles.estadoContainer}>
                      <View style={styles.estadoLinea}>
                        <Text style={styles.estadoLabel}>Estado actual:</Text>
                        <View style={[
                          styles.estadoBadge, 
                          post.estado.includes('Aceptada') ? {backgroundColor: '#00D06C'} 
                          : post.estado.includes('Rechazada') ? {backgroundColor: '#DC2626'} 
                          : {backgroundColor: '#F59E0B'}
                        ]}>
                          <Text style={styles.estadoBadgeText}>{post.estado?.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.fechaPostulacion}>Enviada: {post.fecha_postulacion}</Text>
                    </View>

                    {post.estado.includes('Aceptada') && (
                      <View style={styles.mensajeAceptado}>
                        <Ionicons name="briefcase" size={16} color="#005530" style={{marginRight: 5}}/>
                        <Text style={styles.mensajeAceptadoText}>¡Felicidades! Esta obra ahora aparece en tu Perfil de Trabajador en "Obras en Proceso". Pónte en contacto con el contratista en la pestaña de Mensajes.</Text>
                      </View>
                    )}

                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={50} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>No te has postulado a nada</Text>
                  <Text style={styles.emptyStateText}>Explora las vacantes y envía tu perfil a los contratistas para conseguir trabajo.</Text>
                </View>
              )}
            </ScrollView>
          )}

        </>
      )}

      {/* --- MENÚ INFERIOR ESTANDARIZADO PARA EL TRABAJADOR --- */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="briefcase" size={26} color="#00D06C" />
          <Text style={[styles.navText, {color: '#00D06C', fontWeight: 'bold'}]}>Trabajo</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/dashboard-trabajador' as any)}>
          <Ionicons name="construct-outline" size={26} color="#6B7280" />
          <Text style={styles.navText}>Obras</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/mensajes' as any)}>
          <Ionicons name="chatbubbles-outline" size={26} color="#6B7280" />
          <Text style={styles.navText}>Mensajes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/dashboard-trabajador' as any)}>
          <Ionicons name="person-outline" size={26} color="#6B7280" />
          <Text style={styles.navText}>Perfil</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#0D2340', fontWeight: 'bold' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#0D2340' },
  headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  headerIcon: { backgroundColor: '#FFF', padding: 10, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },

  mainTabsContainer: { flexDirection: 'row', marginHorizontal: 20, marginTop: 10, backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4 },
  mainTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  mainTabActive: { backgroundColor: '#FFF', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  mainTabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  mainTabTextActive: { color: '#0D2340', fontWeight: 'bold' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 20, marginTop: 15, borderRadius: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#1F2937' },

  filtersContainer: { paddingHorizontal: 20, marginTop: 15, paddingBottom: 10 },
  filterChip: { backgroundColor: '#FFF', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: '#0D2340', borderColor: '#0D2340' },
  filterText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  filterTextActive: { color: '#FFF' },

  feedContainer: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 10 },
  feedResultsText: { fontSize: 12, color: '#9CA3AF', fontWeight: 'bold', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },

  jobCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6 },
  jobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  contractorAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5E7EB', marginRight: 15, borderWidth: 1, borderColor: '#D1D5DB' },
  jobTitle: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  jobCompany: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  
  jobImageContainer: { position: 'relative', marginBottom: 15 },
  jobImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#E5E7EB' },
  jobImageTag: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  jobImageTagText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  jobDetailsGrid: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  jobDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  jobDetailText: { fontSize: 13, color: '#4B5563', marginLeft: 8 },

  jobDesc: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 15 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  tagBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#BBEFD3' },
  tagText: { color: '#005530', fontSize: 11, fontWeight: 'bold' },

  applyBtn: { backgroundColor: '#00D06C', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  applyBtnText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },

  postulacionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  postulacionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  postulacionAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#E5E7EB' },
  postulacionTitle: { fontSize: 15, fontWeight: 'bold', color: '#0D2340' },
  postulacionCompany: { fontSize: 12, color: '#6B7280' },
  postulacionInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  postulacionInfoText: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  dotSeparator: { marginHorizontal: 8, color: '#D1D5DB', fontSize: 12 },
  
  estadoContainer: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12 },
  estadoLinea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  estadoLabel: { fontSize: 12, color: '#4B5563', fontWeight: 'bold' },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  estadoBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  fechaPostulacion: { fontSize: 11, color: '#9CA3AF' },
  
  mensajeAceptado: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#BBEFD3' },
  mensajeAceptadoText: { flex: 1, fontSize: 11, color: '#005530', fontWeight: 'bold' },

  emptyState: { alignItems: 'center', marginTop: 50, paddingHorizontal: 30 },
  emptyStateTitle: { fontSize: 18, fontWeight: 'bold', color: '#0D2340', marginTop: 15, marginBottom: 5 },
  emptyStateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },

  bottomNavigation: { backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderColor: '#E5E7EB', elevation: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, paddingVertical: 12 },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' },
  navText: { fontSize: 10, color: '#6B7280', marginTop: 4, fontWeight: '600' }
});