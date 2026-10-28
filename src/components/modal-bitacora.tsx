// BITÁCORA DIARIA DE UNA OBRA. LA VEN EL TRABAJADOR Y EL CONTRATISTA (LA MISMA, PORQUE VIVE DENTRO DEL CONTRATO).
// SOLO EL TRABAJADOR PUEDE AGREGAR AVANCES, Y SOLO MIENTRAS LA OBRA ESTÁ ACTIVA (LO REVISAN TAMBIÉN LAS REGLAS).
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { subirFotoACloudinary } from '@/lib/cloudinary';
import { agregarABitacora, ESTADOS, leerBitacora } from '@/lib/contratos';

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  puedeEscribir: boolean;
  onClose: () => void;
};

export function ModalBitacora({ contrato, puedeEscribir, onClose }: Props) {
  const [entradas, setEntradas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [asistio, setAsistio] = useState(true);
  const [nota, setNota] = useState('');
  const [evidencia, setEvidencia] = useState<string | null>(null);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);

  const cargar = async () => {
    if (!contrato) return;
    setCargando(true);
    try { setEntradas(await leerBitacora(contrato.id)); }
    catch (error) { Alert.alert("Error", "No se pudo cargar la bitácora."); }
    setCargando(false);
  };

  useEffect(() => {
    setEntradas([]); setNota(''); setEvidencia(null); setAsistio(true);
    cargar();
  }, [contrato?.id]);

  const elegirFoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) setEvidencia(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const guardar = async () => {
    if (!nota.trim()) { Alert.alert("Aviso", "Describe brevemente qué hiciste o por qué faltaste hoy."); return; }
    if (asistio && !evidencia) { Alert.alert("Evidencia requerida", "Para comprobar tu asistencia, adjunta una foto de tu avance de hoy."); return; }
    setGuardando(true);
    try {
      const urlEvidencia = evidencia ? await subirFotoACloudinary(evidencia) : null;
      await agregarABitacora(contrato.id, { asistio, nota: nota.trim(), evidencia: urlEvidencia });
      setNota(''); setEvidencia(null); setAsistio(true);
      await cargar();
      Alert.alert("Bitácora actualizada", "Tu avance de hoy quedó registrado. El contratista ya puede verlo.");
    } catch (error: any) { Alert.alert("No se pudo guardar", error?.message || "Intenta de nuevo."); }
    setGuardando(false);
  };

  const escribirPermitido = puedeEscribir && contrato?.estado === ESTADOS.ACTIVA;

  return (
    <Modal visible={!!contrato} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.fondo}>
        <SafeAreaView style={styles.contenedor}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <View style={styles.encabezado}>
              <Text style={styles.encabezadoTexto} numberOfLines={1}>Bitácora: {contrato?.titulo_vacante}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {cargando ? <ActivityIndicator size="large" color="#00D06C" style={{ marginTop: 30 }} /> : entradas.length === 0 ? (
                <View style={styles.vacio}>
                  <Ionicons name="reader-outline" size={44} color="#D1D5DB" />
                  <Text style={styles.vacioTexto}>Todavía no hay avances registrados en esta obra.</Text>
                </View>
              ) : entradas.map((dia, i) => (
                <View key={dia.id} style={styles.fila}>
                  <View style={styles.lineaTiempo}>
                    <View style={[styles.punto, { backgroundColor: dia.asistio ? '#00D06C' : '#D32F2F' }]} />
                    {i !== entradas.length - 1 && <View style={styles.linea} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 18 }}>
                    <Text style={styles.fecha}>{dia.fecha} - {dia.asistio ? '✅ Asistió' : '❌ Faltó'}</Text>
                    <Text style={styles.nota}>{dia.nota}</Text>
                    {dia.evidencia ? (
                      <TouchableOpacity onPress={() => setFotoGrande(dia.evidencia)}>
                        <Image source={{ uri: dia.evidencia }} style={styles.evidencia} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}

              {escribirPermitido && (
                <View style={styles.formulario}>
                  <Text style={styles.formTitulo}>Reportar avance de hoy</Text>
                  <Text style={styles.etiqueta}>¿Asististe a la obra hoy?</Text>
                  <View style={styles.pickerCaja}>
                    <Picker selectedValue={asistio} onValueChange={(v) => setAsistio(v)}>
                      <Picker.Item label="✅ Sí asistí y trabajé" value={true} />
                      <Picker.Item label="❌ No pude asistir" value={false} />
                    </Picker>
                  </View>
                  <Text style={styles.etiqueta}>Notas y avances (obligatorio)</Text>
                  <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline value={nota} onChangeText={setNota} />
                  <Text style={styles.etiqueta}>Foto de evidencia (para el contratista)</Text>
                  <TouchableOpacity style={styles.subirFoto} onPress={elegirFoto}>
                    {evidencia ? <Image source={{ uri: evidencia }} style={styles.vistaPrevia} /> : <><Ionicons name="camera-outline" size={28} color="#9CA3AF" /><Text style={styles.subirTexto}>Subir foto del avance</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botonGuardar} onPress={guardar} disabled={guardando}>
                    {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonGuardarTexto}>Guardar y enviar al contratista</Text>}
                  </TouchableOpacity>
                </View>
              )}
              {puedeEscribir && contrato?.estado === ESTADOS.SUSPENDIDA && (
                <Text style={styles.avisoSuspendida}>La obra está suspendida mientras el administrador revisa la cancelación. No se pueden agregar avances.</Text>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>

      <Modal visible={!!fotoGrande} transparent animationType="fade" onRequestClose={() => setFotoGrande(null)}>
        <View style={styles.fondoFoto}>
          <TouchableOpacity style={styles.cerrarFoto} onPress={() => setFotoGrande(null)}><Ionicons name="close-circle" size={36} color="#FFF" /></TouchableOpacity>
          {fotoGrande && <Image source={{ uri: fotoGrande }} style={styles.fotoGrande} resizeMode="contain" />}
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', paddingTop: 30 },
  contenedor: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15 },
  encabezadoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 16, flex: 1, marginRight: 10 },
  vacio: { alignItems: 'center', marginVertical: 30 },
  vacioTexto: { color: '#6B7280', textAlign: 'center', marginTop: 10 },
  fila: { flexDirection: 'row' },
  lineaTiempo: { alignItems: 'center', width: 20, marginRight: 10 },
  punto: { width: 14, height: 14, borderRadius: 7, marginTop: 3 },
  linea: { width: 2, flex: 1, backgroundColor: '#E5E7EB', marginTop: 2 },
  fecha: { fontSize: 13, fontWeight: 'bold', color: '#0D2340' },
  nota: { fontSize: 13, color: '#4B5563', marginTop: 3 },
  evidencia: { width: 100, height: 100, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  formulario: { backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 10 },
  formTitulo: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', marginBottom: 10 },
  etiqueta: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: '#1F2937' },
  subirFoto: { borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12, padding: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', minHeight: 100, marginBottom: 10 },
  subirTexto: { color: '#9CA3AF', fontSize: 12, marginTop: 5 },
  vistaPrevia: { width: '100%', height: 150, borderRadius: 10 },
  botonGuardar: { backgroundColor: '#00D06C', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonGuardarTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  avisoSuspendida: { color: '#DC2626', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  fondoFoto: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  cerrarFoto: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  fotoGrande: { width: '90%', height: '70%' },
});
