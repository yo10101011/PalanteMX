// "LA OBRA SE CANCELÓ POR TAL COSA. ¿QUIERES VOLVER A PUBLICARLA?": EL CONTRATISTA ELIGE LOS NUEVOS DÍAS DE TRABAJO
// Y LA VACANTE SE ABRE OTRA VEZ EN LA BOLSA DE TRABAJO PARA BUSCAR A OTRO TRABAJADOR (RUTA /contratos, ACCIÓN republicar).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMargenModal } from '@/lib/margen-modal';

import { SelectorDiasObra } from '@/components/selector-dias-obra';
import { accionContrato, claveDia, ESTADOS, textoDiasObra, type DiasObra } from '@/lib/contratos';

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  onClose: () => void;
  onPublicada: () => void;
};

export function ModalRepublicar({ contrato, onClose, onPublicada }: Props) {
  const margenModal = useMargenModal();
  const [dias, setDias] = useState<DiasObra>({ inicio: '', fin: '', dias: [] });
  const [enviando, setEnviando] = useState(false);

  // SE PROPONEN LOS MISMOS DÍAS DE LA SEMANA, PERO EL INICIO SE ELIGE OTRA VEZ SI EL ORIGINAL YA PASÓ
  useEffect(() => {
    if (!contrato) return;
    const hoy = claveDia(new Date());
    const inicio = contrato.inicio_obra && contrato.inicio_obra >= hoy ? contrato.inicio_obra : '';
    setDias({ inicio, fin: inicio && contrato.fin_obra >= inicio ? contrato.fin_obra : '', dias: contrato.dias_obra || [] });
  }, [contrato?.id]);

  const canceloElTrabajador = contrato?.cancelado_por === contrato?.id_trabajador;
  const nombreTrabajador = `${contrato?.trabajador?.nombre || contrato?.nombre_trabajador || 'El trabajador'}`.trim();

  const publicar = async () => {
    if (!dias.inicio) { Alert.alert("Aviso", "Elige el día en que empieza la obra."); return; }
    if (dias.fin !== dias.inicio && dias.dias.length === 0) { Alert.alert("Aviso", "Elige qué días de la semana se trabaja."); return; }
    setEnviando(true);
    try {
      await accionContrato('republicar', { id_contrato: contrato.id, inicio_obra: dias.inicio, fin_obra: dias.fin, dias_obra: dias.dias });
      Alert.alert("Obra publicada otra vez", `"${contrato.titulo_vacante}" ya está en la Bolsa de Trabajo: ${textoDiasObra({ inicio_obra: dias.inicio, fin_obra: dias.fin, dias_obra: dias.dias })}. Te avisaremos cuando alguien se postule.`);
      onPublicada();
    } catch (error: any) { Alert.alert("No se pudo publicar", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  return (
    <Modal visible={!!contrato} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.fondo, margenModal]}>
        <View style={styles.caja}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.encabezado}>
              <Ionicons name="refresh-circle" size={26} color="#2563EB" style={{ marginRight: 8 }} />
              <Text style={styles.titulo}>¿Volver a publicar la obra?</Text>
            </View>
            <Text style={styles.texto}>
              "{contrato?.titulo_vacante}" se {contrato?.estado === ESTADOS.SUSPENDIDA ? 'suspendió' : 'canceló'} porque {canceloElTrabajador ? `${nombreTrabajador} (trabajador) la canceló` : 'tú la cancelaste'}.
            </Text>
            {contrato?.motivo_cancelacion ? (
              <View style={styles.motivo}>
                <Text style={styles.motivoEtiqueta}>MOTIVO</Text>
                <Text style={styles.motivoTexto}>"{contrato.motivo_cancelacion}"</Text>
              </View>
            ) : null}
            <Text style={styles.texto}>
              Si la vuelves a publicar, aparece otra vez en la Bolsa de Trabajo para que se postule otro trabajador.
              {contrato?.estado === ESTADOS.SUSPENDIDA ? ' El administrador sigue revisando la cancelación y el dinero, pero ya no regresará la obra a este trabajador.' : ''}
            </Text>

            <SelectorDiasObra valor={dias} onCambio={setDias} />

            <View style={styles.botones}>
              <TouchableOpacity style={styles.botonNo} onPress={onClose} disabled={enviando}><Text style={styles.botonNoTexto}>No, gracias</Text></TouchableOpacity>
              <TouchableOpacity style={styles.botonSi} onPress={publicar} disabled={enviando}>
                {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonSiTexto}>Volver a publicar</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  caja: { backgroundColor: '#FFF', borderRadius: 20, padding: 22, maxHeight: '92%' },
  encabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 20, fontWeight: 'bold', color: '#0D2340', flex: 1 },
  texto: { fontSize: 15, color: '#4B5563', marginBottom: 12, lineHeight: 21 },
  motivo: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 10, marginBottom: 12 },
  motivoEtiqueta: { fontSize: 12, fontWeight: 'bold', color: '#B91C1C', letterSpacing: 0.5 },
  motivoTexto: { fontSize: 15, color: '#7F1D1D', marginTop: 2 },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  botonNo: { padding: 12, marginRight: 10 },
  botonNoTexto: { color: '#6B7280', fontWeight: 'bold' },
  botonSi: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, minWidth: 150, alignItems: 'center' },
  botonSiTexto: { color: '#FFF', fontWeight: 'bold' },
});
