// VENTANA PARA CANCELAR UNA OBRA. HAY QUE ESCRIBIR EL MOTIVO.
//   CON 48 HORAS DE AVISO O MÁS (Y SIN PAGOS NI REPORTES ABIERTOS): SE CANCELA AL MOMENTO, SIN SANCIÓN.
//   CON MENOS AVISO, O CON LA OBRA YA EMPEZADA: CANCELACIÓN TARDÍA. SE LEVANTA UN REPORTE AL ADMINISTRADOR Y LA OBRA
//   QUEDA SUSPENDIDA HASTA QUE DECIDA (DESPUÉS DE ESCUCHAR A LOS DOS); PUEDE SANCIONAR A QUIEN CANCELÓ.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMargenModal } from '@/lib/margen-modal';

import { SelectorFotos, subirFotos } from '@/components/selector-fotos';
import { accionContrato, cancelacionATiempo, dineroYaPagado, ESTADOS, HORAS_AVISO_CANCELACION, horasParaInicio, textoAvisoCancelacion } from '@/lib/contratos';

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  onClose: () => void;
  // estado: CÓMO QUEDÓ LA OBRA ('Cancelada' SI FUE A TIEMPO, 'Suspendida' SI LA REVISA EL ADMIN)
  onCancelado: (estado?: string) => void;
};

export function ModalCancelarContrato({ contrato, onClose, onCancelado }: Props) {
  const margenModal = useMargenModal();
  const [motivo, setMotivo] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { setMotivo(''); setFotos([]); }, [contrato?.id]);

  const horas = horasParaInicio(contrato);
  const aTiempo = cancelacionATiempo(contrato);
  const tardia = horas < HORAS_AVISO_CANCELACION;

  const confirmar = async () => {
    if (!motivo.trim()) { Alert.alert("Aviso", "Explica por qué cancelas la obra. La otra persona lo va a leer."); return; }
    setEnviando(true);
    try {
      const urls = await subirFotos(fotos);
      const { estado } = await accionContrato('cancelar', { id_contrato: contrato.id, motivo: motivo.trim(), fotos: urls });
      if (estado === ESTADOS.CANCELADA) Alert.alert("Obra cancelada", "Cancelaste con tiempo, sin sanción. Ya le avisamos a la otra persona.");
      else Alert.alert("Obra suspendida", "Se levantó un reporte al administrador. La otra persona dará su versión y el administrador decidirá qué pasa con la obra y con el dinero. Les avisaremos a los dos.");
      onCancelado(estado);
    } catch (error: any) { Alert.alert("No se pudo cancelar", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  return (
    <Modal visible={!!contrato} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.fondo, margenModal]} behavior="padding">
        <View style={[styles.caja, { maxHeight: '92%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.encabezado}>
            <Ionicons name="warning" size={24} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={styles.titulo}>Cancelar obra</Text>
          </View>
          <Text style={styles.texto}>Vas a cancelar "{contrato?.titulo_vacante}".</Text>

          {/* AVISO: ¿CANCELA CON TIEMPO (48 HORAS ANTES) O ES UNA CANCELACIÓN TARDÍA? */}
          {aTiempo ? (
            <View style={[styles.aviso, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#047857" />
              <Text style={[styles.avisoTexto, { color: '#065F46' }]}>
                Cancelas {textoAvisoCancelacion(horas)}: es a tiempo (se piden {HORAS_AVISO_CANCELACION} horas de aviso). La obra se cancela de inmediato y sin sanción.
              </Text>
            </View>
          ) : (
            <View style={[styles.aviso, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
              <Text style={[styles.avisoTexto, { color: '#991B1B' }]}>
                {tardia
                  ? `Cancelación tardía: cancelas ${textoAvisoCancelacion(horas)} y se piden al menos ${HORAS_AVISO_CANCELACION} horas de aviso, para no dejar a la otra persona sin trabajo o sin trabajador. `
                  : 'Como ya hay dinero o un reporte de por medio, '}
                La obra quedará suspendida, la otra persona dará su versión y el administrador decidirá. Una cancelación tardía queda en tu historial y puede llevar a un descuento o al bloqueo de tu cuenta.
              </Text>
            </View>
          )}
          {dineroYaPagado(contrato) > 0 && (
            <View style={styles.dinero}>
              <Ionicons name="cash-outline" size={18} color="#92400E" />
              <Text style={styles.dineroTexto}>
                El contratista ya pagó ${dineroYaPagado(contrato).toLocaleString('es-MX')} en esta obra. Ese dinero no se pierde: el administrador
                decidirá si el trabajador lo devuelve (todo o una parte) o se lo queda por lo que ya trabajó.
              </Text>
            </View>
          )}
          <Text style={styles.etiqueta}>¿Por qué la cancelas? (obligatorio)</Text>
          <TextInput style={styles.input} multiline value={motivo} onChangeText={setMotivo} placeholder="Ej. El trabajador dejó de presentarse..." />
          <View style={{ height: 10 }} />
          {!aTiempo && <SelectorFotos fotos={fotos} onCambio={setFotos} />}
          <View style={styles.botones}>
            <TouchableOpacity style={styles.botonNo} onPress={onClose} disabled={enviando}><Text style={styles.botonNoTexto}>Volver</Text></TouchableOpacity>
            <TouchableOpacity style={styles.botonSi} onPress={confirmar} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonSiTexto}>Cancelar obra</Text>}
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  caja: { backgroundColor: '#FFF', borderRadius: 20, padding: 22 },
  aviso: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  avisoTexto: { flex: 1, marginLeft: 8, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  dinero: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 10, marginBottom: 10 },
  dineroTexto: { flex: 1, marginLeft: 8, fontSize: 14, color: '#92400E' },
  encabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 20, fontWeight: 'bold', color: '#0D2340' },
  texto: { fontSize: 15, color: '#4B5563', marginBottom: 15, lineHeight: 21 },
  etiqueta: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, height: 100, textAlignVertical: 'top', fontSize: 16, color: '#1F2937' },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 },
  botonNo: { padding: 12, marginRight: 10 },
  botonNoTexto: { color: '#6B7280', fontWeight: 'bold' },
  botonSi: { backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, minWidth: 120, alignItems: 'center' },
  botonSiTexto: { color: '#FFF', fontWeight: 'bold' },
});
