// VENTANA PARA CANCELAR UNA OBRA. HAY QUE ESCRIBIR EL MOTIVO: CON ÉL SE LEVANTA UN REPORTE AUTOMÁTICO AL ADMINISTRADOR
// Y LA OBRA QUEDA SUSPENDIDA HASTA QUE ÉL DECIDA (CANCELARLA DEFINITIVAMENTE O REACTIVARLA).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SelectorFotos, subirFotos } from '@/components/selector-fotos';
import { accionContrato } from '@/lib/contratos';

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  onClose: () => void;
  onCancelado: () => void;
};

export function ModalCancelarContrato({ contrato, onClose, onCancelado }: Props) {
  const [motivo, setMotivo] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { setMotivo(''); setFotos([]); }, [contrato?.id]);

  const confirmar = async () => {
    if (!motivo.trim()) { Alert.alert("Aviso", "Explica por qué cancelas la obra. El administrador lo va a revisar."); return; }
    setEnviando(true);
    try {
      const urls = await subirFotos(fotos);
      await accionContrato('cancelar', { id_contrato: contrato.id, motivo: motivo.trim(), fotos: urls });
      Alert.alert("Obra suspendida", "Se levantó un reporte al administrador. La obra queda suspendida hasta que lo revise.");
      onCancelado();
    } catch (error: any) { Alert.alert("No se pudo cancelar", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  return (
    <Modal visible={!!contrato} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fondo} behavior="padding">
        <View style={styles.caja}>
          <View style={styles.encabezado}>
            <Ionicons name="warning" size={24} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={styles.titulo}>Cancelar obra</Text>
          </View>
          <Text style={styles.texto}>
            Vas a cancelar "{contrato?.titulo_vacante}". Se enviará un reporte al administrador y la obra quedará
            <Text style={{ fontWeight: 'bold' }}> suspendida</Text> hasta que él decida.
          </Text>
          <Text style={styles.etiqueta}>¿Por qué la cancelas? (obligatorio)</Text>
          <TextInput style={styles.input} multiline value={motivo} onChangeText={setMotivo} placeholder="Ej. El trabajador dejó de presentarse..." />
          <View style={{ height: 10 }} />
          <SelectorFotos fotos={fotos} onCambio={setFotos} />
          <View style={styles.botones}>
            <TouchableOpacity style={styles.botonNo} onPress={onClose} disabled={enviando}><Text style={styles.botonNoTexto}>Volver</Text></TouchableOpacity>
            <TouchableOpacity style={styles.botonSi} onPress={confirmar} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonSiTexto}>Cancelar obra</Text>}
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
  texto: { fontSize: 15, color: '#4B5563', marginBottom: 15, lineHeight: 19 },
  etiqueta: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, height: 100, textAlignVertical: 'top', fontSize: 16, color: '#1F2937' },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 },
  botonNo: { padding: 12, marginRight: 10 },
  botonNoTexto: { color: '#6B7280', fontWeight: 'bold' },
  botonSi: { backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, minWidth: 120, alignItems: 'center' },
  botonSiTexto: { color: '#FFF', fontWeight: 'bold' },
});
