// BARRA DE ARRIBA, FIJA (NO SE VA AL BAJAR LA PANTALLA): EL TÍTULO DE LA SECCIÓN, LA CAMPANA DE NOTIFICACIONES
// Y EL BOTÓN DE CERRAR SESIÓN. LA USAN EL PANEL DEL TRABAJADOR Y EL DEL CONTRATISTA.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CampanaNotificaciones } from '@/components/campana-notificaciones';

type Props = {
  titulo: string;
  subtitulo?: string;
  rol: 'Trabajador' | 'Contratista';
  onNuevos?: () => void;
  onCerrarSesion?: () => void;
};

export function BarraSuperior({ titulo, subtitulo, rol, onNuevos, onCerrarSesion }: Props) {
  return (
    <View style={styles.barra}>
      <View style={{ flex: 1 }}>
        <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
        {subtitulo ? <Text style={styles.subtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
      </View>
      <CampanaNotificaciones rol={rol} onNuevos={onNuevos} />
      {onCerrarSesion ? (
        <TouchableOpacity style={styles.salir} onPress={onCerrarSesion} accessibilityLabel="Cerrar sesión">
          <Ionicons name="log-out-outline" size={25} color="#FFF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', paddingHorizontal: 18, paddingVertical: 12 },
  titulo: { color: '#FFF', fontSize: 21, fontWeight: 'bold' },
  subtitulo: { color: '#9CA3AF', fontSize: 15, marginTop: 1 },
  salir: { marginLeft: 14, padding: 4 },
});
