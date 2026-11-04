// ELEGIR UN DÍA DE LOS PRÓXIMOS DOS MESES TOCANDO UNA FECHA (SIN TECLEAR, Y FUNCIONA EN EXPO GO).
// SE GUARDA COMO 'AAAA-MM-DD', IGUAL QUE LOS DÍAS DE LA BITÁCORA, PARA PODER COMPARARLOS.
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { claveDia } from '@/lib/contratos';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function SelectorFecha({ valor, onCambio, dias = 60 }: { valor: string; onCambio: (fecha: string) => void; dias?: number }) {
  const hoy = new Date();
  const fechas = Array.from({ length: dias }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      {fechas.map((f, i) => {
        const clave = claveDia(f);
        const elegido = clave === valor;
        return (
          <TouchableOpacity key={clave} style={[styles.dia, elegido && styles.diaElegido]} onPress={() => onCambio(clave)}>
            <Text style={[styles.semana, elegido && styles.blanco]}>{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS_CORTOS[f.getDay()]}</Text>
            <Text style={[styles.numero, elegido && styles.blanco]}>{f.getDate()}</Text>
            <Text style={[styles.mes, elegido && styles.blanco]}>{MESES_CORTOS[f.getMonth()]}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ width: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dia: { width: 62, alignItems: 'center', paddingVertical: 8, marginRight: 6, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  diaElegido: { backgroundColor: '#0D2340', borderColor: '#0D2340' },
  semana: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  numero: { fontSize: 19, color: '#0D2340', fontWeight: 'bold', marginVertical: 1 },
  mes: { fontSize: 12, color: '#6B7280' },
  blanco: { color: '#FFF' },
});
