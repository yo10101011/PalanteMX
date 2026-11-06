// PANEL DE NOTIFICACIONES (COMO LA CAMPANA DE FACEBOOK). LOS AVISOS LOS CREA EL SERVIDOR (COLECCIÓN Notificaciones):
// TE CALIFICARON, TE REPORTARON, NUEVA PROPUESTA, TRATO CERRADO, DECISIÓN DEL ADMIN...
// - LA CAMPANA MUESTRA CUÁNTOS HAY SIN LEER; AL TOCARLA SE ABRE LA LISTA COMPLETA (LOS NUEVOS RESALTADOS).
// - LOS AVISOS "IMPORTANTES" (DECISIONES DEL ADMIN, OBRA SUSPENDIDA, TE REPORTARON) ABREN EL PANEL SOLOS AL LLEGAR.
// - SI EL AVISO TRAE chat_con (P. EJ. UNA PROPUESTA NUEVA), AL TOCARLO SE ABRE EL CHAT CON ESA PERSONA.
// - onNuevos: LA PANTALLA RECARGA SUS DATOS CUANDO LLEGA ALGO NUEVO (PUDO CAMBIAR UNA OBRA).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { abrirChatCon } from '@/lib/contratos';
import { auth, db } from '../../firebaseConfig';

const ESTILO_TIPO: Record<string, { icono: keyof typeof Ionicons.glyphMap; color: string }> = {
  contrato: { icono: 'briefcase', color: '#3B82F6' },
  bitacora: { icono: 'reader', color: '#EA580C' },
  reporte: { icono: 'flag', color: '#DC2626' },
  admin: { icono: 'shield-checkmark', color: '#7C3AED' },
  resena: { icono: 'star', color: '#F59E0B' },
};

