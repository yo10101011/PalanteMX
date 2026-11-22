// ANALÍTICA DE DATOS DEL PANEL DEL ADMIN: CÓMO SE USA PALANTEMX DÍA CON DÍA.
// USA LO QUE EL PANEL YA CARGÓ (USUARIOS, VACANTES, CONTRATOS, REPORTES) Y LEE LA ACTIVIDAD DIARIA (lib/actividad.ts).
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { db } from '../../firebaseConfig';
import { BarrasHorizontales, GraficaPorDia, Indicador, type PuntoDia } from '@/components/graficas';
import { claveDia, ESTADO_PAGO, ESTADOS } from '@/lib/contratos';

type Props = { trabajadores: any[]; contratistas: any[]; vacantes: any[]; contratos: any[]; quejas: any[] };

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const TIPOS_QUEJA: Record<string, string> = { cancelacion: 'Cancelaciones', bitacora: 'Bitácora', incumplimiento: 'Incumplimiento', pago: 'Pagos', cierre: 'Faltas al cerrar obra', otro: 'Chat y otros' };

// LAS FECHAS LLEGAN DE VARIAS FORMAS (TIMESTAMP DE FIRESTORE, TEXTO ISO O MILISEGUNDOS)
const aFecha = (v: any): Date | null => {
  if (!v) return null;
  const f = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(f.getTime()) ? null : f;
};

// LAS N CATEGORÍAS CON MÁS CASOS
const conteo = (lista: string[]) => {
  const mapa: Record<string, number> = {};
  lista.filter(Boolean).forEach(x => { mapa[x] = (mapa[x] || 0) + 1; });
  return mapa;
};

