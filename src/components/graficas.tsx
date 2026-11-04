// GRÁFICAS SENCILLAS PARA LA ANALÍTICA DEL ADMIN, HECHAS CON VISTAS NORMALES (SIN LIBRERÍAS, FUNCIONAN EN EXPO GO).
//   GraficaPorDia:   BARRAS VERTICALES, UNA POR DÍA. AL TOCAR UNA BARRA SE VE SU VALOR.
//   BarrasHorizontales: CATEGORÍAS (OFICIOS, ESTADOS...) CON SU NÚMERO AL FINAL. HASTA 2 SERIES CON LEYENDA.
//   Indicador:       UN NÚMERO GRANDE CON SU ETIQUETA.
// COLORES: UNA SOLA SERIE = AZUL; DOS SERIES = AZUL Y NARANJA (PALETA VALIDADA PARA DALTONISMO). EL TEXTO VA EN GRIS/NEGRO.
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const COLOR_SERIE = ['#2a78d6', '#eb6834'];
const ALTO = 120;

export type PuntoDia = { etiqueta: string; etiquetaLarga: string; valor: number };

export function GraficaPorDia({ titulo, datos, unidad }: { titulo: string; datos: PuntoDia[]; unidad: string }) {
  const [tocado, setTocado] = useState<number | null>(null);
  const maximo = Math.max(1, ...datos.map(d => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const cada = Math.ceil(datos.length / 7); // NO MÁS DE ~7 ETIQUETAS ABAJO
  const elegido = tocado !== null ? datos[tocado] : null;
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.subtitulo}>
        {elegido ? `${elegido.etiquetaLarga}: ${elegido.valor} ${unidad}` : `Total: ${total} ${unidad} · toca una barra para ver el día`}
      </Text>
      <View style={styles.zona}>
        <Text style={styles.maximo}>{maximo}</Text>
        <View style={[styles.lineaGuia, { top: 0 }]} />
        <View style={styles.barras}>
          {datos.map((d, i) => (
            <TouchableOpacity key={i} style={styles.columna} activeOpacity={0.7} onPress={() => setTocado(tocado === i ? null : i)}>
              <View style={[styles.barra, { height: d.valor ? Math.max(3, (d.valor / maximo) * ALTO) : 0, backgroundColor: COLOR_SERIE[0], opacity: tocado === null || tocado === i ? 1 : 0.35 }]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.ejeX}>
        {datos.map((d, i) => (
          <Text key={i} style={styles.etiquetaX} numberOfLines={1}>{i % cada === 0 ? d.etiqueta : ''}</Text>
        ))}
      </View>
    </View>
  );
}

type Fila = { etiqueta: string; valores: number[] };

export function BarrasHorizontales({ titulo, subtitulo, filas, series }: { titulo: string; subtitulo?: string; filas: Fila[]; series: string[] }) {
  const maximo = Math.max(1, ...filas.flatMap(f => f.valores));
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>{titulo}</Text>
      {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
      {series.length > 1 && (
        <View style={styles.leyenda}>
          {series.map((s, i) => (
            <View key={s} style={styles.leyendaItem}><View style={[styles.leyendaColor, { backgroundColor: COLOR_SERIE[i] }]} /><Text style={styles.leyendaTexto}>{s}</Text></View>
          ))}
        </View>
      )}
      {filas.length === 0 ? <Text style={styles.subtitulo}>Todavía no hay datos.</Text> : filas.map(f => (
        <View key={f.etiqueta} style={styles.fila}>
          <Text style={styles.filaEtiqueta} numberOfLines={1}>{f.etiqueta}</Text>
          <View style={{ flex: 1 }}>
            {f.valores.map((v, i) => (
              <View key={i} style={styles.filaBarraCaja}>
                <View style={[styles.filaBarra, { width: `${(v / maximo) * 100}%`, backgroundColor: COLOR_SERIE[i] }]} />
                <Text style={styles.filaValor}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function Indicador({ valor, etiqueta, detalle }: { valor: string | number; etiqueta: string; detalle?: string }) {
  return (
    <View style={styles.indicador}>
      <Text style={styles.indicadorValor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      <Text style={styles.indicadorEtiqueta}>{etiqueta}</Text>
      {detalle ? <Text style={styles.indicadorDetalle}>{detalle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 14, elevation: 2, shadowColor: '#0D2340', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  subtitulo: { fontSize: 13, color: '#6B7280', marginTop: 2, marginBottom: 10 },
  zona: { height: ALTO, justifyContent: 'flex-end', borderBottomWidth: 1, borderColor: '#D1D5DB' },
  maximo: { position: 'absolute', top: -2, left: 0, fontSize: 11, color: '#9CA3AF' },
  lineaGuia: { position: 'absolute', left: 18, right: 0, height: 1, backgroundColor: '#F3F4F6' },
  barras: { flexDirection: 'row', alignItems: 'flex-end', height: ALTO, paddingLeft: 18 },
  columna: { flex: 1, height: ALTO, justifyContent: 'flex-end', paddingHorizontal: 1 },
  barra: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  ejeX: { flexDirection: 'row', paddingLeft: 18, marginTop: 4 },
  etiquetaX: { flex: 1, fontSize: 10, color: '#6B7280', overflow: 'visible' },
  leyenda: { flexDirection: 'row', marginBottom: 8 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  leyendaColor: { width: 12, height: 12, borderRadius: 3, marginRight: 5 },
  leyendaTexto: { fontSize: 13, color: '#374151' },
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  filaEtiqueta: { width: 110, fontSize: 13, color: '#374151', marginRight: 8 },
  filaBarraCaja: { flexDirection: 'row', alignItems: 'center', marginVertical: 1 },
  filaBarra: { height: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4, minWidth: 2 },
  filaValor: { fontSize: 12, color: '#374151', marginLeft: 6 },
  indicador: { width: '48%', backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 10, elevation: 2, shadowColor: '#0D2340', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  indicadorValor: { fontSize: 26, fontWeight: 'bold', color: '#0D2340' },
  indicadorEtiqueta: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 2 },
  indicadorDetalle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
