// LISTA DE OFICIOS CON LA OPCIÓN "OTRO": SI SE ELIGE, APARECE UNA CAJA PARA ESCRIBIR CUÁL.
// valor ES LO QUE SE GUARDA: UN OFICIO DE LA LISTA, O LO QUE LA PERSONA ESCRIBIÓ.
import { Picker } from '@react-native-picker/picker';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { esOficioDeLista, OFICIOS, OTRO_OFICIO } from '@/lib/oficios';

type Props = {
  valor: string;
  onCambio: (oficio: string) => void;
  textoVacio?: string; // P. EJ. "Elige el oficio..."
};

export function SelectorOficio({ valor, onCambio, textoVacio = 'Elige el oficio...' }: Props) {
  // "OTRO" ESTÁ ELEGIDO SI YA HAY UN OFICIO ESCRITO A MANO, O SI LA PERSONA ACABA DE ELEGIR "OTRO"
  const [otro, setOtro] = useState(!!valor && !esOficioDeLista(valor));

  return (
    <View>
      <View style={styles.caja}>
        <Picker
          selectedValue={otro ? OTRO_OFICIO : valor}
          onValueChange={(v: string) => {
            if (v === OTRO_OFICIO) { setOtro(true); onCambio(''); }
            else { setOtro(false); onCambio(v); }
          }}>
          <Picker.Item label={textoVacio} value="" />
          {OFICIOS.map(o => <Picker.Item key={o} label={o} value={o} />)}
          <Picker.Item label="Otro (escribir cuál)" value={OTRO_OFICIO} />
        </Picker>
      </View>
      {otro && (
        <TextInput style={styles.input} placeholder="Escribe el oficio (ej. Herrero artístico)" value={valor} onChangeText={onCambio} maxLength={60} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#3B82F6', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: '#1F2937' },
});
