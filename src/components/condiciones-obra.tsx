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
      {lista.map(c => (
        <Text key={c.clave} style={styles.vistaFila}><Text style={{ fontWeight: 'bold' }}>{c.pregunta.replace(/[¿?]/g, '')}:</Text> {condiciones![c.clave]}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  caja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 8, overflow: 'hidden' },
  vista: { backgroundColor: '#F0F9FF', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  vistaTitulo: { fontSize: 14, fontWeight: 'bold', color: '#075985', marginBottom: 4 },
  vistaFila: { fontSize: 14, color: '#0C4A6E', marginTop: 2 },
});
