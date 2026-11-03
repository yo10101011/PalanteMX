// CONDICIONES DE LA OBRA (QUIÉN PONE EL MATERIAL, LA HERRAMIENTA, SI HAY COMIDA, CÓMO Y CUÁNDO SE PAGA...).
// FormCondiciones: PARA QUE EL CONTRATISTA LAS ELIJA AL PUBLICAR. VistaCondiciones: PARA MOSTRARLAS EN LA VACANTE
// Y EN EL CONTRATO, DONDE QUEDAN COMO EVIDENCIA DE LO QUE SE PROMETIÓ.
import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, View } from 'react-native';

import { CONDICIONES } from '@/lib/contratos';

export function FormCondiciones({ valores, onCambio }: { valores: Record<string, string>; onCambio: (v: Record<string, string>) => void }) {
  return (
    <View>
      {CONDICIONES.map(c => (
        <View key={c.clave}>
          <Text style={styles.etiqueta}>{c.pregunta}</Text>
          <View style={styles.caja}>
            <Picker selectedValue={valores[c.clave] || ''} onValueChange={(v: string) => onCambio({ ...valores, [c.clave]: v })}>
              <Picker.Item label="Elige una opción..." value="" />
              {c.opciones.map(o => <Picker.Item key={o} label={o} value={o} />)}
            </Picker>
          </View>
        </View>
      ))}
    </View>
  );
}

export function VistaCondiciones({ condiciones, titulo = 'Lo que se acordó' }: { condiciones?: Record<string, string>; titulo?: string }) {
  const lista = CONDICIONES.filter(c => condiciones?.[c.clave]);
  if (lista.length === 0) return null;
  return (
    <View style={styles.vista}>
      <Text style={styles.vistaTitulo}>{titulo}</Text>
      {lista.map((c, i) => (
        <View key={c.clave} style={[styles.vistaFila, i > 0 && styles.vistaFilaBorde]}>
          <Text style={styles.vistaEtiqueta}>{c.pregunta.replace(/[¿?]/g, '').replace(/ \(.*\)/, '')}</Text>
          <Text style={styles.vistaValor}>{condiciones![c.clave]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  caja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 8, overflow: 'hidden' },
  vista: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  vistaTitulo: { fontSize: 12, fontWeight: 'bold', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  vistaFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  vistaFilaBorde: { borderTopWidth: 1, borderColor: '#EEF2F6' },
  vistaEtiqueta: { flex: 1, fontSize: 13, color: '#64748B', marginRight: 8 },
  vistaValor: { flex: 1, fontSize: 13, color: '#0D2340', fontWeight: 'bold', textAlign: 'right' },
});