export function AnaliticaAdmin({ trabajadores, contratistas, vacantes, contratos, quejas }: Props) {
  const [rango, setRango] = useState<7 | 30>(7);
  const [actividad, setActividad] = useState<Record<string, number>>({});

  // LOS ÚLTIMOS N DÍAS, DEL MÁS VIEJO A HOY
  const hoy = new Date();
  const dias = Array.from({ length: rango }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (rango - 1 - i)));
  const claves = dias.map(claveDia);

  useEffect(() => {
    getDocs(query(collection(db, 'Actividad'), where('fecha', '>=', claves[0])))
      .then(snap => setActividad(conteo(snap.docs.map(d => d.data().fecha))))
      .catch(error => console.log('Error cargando actividad:', error));
  }, [rango]);

  // CUÁNTOS ELEMENTOS CAEN EN CADA DÍA DEL RANGO
  const porDia = (fechas: (Date | null)[]): PuntoDia[] => {
    const mapa = conteo(fechas.filter(Boolean).map(f => claveDia(f as Date)));
    return dias.map((d, i) => ({
      etiqueta: rango === 7 ? DIAS_CORTOS[d.getDay()] : String(d.getDate()),
      etiquetaLarga: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
      valor: mapa[claves[i]] || 0,
    }));
  };
  const activosPorDia: PuntoDia[] = porDia([]).map((p, i) => ({ ...p, valor: actividad[claves[i]] || 0 }));

  // INDICADORES
  const usuarios = [...trabajadores, ...contratistas];
  const enCurso = contratos.filter(c => c.estado === ESTADOS.ACTIVA || c.estado === ESTADOS.POR_CONFIRMAR_FIN).length;
  const aceptados = contratos.filter(c => c.timestamp_inicio).length;
  const terminados = contratos.filter(c => c.estado === ESTADOS.FINALIZADA).length;
  const dineroConfirmado = contratos.flatMap(c => c.pagos || []).filter((p: any) => p.estado === ESTADO_PAGO.RECIBIDO).reduce((s: number, p: any) => s + (p.monto || 0), 0);
  const calificados = usuarios.filter(u => Number(u.numero_resenas) > 0);
  const promedio = calificados.length ? calificados.reduce((s, u) => s + Number(u.calificacion || 0), 0) / calificados.length : 0;

  // OFICIOS: CUÁNTAS VACANTES LOS PIDEN (DEMANDA) CONTRA CUÁNTOS TRABAJADORES LOS OFRECEN (OFERTA)
  const demanda = conteo(vacantes.map(v => v.categoria));
  const oferta = conteo(trabajadores.map(t => t.oficio_principal));
  const oficios = [...new Set([...Object.keys(demanda), ...Object.keys(oferta)])]
    .sort((a, b) => (demanda[b] || 0) + (oferta[b] || 0) - (demanda[a] || 0) - (oferta[a] || 0)).slice(0, 8)
    .map(o => ({ etiqueta: o, valores: [demanda[o] || 0, oferta[o] || 0] }));

  const estados = Object.entries(conteo(usuarios.map(u => u.ubicacion_estado))).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([etiqueta, n]) => ({ etiqueta, valores: [n] }));

  const tipoQueja = (q: any) => q.tipo || (q.id_contrato && q.motivo === 'Cancelación de obra' ? 'cancelacion' : 'otro');
  // SE AGRUPA POR EL NOMBRE QUE SE MUESTRA (VARIOS TIPOS PUEDEN CAER EN "Chat y otros" Y NO DEBEN REPETIRSE)
  const quejasPorTipo = Object.entries(conteo(quejas.map(q => TIPOS_QUEJA[tipoQueja(q)] || 'Chat y otros'))).sort((a, b) => b[1] - a[1])
    .map(([etiqueta, n]) => ({ etiqueta, valores: [n] }));

  return (
    <View>
      <View style={styles.rango}>
        {([7, 30] as const).map(r => (
          <TouchableOpacity key={r} style={[styles.rangoBoton, rango === r && styles.rangoActivo]} onPress={() => setRango(r)}>
            <Text style={[styles.rangoTexto, rango === r && { color: '#FFF' }]}>Últimos {r} días</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.seccion}>Resumen</Text>
      <View style={styles.indicadores}>
        <Indicador valor={actividad[claveDia(hoy)] || 0} etiqueta="Activos hoy" detalle="Personas que abrieron la app" />
        <Indicador valor={usuarios.length} etiqueta="Usuarios" detalle={`${trabajadores.length} trabajadores · ${contratistas.length} contratistas`} />
        <Indicador valor={vacantes.filter(v => v.estado === 'Activa').length} etiqueta="Vacantes activas" detalle={`${vacantes.length} publicadas en total`} />
        <Indicador valor={enCurso} etiqueta="Obras en curso" detalle={`${terminados} terminadas`} />
        <Indicador valor={aceptados ? `${Math.round((terminados / aceptados) * 100)}%` : '—'} etiqueta="Obras terminadas" detalle="De las que llegaron a empezar" />
        <Indicador valor={`$${dineroConfirmado.toLocaleString('es-MX')}`} etiqueta="Pagos confirmados" detalle="Dinero que los trabajadores confirmaron" />
        <Indicador valor={quejas.filter(q => q.estado !== 'Resuelta').length} etiqueta="Reportes por resolver" detalle={`${quejas.length} en total`} />
        <Indicador valor={promedio ? promedio.toFixed(1) : '—'} etiqueta="Calificación promedio" detalle={`${calificados.length} perfiles con reseñas`} />
      </View>

      <Text style={styles.seccion}>Día con día</Text>
      <GraficaPorDia titulo="Usuarios activos por día" datos={activosPorDia} unidad="personas" />
      <GraficaPorDia titulo="Registros nuevos por día" datos={porDia(usuarios.map(u => aFecha(u.fecha_registro)))} unidad="registros" />
      <GraficaPorDia titulo="Vacantes publicadas por día" datos={porDia(vacantes.map(v => aFecha(v.fecha_publicacion)))} unidad="vacantes" />
      <GraficaPorDia titulo="Solicitudes y propuestas por día" datos={porDia(contratos.map(c => aFecha(c.timestamp)))} unidad="solicitudes" />
      <GraficaPorDia titulo="Obras que empezaron por día" datos={porDia(contratos.map(c => aFecha(c.timestamp_inicio)))} unidad="obras" />
      <GraficaPorDia titulo="Reportes por día" datos={porDia(quejas.map(q => aFecha(q.fecha_reporte)))} unidad="reportes" />

      <Text style={styles.seccion}>¿Qué se busca y dónde?</Text>
      <BarrasHorizontales titulo="Oficios: demanda contra oferta" subtitulo="Si la barra azul es más larga, faltan trabajadores de ese oficio." filas={oficios} series={['Vacantes que lo piden', 'Trabajadores que lo ofrecen']} />
      <BarrasHorizontales titulo="Usuarios por estado" filas={estados} series={['Usuarios']} />
      <BarrasHorizontales titulo="Reportes por tipo" filas={quejasPorTipo} series={['Reportes']} />
      <BarrasHorizontales titulo="De solicitud a obra terminada" subtitulo="Cuántas solicitudes llegan a cada paso." series={['Contratos']}
        filas={[{ etiqueta: 'Solicitudes', valores: [contratos.length] }, { etiqueta: 'Aceptadas', valores: [aceptados] }, { etiqueta: 'Terminadas', valores: [terminados] }]} />
      <Text style={styles.nota}>Los usuarios activos se empezaron a contar a partir de esta versión de la app; los días anteriores salen en cero.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rango: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 3, marginBottom: 14 },
  rangoBoton: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  rangoActivo: { backgroundColor: '#0D2340' },
  rangoTexto: { fontSize: 14, fontWeight: 'bold', color: '#374151' },
  seccion: { fontSize: 13, fontWeight: 'bold', color: '#6B7280', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  indicadores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 6 },
  nota: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 10 },
});
