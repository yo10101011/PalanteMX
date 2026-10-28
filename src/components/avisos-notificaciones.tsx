// AVISOS PARA EL USUARIO (COLECCIÓN Notificaciones, LOS CREA EL SERVIDOR: DECISIONES DEL ADMIN, BITÁCORA RECHAZADA,
// OBRA SUSPENDIDA...). SE ESCUCHAN EN TIEMPO REAL: EN CUANTO LLEGA UNO SIN LEER, APARECE ESTA VENTANA.
// AL PRESIONAR "ENTENDIDO" SE MARCAN COMO LEÍDOS. onNuevos SIRVE PARA QUE LA PANTALLA RECARGUE SUS DATOS
// (P. EJ. SI EL ADMIN REACTIVÓ UNA OBRA, SU ESTADO CAMBIÓ).
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { auth, db } from '../../firebaseConfig';

type Props = { onNuevos?: () => void };

export function AvisosNotificaciones({ onNuevos }: Props) {
  const [avisos, setAvisos] = useState<any[]>([]);
  const onNuevosRef = useRef(onNuevos);
  onNuevosRef.current = onNuevos;

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // SOLO SE FILTRA POR USUARIO (NO HACE FALTA UN ÍNDICE ESPECIAL); LOS LEÍDOS SE DESCARTAN AQUÍ
    return onSnapshot(query(collection(db, 'Notificaciones'), where('id_usuario', '==', uid)), (snap) => {
      const sinLeer = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(a => !a.leida).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setAvisos(sinLeer);
      if (sinLeer.length > 0) onNuevosRef.current?.();
    }, (error) => console.log("Error escuchando avisos", error));
  }, []);

  const marcarLeidos = async () => {
    const pendientes = avisos;
    setAvisos([]);
    await Promise.all(pendientes.map(a => updateDoc(doc(db, 'Notificaciones', a.id), { leida: true }).catch(() => {})));
  };

  return (
    <Modal visible={avisos.length > 0} transparent animationType="fade" onRequestClose={marcarLeidos}>
      <View style={styles.fondo}>
        <View style={styles.caja}>
          <View style={styles.encabezado}>
            <Ionicons name="notifications" size={24} color="#F59E0B" style={{ marginRight: 8 }} />
            <Text style={styles.titulo}>{avisos.length === 1 ? 'Tienes un aviso' : `Tienes ${avisos.length} avisos`}</Text>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {avisos.map(a => (
              <View key={a.id} style={styles.aviso}>
                <Text style={styles.avisoTitulo}>{a.titulo}</Text>
                <Text style={styles.avisoTexto}>{a.mensaje}</Text>
                <Text style={styles.avisoFecha}>{new Date(a.fecha).toLocaleString('es-MX')}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.boton} onPress={marcarLeidos}><Text style={styles.botonTexto}>Entendido</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  caja: { backgroundColor: '#FFF', borderRadius: 20, padding: 20 },
  encabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#0D2340' },
  aviso: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  avisoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#0D2340' },
  avisoTexto: { fontSize: 13, color: '#4B5563', marginTop: 4, lineHeight: 18 },
  avisoFecha: { fontSize: 10, color: '#9CA3AF', marginTop: 6 },
  boton: { backgroundColor: '#0D2340', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 6 },
  botonTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
});
