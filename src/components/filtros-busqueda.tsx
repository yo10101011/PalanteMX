// FILTROS DE BÚSQUEDA: ESTADO DE LA REPÚBLICA, ORDEN Y PRECIO. LOS USAN EL EXPLORAR DEL CONTRATISTA (TRABAJADORES)
// Y LA BOLSA DE TRABAJO DEL TRABAJADOR (VACANTES). EL FILTRADO LO HACE CADA PANTALLA; ESTO SOLO DIBUJA LOS CONTROLES.
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { DIAS_SEMANA, ESTADOS_MEXICO } from '@/lib/ubicacion';

export const TODOS_LOS_ESTADOS = 'Todos';

type Props = {
  estado: string;
  onEstado: (estado: string) => void;
  orden: string;
  onOrden: (orden: string) => void;
  opcionesOrden: { valor: string; texto: string }[];
  precio: string;
  onPrecio: (precio: string) => void;
  etiquetaPrecio: string; // P. EJ. "Precio máximo" (TRABAJADORES) O "Pago mínimo" (VACANTES)
  miEstado?: string;      // PARA EL ATAJO "SOLO MI ESTADO"
  dias?: string[];        // DÍAS EN QUE SE NECESITA AL TRABAJADOR (SOLO EN EXPLORAR DEL CONTRATISTA)
  onDias?: (dias: string[]) => void;
};

export function FiltrosBusqueda({ estado, onEstado, orden, onOrden, opcionesOrden, precio, onPrecio, etiquetaPrecio, miEstado, dias, onDias }: Props) {
  const [abierto, setAbierto] = useState(false);
  const activos = (estado !== TODOS_LOS_ESTADOS ? 1 : 0) + (precio ? 1 : 0) + (dias?.length ? 1 : 0);
  const alternarDia = (d: string) => onDias?.(dias?.includes(d) ? dias.filter(x => x !== d) : [...(dias || []), d]);

  return (
    <View style={styles.caja}>
      <TouchableOpacity style={styles.cabecera} onPress={() => setAbierto(!abierto)}>
        <Ionicons name="options-outline" size={18} color="#0D2340" />
        <Text style={styles.cabeceraTexto}>
          Filtros y orden{activos > 0 ? ` (${activos} activo${activos > 1 ? 's' : ''})` : ''} • {opcionesOrden.find(o => o.valor === orden)?.texto}
        </Text>
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
      </TouchableOpacity>

      {abierto && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.etiqueta}>Ordenar por</Text>
          <View style={styles.pickerCaja}>
            <Picker selectedValue={orden} onValueChange={onOrden}>
              {opcionesOrden.map(o => <Picker.Item key={o.valor} label={o.texto} value={o.valor} />)}
            </Picker>
          </View>

          <Text style={styles.etiqueta}>Estado</Text>
          <View style={styles.pickerCaja}>
            <Picker selectedValue={estado} onValueChange={onEstado}>
              <Picker.Item label="Todo México" value={TODOS_LOS_ESTADOS} />
              {ESTADOS_MEXICO.map(e => <Picker.Item key={e} label={e} value={e} />)}
            </Picker>
          </View>
          {miEstado && estado !== miEstado ? (
            <TouchableOpacity style={styles.atajo} onPress={() => onEstado(miEstado)}>
              <Ionicons name="navigate-outline" size={14} color="#3B82F6" /><Text style={styles.atajoTexto}>Solo en mi estado ({miEstado})</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.etiqueta}>{etiquetaPrecio} (en pesos, opcional)</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ej. 3000" value={precio} onChangeText={t => onPrecio(t.replace(/[^0-9]/g, ''))} />

          {onDias && (
            <>
              <Text style={[styles.etiqueta, { marginTop: 10 }]}>Que esté disponible estos días (opcional)</Text>
              <View style={styles.dias}>
                {DIAS_SEMANA.map(d => (
                  <TouchableOpacity key={d} style={[styles.dia, dias?.includes(d) && styles.diaActivo]} onPress={() => alternarDia(d)}>
                    <Text style={[styles.diaTexto, dias?.includes(d) && { color: '#FFF' }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {activos > 0 && (
            <TouchableOpacity onPress={() => { onEstado(TODOS_LOS_ESTADOS); onPrecio(''); onDias?.([]); }}>
              <Text style={styles.limpiar}>Quitar filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { backgroundColor: '#FFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 15 },
  cabecera: { flexDirection: 'row', alignItems: 'center' },
  cabeceraTexto: { flex: 1, marginLeft: 8, fontSize: 13, fontWeight: 'bold', color: '#0D2340' },
  etiqueta: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 4 },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 8, overflow: 'hidden' },
  atajo: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  atajoTexto: { color: '#3B82F6', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 14, color: '#1F2937' },
  dias: { flexDirection: 'row', flexWrap: 'wrap' },
  dia: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginRight: 6, marginBottom: 6 },
  diaActivo: { backgroundColor: '#00A355', borderColor: '#00A355' },
  diaTexto: { fontSize: 12, fontWeight: 'bold', color: '#4B5563' },
  limpiar: { color: '#DC2626', fontWeight: 'bold', textAlign: 'center', marginTop: 12 },
});
