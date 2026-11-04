// VENTANA PARA REPORTAR UN INCUMPLIMIENTO DE LA OTRA PARTE SIN CANCELAR LA OBRA
// (P. EJ. EL CONTRATISTA NO LLEVÓ EL MATERIAL QUE PROMETIÓ). LA OBRA SIGUE; EL ADMIN REVISA Y LES AVISA SU DECISIÓN.
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SelectorFotos, subirFotos } from '@/components/selector-fotos';
import { accionContrato } from '@/lib/contratos';

const CATEGORIAS = {
  trabajador: ['No llegó el material prometido', 'No cumplió lo acordado (herramienta, comida, pasaje...)', 'Falta de pago', 'Cambió lo acordado', 'Condiciones inseguras', 'Malos tratos', 'Otro'],
  contratista: ['No se presentó', 'Trabajo mal hecho', 'Daño o pérdida de material', 'Impuntualidad', 'Mal comportamiento', 'Otro'],
};

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  rol: 'trabajador' | 'contratista';
  onClose: () => void;
};

export function ModalReportarProblema({ contrato, rol, onClose }: Props) {
  const [categoria, setCategoria] = useState(CATEGORIAS[rol][0]);
  const [motivo, setMotivo] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { setMotivo(''); setFotos([]); setCategoria(CATEGORIAS[rol][0]); }, [contrato?.id]);

  const enviar = async () => {
    if (!motivo.trim()) { Alert.alert("Aviso", "Explica qué pasó. El administrador lo va a revisar."); return; }
    setEnviando(true);
    try {
      const urls = await subirFotos(fotos);
      await accionContrato('reportar_problema', { id_contrato: contrato.id, categoria, motivo: motivo.trim(), fotos: urls });
      Alert.alert("Reporte enviado", "El administrador lo revisará y les avisará a los dos su decisión. La obra sigue activa.");
      onClose();
    } catch (error: any) { Alert.alert("No se pudo enviar", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  return (
    <Modal visible={!!contrato} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fondo} behavior="padding">
        <View style={styles.caja}>
          <View style={styles.encabezado}>
            <Ionicons name="flag" size={22} color="#EA580C" style={{ marginRight: 8 }} />
            <Text style={styles.titulo}>Reportar un problema</Text>
          </View>
          <Text style={styles.texto}>
            Sobre "{contrato?.titulo_vacante}". La obra <Text style={{ fontWeight: 'bold' }}>no se cancela</Text>: el administrador revisa el caso y les avisa a los dos.
          </Text>
          <Text style={styles.etiqueta}>¿Qué pasó?</Text>
          <View style={styles.pickerCaja}>
            <Picker selectedValue={categoria} onValueChange={setCategoria}>
              {CATEGORIAS[rol].map(c => <Picker.Item key={c} label={c} value={c} />)}
            </Picker>
          </View>
          <Text style={styles.etiqueta}>Explícalo (obligatorio)</Text>
          <TextInput style={styles.input} multiline value={motivo} onChangeText={setMotivo} placeholder={rol === 'trabajador' ? 'Ej. Quedó de llevar el cemento el lunes y no llegó...' : 'Ej. Dejó la barda sin terminar y se fue...'} />
          <View style={{ height: 10 }} />
          <SelectorFotos fotos={fotos} onCambio={setFotos} />
          <View style={styles.botones}>
            <TouchableOpacity style={styles.botonNo} onPress={onClose} disabled={enviando}><Text style={styles.botonNoTexto}>Volver</Text></TouchableOpacity>
            <TouchableOpacity style={styles.botonSi} onPress={enviar} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonSiTexto}>Enviar reporte</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  caja: { backgroundColor: '#FFF', borderRadius: 20, padding: 22 },
  encabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 20, fontWeight: 'bold', color: '#0D2340' },
  texto: { fontSize: 15, color: '#4B5563', marginBottom: 12, lineHeight: 21 },
  etiqueta: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5 },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, height: 90, textAlignVertical: 'top', fontSize: 16, color: '#1F2937' },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 },
  botonNo: { padding: 12, marginRight: 10 },
  botonNoTexto: { color: '#6B7280', fontWeight: 'bold' },
  botonSi: { backgroundColor: '#EA580C', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, minWidth: 120, alignItems: 'center' },
  botonSiTexto: { color: '#FFF', fontWeight: 'bold' },
});
