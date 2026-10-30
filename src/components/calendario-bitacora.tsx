// CALENDARIO DEL MES CON CADA DÍA DE LA BITÁCORA PINTADO SEGÚN SU ESTADO (CONFIRMADO, POR REVISAR, EN DISPUTA...).
// AL TOCAR UN DÍA REGISTRADO SE SELECCIONA (LA BITÁCORA MUESTRA SOLO ESE DÍA); TOCARLO OTRA VEZ QUITA LA SELECCIÓN.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { claveDia, estiloDia } from '@/lib/contratos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type Props = {
  entradas: any[]; // DÍAS DE LA BITÁCORA (CADA UNO CON SU CLAVE "dia" = AAAA-MM-DD)
  seleccionado: string | null;
  onSeleccionar: (dia: string | null) => void;
};

export function CalendarioBitacora({ entradas, seleccionado, onSeleccionar }: Props) {
  // EMPIEZA EN EL MES DEL ÚLTIMO REGISTRO (O EN EL MES ACTUAL SI NO HAY)
  const [mes, setMes] = useState(() => new Date());
  const ultimo = entradas[entradas.length - 1]?.timestamp;
  useEffect(() => { if (ultimo) setMes(new Date(ultimo)); }, [ultimo]);

  const porDia: Record<string, any> = {};
  entradas.forEach(e => { porDia[e.dia] = e; });

  // CUADRÍCULA: HUECOS ANTES DEL DÍA 1 (LA SEMANA EMPIEZA EN LUNES) Y LUEGO LOS DÍAS DEL MES
  const año = mes.getFullYear();
  const numMes = mes.getMonth();
  const huecos = (new Date(año, numMes, 1).getDay() + 6) % 7;
  const diasDelMes = new Date(año, numMes + 1, 0).getDate();
  const celdas: (number | null)[] = [...Array(huecos).fill(null), ...Array.from({ length: diasDelMes }, (_, i) => i + 1)];
  while (celdas.length % 7 !== 0) celdas.push(null);
  const hoy = claveDia(new Date());

  return (
    <View style={styles.caja}>
      <View style={styles.encabezado}>
        <TouchableOpacity onPress={() => setMes(new Date(año, numMes - 1, 1))} style={styles.flecha}><Ionicons name="chevron-back" size={22} color="#0D2340" /></TouchableOpacity>
        <Text style={styles.mes}>{MESES[numMes]} {año}</Text>
        <TouchableOpacity onPress={() => setMes(new Date(año, numMes + 1, 1))} style={styles.flecha}><Ionicons name="chevron-forward" size={22} color="#0D2340" /></TouchableOpacity>
      </View>

      <View style={styles.fila}>
        {DIAS_SEMANA.map((d, i) => <Text key={i} style={styles.diaSemana}>{d}</Text>)}
      </View>

      {Array.from({ length: celdas.length / 7 }, (_, semana) => (
        <View key={semana} style={styles.fila}>
          {celdas.slice(semana * 7, semana * 7 + 7).map((numero, i) => {
            if (numero === null) return <View key={i} style={styles.celda} />;
            const clave = claveDia(new Date(año, numMes, numero));
            const entrada = porDia[clave];
            const color = entrada ? estiloDia(entrada).color : null;
            return (
              <TouchableOpacity key={i} style={styles.celda} disabled={!entrada} onPress={() => onSeleccionar(seleccionado === clave ? null : clave)}>
                <View style={[
                  styles.circulo,
                  color ? { backgroundColor: color } : null,
                  clave === hoy && !color ? styles.hoy : null,
                  seleccionado === clave ? styles.seleccionado : null,
                ]}>
                  <Text style={[styles.numero, color ? { color: '#FFF', fontWeight: 'bold' } : null]}>{numero}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={styles.leyenda}>
        {[['#00D06C', 'Confirmado'], ['#F59E0B', 'Por revisar'], ['#EA580C', 'En disputa'], ['#DC2626', 'Descontado'], ['#9CA3AF', 'Faltó']].map(([color, texto]) => (
          <View key={texto} style={styles.leyendaItem}><View style={[styles.leyendaPunto, { backgroundColor: color }]} /><Text style={styles.leyendaTexto}>{texto}</Text></View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { backgroundColor: '#FFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 15 },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  flecha: { padding: 6 },
  mes: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  fila: { flexDirection: 'row' },
  diaSemana: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 'bold', color: '#9CA3AF', marginBottom: 4 },
  celda: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  circulo: { width: '82%', aspectRatio: 1, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  hoy: { borderWidth: 1.5, borderColor: '#0D2340' },
  seleccionado: { borderWidth: 3, borderColor: '#0D2340' },
  numero: { fontSize: 15, color: '#374151' },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, borderTopWidth: 1, borderColor: '#F3F4F6', paddingTop: 8 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4 },
  leyendaPunto: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  leyendaTexto: { fontSize: 13, color: '#6B7280' },
});
