// ESTADO Y MUNICIPIO: AL ELEGIR EL ESTADO, LA SEGUNDA LISTA MUESTRA SOLO LOS MUNICIPIOS DE ESE ESTADO (CATÁLOGO DEL INEGI).
import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, View } from 'react-native';

import { ESTADOS_MEXICO, municipiosDe } from '@/lib/ubicacion';

type Props = {
  estado: string;
  municipio: string;
  onEstado: (estado: string) => void;
  onMunicipio: (municipio: string) => void;
};

export function SelectorUbicacion({ estado, municipio, onEstado, onMunicipio }: Props) {
  const municipios = municipiosDe(estado);
  // UN MUNICIPIO ESCRITO A MANO ANTES (QUE NO ESTÁ EN LA LISTA) SE SIGUE MOSTRANDO PARA NO PERDERLO
  const lista = municipio && !municipios.includes(municipio) ? [municipio, ...municipios] : municipios;

  return (
    <View>
      <Text style={styles.etiqueta}>Estado</Text>
      <View style={styles.caja}>
        <Picker selectedValue={estado} onValueChange={(v: string) => { onEstado(v); onMunicipio(''); }}>
          <Picker.Item label="Elige el estado..." value="" />
          {ESTADOS_MEXICO.map(e => <Picker.Item key={e} label={e} value={e} />)}
        </Picker>
      </View>
      <Text style={styles.etiqueta}>Municipio {estado ? `(${municipios.length})` : ''}</Text>
      <View style={[styles.caja, !estado && { opacity: 0.5 }]}>
        <Picker selectedValue={municipio} onValueChange={onMunicipio} enabled={!!estado}>
          <Picker.Item label={estado ? 'Elige el municipio...' : 'Primero elige el estado'} value="" />
          {lista.map(m => <Picker.Item key={m} label={m} value={m} />)}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  caja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
});
