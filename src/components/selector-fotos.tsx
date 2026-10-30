// FOTOS DE EVIDENCIA PARA UN REPORTE (HASTA 3): CON LA CÁMARA O DE LA GALERÍA, SIN PANTALLA DE RECORTE.
// GUARDA LAS FOTOS EN EL TELÉFONO (base64); subirFotos LAS SUBE A CLOUDINARY CUANDO SE ENVÍA EL REPORTE.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { subirFotoACloudinary } from '@/lib/cloudinary';

type Props = {
  fotos: string[];
  onCambio: (fotos: string[]) => void;
  maximo?: number;
  texto?: string;
};

export const subirFotos = (fotos: string[]) => Promise.all(fotos.map(f => subirFotoACloudinary(f)));

export function SelectorFotos({ fotos, onCambio, maximo = 3, texto = 'Fotos de evidencia (opcional)' }: Props) {
  const agregar = async (origen: 'camara' | 'galeria') => {
    try {
      if (origen === 'camara') {
        const permiso = await ImagePicker.requestCameraPermissionsAsync();
        if (!permiso.granted) { Alert.alert("Sin permiso", "Activa el permiso de cámara para tomar la foto."); return; }
      }
      const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
      const r = origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (!r.canceled && r.assets[0].base64) onCambio([...fotos, `data:image/jpeg;base64,${r.assets[0].base64}`].slice(0, maximo));
    } catch { Alert.alert("Error", "No se pudo abrir la cámara o la galería."); }
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.etiqueta}>{texto}</Text>
      <View style={styles.fila}>
        {fotos.map((f, i) => (
          <View key={i} style={styles.miniatura}>
            <Image source={{ uri: f }} style={styles.imagen} />
            <TouchableOpacity style={styles.quitar} onPress={() => onCambio(fotos.filter((_, j) => j !== i))}><Ionicons name="close-circle" size={22} color="#DC2626" /></TouchableOpacity>
          </View>
        ))}
        {fotos.length < maximo && (
          <>
            <TouchableOpacity style={styles.agregar} onPress={() => agregar('camara')}><Ionicons name="camera" size={22} color="#0D2340" /><Text style={styles.agregarTexto}>Cámara</Text></TouchableOpacity>
            <TouchableOpacity style={styles.agregar} onPress={() => agregar('galeria')}><Ionicons name="images-outline" size={22} color="#0D2340" /><Text style={styles.agregarTexto}>Galería</Text></TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 6 },
  fila: { flexDirection: 'row', flexWrap: 'wrap' },
  miniatura: { marginRight: 8, marginBottom: 8 },
  imagen: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#E5E7EB' },
  quitar: { position: 'absolute', top: -8, right: -8, backgroundColor: '#FFF', borderRadius: 11 },
  agregar: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8 },
  agregarTexto: { fontSize: 13, color: '#0D2340', fontWeight: 'bold' },
});