// "HACE 5 MIN", "HACE 2 H", "AYER"...
const hace = (timestamp: number) => {
  const minutos = Math.floor((Date.now() - timestamp) / 60000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
};

type Props = {
  onNuevos?: () => void;
  colorIcono?: string;
  style?: StyleProp<ViewStyle>;
  variante?: 'campana' | 'fila'; // 'fila' = UNA OPCIÓN "NOTIFICACIONES" EN LA LISTA DE AJUSTES DEL PERFIL
  rol: 'Trabajador' | 'Contratista'; // PARA SABER A QUÉ PANTALLA LLEVAR AL TOCAR UN AVISO
};

export function CampanaNotificaciones({ onNuevos, colorIcono = '#FFF', style, variante = 'campana', rol }: Props) {
  const [avisos, setAvisos] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(false);
  const onNuevosRef = useRef(onNuevos);
  onNuevosRef.current = onNuevos;
  const vistosRef = useRef<Set<string> | null>(null); // IDS YA CONOCIDOS, PARA DETECTAR LOS QUE ACABAN DE LLEGAR

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // SOLO SE FILTRA POR USUARIO (NO HACE FALTA UN ÍNDICE ESPECIAL); EL ORDEN SE HACE AQUÍ
    return onSnapshot(query(collection(db, 'Notificaciones'), where('id_usuario', '==', uid)), (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setAvisos(lista);
      const nuevos = lista.filter(a => !a.leida && !vistosRef.current?.has(a.id));
      if (nuevos.length > 0) onNuevosRef.current?.();
      if (nuevos.some(a => a.importante)) setAbierto(true);
      vistosRef.current = new Set(lista.map(a => a.id));
    }, () => { /* AL CERRAR SESIÓN LA ESCUCHA PIERDE PERMISO ANTES DE CERRARSE: NO ES UN ERROR REAL */ });
  }, []);

  const sinLeer = avisos.filter(a => !a.leida);

  const marcarLeidas = () => {
    sinLeer.forEach(a => updateDoc(doc(db, 'Notificaciones', a.id), { leida: true }).catch(() => {}));
  };

  const cerrar = () => { marcarLeidas(); setAbierto(false); };

  // AL TOCAR UN AVISO SE VA A LO QUE DICE: AL CHAT, A LA OBRA, A SU BITÁCORA, A SUS PAGOS O A LAS RESEÑAS
  const tocarAviso = (aviso: any) => {
    cerrar();
    if (aviso.chat_con?.id) { abrirChatCon(aviso.chat_con); return; }
    const abrir = aviso.destino?.abrir || (aviso.tipo === 'resena' ? 'resenas' : 'obra');
    const esContratista = rol === 'Contratista';
    const tab = abrir === 'resenas' ? (esContratista ? 'Perfil' : 'Reseñas') : (esContratista ? 'Obras' : 'Mis Trabajos');
    router.replace({
      pathname: esContratista ? '/dashboard-contratista' : '/dashboard-trabajador',
      params: { tab, abrir, contrato: aviso.destino?.id_contrato || '', t: String(Date.now()) },
    } as any);
  };

  return (
    <>
      {variante === 'fila' ? (
        <TouchableOpacity style={[styles.fila, style]} onPress={() => setAbierto(true)}>
          <Ionicons name="notifications-outline" size={24} color="#0D2340" />
          <Text style={styles.filaTexto}>Notificaciones</Text>
          {sinLeer.length > 0 && <View style={styles.globoFila}><Text style={styles.globoTexto}>{sinLeer.length > 9 ? '9+' : sinLeer.length}</Text></View>}
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.boton, style]} onPress={() => setAbierto(true)} hitSlop={10}>
          <Ionicons name={sinLeer.length > 0 ? 'notifications' : 'notifications-outline'} size={26} color={colorIcono} />
          {sinLeer.length > 0 && <View style={styles.globo}><Text style={styles.globoTexto}>{sinLeer.length > 9 ? '9+' : sinLeer.length}</Text></View>}
        </TouchableOpacity>
      )}

      <Modal visible={abierto} animationType="slide" transparent onRequestClose={cerrar}>
        <View style={styles.fondo}>
          <SafeAreaView style={styles.panel} edges={['bottom']}>
            <View style={styles.encabezado}>
              <Text style={styles.titulo}>Notificaciones</Text>
              <TouchableOpacity onPress={cerrar}><Ionicons name="close-circle" size={30} color="#FFF" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {avisos.length === 0 ? (
                <View style={styles.vacio}>
                  <Ionicons name="notifications-off-outline" size={44} color="#D1D5DB" />
                  <Text style={styles.vacioTexto}>No tienes notificaciones todavía.</Text>
                </View>
              ) : avisos.map(a => {
                const estilo = ESTILO_TIPO[a.tipo] || ESTILO_TIPO.contrato;
                return (
                  <TouchableOpacity key={a.id} activeOpacity={0.7} onPress={() => tocarAviso(a)} style={[styles.aviso, !a.leida && styles.avisoNuevo]}>
                    <View style={[styles.icono, { backgroundColor: estilo.color }]}><Ionicons name={estilo.icono} size={18} color="#FFF" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.avisoTitulo}>{a.titulo}</Text>
                      <Text style={styles.avisoTexto}>{a.mensaje}</Text>
                      <View style={styles.pie}>
                        <Text style={[styles.avisoFecha, !a.leida && { color: '#2563EB', fontWeight: 'bold' }]}>{hace(a.timestamp || 0)}</Text>
                        <Text style={styles.irChat}>{a.chat_con ? 'Ir al chat ›' : a.destino?.abrir === 'pagos' ? 'Ver pagos ›' : a.destino?.abrir === 'bitacora' ? 'Ver bitácora ›' : a.destino?.abrir === 'reportes' ? 'Ver reportes ›' : a.destino?.abrir === 'republicar' ? 'Volver a publicar ›' : a.tipo === 'resena' ? 'Ver reseñas ›' : 'Ver obra ›'}</Text>
                      </View>
                    </View>
                    {!a.leida && <View style={styles.punto} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {sinLeer.length > 0 && (
              <TouchableOpacity style={styles.botonLeidas} onPress={marcarLeidas}><Text style={styles.botonLeidasTexto}>Marcar todas como leídas</Text></TouchableOpacity>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boton: { padding: 4 },
  globo: { position: 'absolute', top: -2, right: -4, backgroundColor: '#DC2626', borderRadius: 10, minWidth: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF', paddingHorizontal: 3 },
  globoTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  fila: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 12, marginBottom: 10, elevation: 1 },
  filaTexto: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginLeft: 15 },
  globoFila: { backgroundColor: '#DC2626', borderRadius: 10, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: 6, paddingHorizontal: 4 },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingTop: 50 },
  panel: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 16 },
  titulo: { color: '#FFF', fontSize: 19, fontWeight: 'bold' },
  vacio: { alignItems: 'center', marginTop: 50 },
  vacioTexto: { color: '#6B7280', marginTop: 10 },
  aviso: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 8, alignItems: 'flex-start' },
  avisoNuevo: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  icono: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avisoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  avisoTexto: { fontSize: 15, color: '#4B5563', marginTop: 2, lineHeight: 21 },
  pie: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  avisoFecha: { fontSize: 13, color: '#9CA3AF' },
  irChat: { fontSize: 14, color: '#2563EB', fontWeight: 'bold' },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB', marginLeft: 6, marginTop: 4 },
  botonLeidas: { backgroundColor: '#0D2340', margin: 12, borderRadius: 12, padding: 14, alignItems: 'center' },
  botonLeidasTexto: { color: '#FFF', fontWeight: 'bold' },
});
