// CUÁNDO SE TRABAJA EN UNA OBRA: EL DÍA QUE EMPIEZA, SI ES DE UN SOLO DÍA O DE VARIOS, QUÉ DÍAS DE LA SEMANA Y HASTA CUÁNDO.
// LA BITÁCORA SOLO SE PUEDE LLENAR EN ESOS DÍAS (VER motivoSinBitacora EN lib/contratos.ts).
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SelectorFecha } from '@/components/selector-fecha';
import { diaDeSemana, type DiasObra } from '@/lib/contratos';
import { DIAS_SEMANA } from '@/lib/ubicacion';

export function SelectorDiasObra({ valor, onCambio, diasAtras = 0 }: { valor: DiasObra; onCambio: (v: DiasObra) => void; diasAtras?: number }) {
  const unSoloDia = !!valor.inicio && valor.fin === valor.inicio;

  // AL ELEGIR "SOLO ESE DÍA", TERMINA EL MISMO DÍA Y SOLO CUENTA ESE DÍA DE LA SEMANA
  const elegirInicio = (inicio: string) => onCambio(unSoloDia
    ? { inicio, fin: inicio, dias: [diaDeSemana(inicio)] }
    : { ...valor, inicio, fin: valor.fin && valor.fin < inicio ? '' : valor.fin });
  const ponerUnSoloDia = (si: boolean) => onCambio(si
    ? { inicio: valor.inicio, fin: valor.inicio, dias: valor.inicio ? [diaDeSemana(valor.inicio)] : [] }
    : { inicio: valor.inicio, fin: '', dias: [] });
  const cambiarDia = (d: string) => onCambio({ ...valor, dias: valor.dias.includes(d) ? valor.dias.filter(x => x !== d) : DIAS_SEMANA.filter(x => x === d || valor.dias.includes(x)) });

  return (
    <View>
      <Text style={styles.etiqueta}>¿Qué día empieza la obra?</Text>
      <SelectorFecha valor={valor.inicio} onCambio={elegirInicio} diasAtras={diasAtras} />

      <Text style={styles.etiqueta}>¿Cuánto dura?</Text>
      <View style={styles.fila}>
        <TouchableOpacity style={[styles.opcion, unSoloDia && styles.opcionSi]} onPress={() => ponerUnSoloDia(true)}>
          <Text style={[styles.opcionTexto, unSoloDia && styles.blanco]}>Solo ese día</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.opcion, !unSoloDia && styles.opcionSi]} onPress={() => ponerUnSoloDia(false)}>
          <Text style={[styles.opcionTexto, !unSoloDia && styles.blanco]}>Varios días</Text>
        </TouchableOpacity>
      </View>

      {!unSoloDia && (
        <>
          <Text style={styles.etiqueta}>¿Qué días de la semana se trabaja?</Text>
          <View style={[styles.fila, { justifyContent: 'space-between' }]}>
            {DIAS_SEMANA.map(d => (
              <TouchableOpacity key={d} style={[styles.dia, valor.dias.includes(d) && styles.opcionSi]} onPress={() => cambiarDia(d)}>
                <Text style={[styles.diaTexto, valor.dias.includes(d) && styles.blanco]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.etiqueta}>¿Hasta qué día? (si no sabes, déjalo sin fecha)</Text>
          <TouchableOpacity style={[styles.opcion, { alignSelf: 'flex-start', marginBottom: 8 }, !valor.fin && styles.opcionSi]} onPress={() => onCambio({ ...valor, fin: '' })}>
            <Text style={[styles.opcionTexto, !valor.fin && styles.blanco]}>Sin fecha de fin</Text>
          </TouchableOpacity>
          <SelectorFecha valor={valor.fin} onCambio={fin => onCambio({ ...valor, fin: valor.inicio && fin < valor.inicio ? valor.inicio : fin })} dias={120} diasAtras={diasAtras} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: { fontSize: 15, fontWeight: 'bold', color: '#374151', marginBottom: 6 },
  fila: { flexDirection: 'row', marginBottom: 12 },
  opcion: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: '#F9FAFB' },
  opcionSi: { backgroundColor: '#0D2340', borderColor: '#0D2340' },
  opcionTexto: { fontSize: 14, fontWeight: '600', color: '#374151' },
  blanco: { color: '#FFF' },
  dia: { width: 42, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  diaTexto: { fontSize: 13, fontWeight: 'bold', color: '#374151' },
});
