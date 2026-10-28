// FOTO EN PANTALLA COMPLETA (SE VE ENTERA, SIN RECORTAR). SE CIERRA CON LA X O CON EL BOTÓN "ATRÁS" DEL TELÉFONO.
import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

type Props = {
  uri: string | null; // null = CERRADO
  onClose: () => void;
};

export function VisorFoto({ uri, onClose }: Props) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fondo}>
        <TouchableOpacity style={styles.cerrar} onPress={onClose}><Ionicons name="close-circle" size={40} color="#FFF" /></TouchableOpacity>
        {uri && <Image source={{ uri }} style={styles.foto} resizeMode="contain" />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  cerrar: { position: 'absolute', top: 45, right: 20, zIndex: 10 },
  foto: { width: '100%', height: '80%' },
});
