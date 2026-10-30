// CAJA DE BÚSQUEDA CON SUGERENCIAS: MIENTRAS SE ESCRIBE, PROPONE PALABRAS DEL VOCABULARIO (OFICIOS, CIUDADES,
// TÍTULOS...) AUNQUE ESTÉN MAL ESCRITAS O SIN ACENTOS; AL TOCAR UNA, SE RELLENA LA CAJA.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { sugerencias } from '@/lib/busqueda';

type Props = {
  valor: string;
  onCambio: (texto: string) => void;
  vocabulario: string[];
  placeholder: string;
};

export function BuscadorConSugerencias({ valor, onCambio, vocabulario, placeholder }: Props) {
  const [enfocado, setEnfocado] = useState(false);
  const lista = enfocado ? sugerencias(vocabulario, valor) : [];

  return (
    <View style={styles.caja}>
      <View style={styles.barra}>
        <Ionicons name="search" size={20} color="#9CA3AF" />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          value={valor}
          onChangeText={onCambio}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setTimeout(() => setEnfocado(false), 150)} // DA TIEMPO A TOCAR UNA SUGERENCIA
        />
        {valor ? <TouchableOpacity onPress={() => onCambio('')}><Ionicons name="close-circle" size={20} color="#9CA3AF" /></TouchableOpacity> : null}
      </View>
      {lista.length > 0 && (
        <View style={styles.lista}>
          {lista.map(s => (
            <TouchableOpacity key={s} style={styles.sugerencia} onPress={() => { onCambio(s); setEnfocado(false); }}>
              <Ionicons name="arrow-forward-circle-outline" size={16} color="#3B82F6" />
              <Text style={styles.sugerenciaTexto} numberOfLines={1}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { marginBottom: 12, zIndex: 10 },
  barra: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, fontSize: 16, color: '#1F2937', paddingVertical: 11, marginHorizontal: 8 },
  lista: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 4, overflow: 'hidden' },
  sugerencia: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  sugerenciaTexto: { marginLeft: 8, fontSize: 16, color: '#1F2937', flex: 1 },
});
