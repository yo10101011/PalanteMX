// PANEL DEL ADMIN → DATOS → "ANÁLISIS": LOS DOS MODELOS DE APRENDIZAJE AUTOMÁTICO.
//   1) ZONAS CON NECESIDAD: AGRUPAMIENTO JERÁRQUICO DE WARD (lib/agrupamiento.ts)
//   2) CONFIANZA DE LOS TRABAJADORES: ÁRBOL DE DECISIÓN (lib/arbol-confianza.ts, ENTRENADO EN scripts/analisis)
// ANALÍTICA EN LA NUBE: LOS DOS LOS CALCULA EL SERVIDOR (CLOUDFLARE WORKERS) TODOS LOS DÍAS A LAS 9 AM Y GUARDA EL
// RESULTADO EN Sistema/Analisis; AQUÍ SOLO SE MUESTRA. EL BOTÓN "CALCULAR AHORA EN LA NUBE" LE PIDE AL SERVIDOR QUE LO
// HAGA AL MOMENTO. SI EL SERVIDOR TODAVÍA NO HA GENERADO EL ANÁLISIS, SE CALCULA AQUÍ CON EL MISMO CÓDIGO.
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { db } from '../../firebaseConfig';
import { zonasConNecesidad, NOMBRES_GRUPOS_OFICIOS, type GrupoZonas } from '@/lib/agrupamiento';
import { confianzaDe, TEXTO_MODELO, type NivelConfianza } from '@/lib/confianza';
import { adminPerfiles } from '@/lib/contratos';
import { ENTRENADO } from '@/lib/modelo-confianza';

type Props = { trabajadores: any[]; vacantes: any[]; onActualizado?: () => Promise<void> | void };
type AnalisisNube = { actualizado: string; trabajadores: number; vacantes: number; niveles_confianza: Record<NivelConfianza, number>; zonas: GrupoZonas[] };

// UN COLOR FIJO POR GRUPO (EL 1 SIEMPRE ES EL DE MÁS PRESIÓN), SIEMPRE CON SU NÚMERO Y NOMBRE ESCRITOS
const COLORES_GRUPO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#6250d6', '#e87ba4'];
const NIVELES: { nivel: NivelConfianza; texto: string; color: string }[] = [
  { nivel: 'Alta', texto: 'Confianza alta', color: '#047857' },
  { nivel: 'Media', texto: 'Confianza media', color: '#B45309' },
  { nivel: 'Baja', texto: 'Confianza baja', color: '#B91C1C' },
  { nivel: 'Nuevo', texto: 'Nuevos (sin obras)', color: '#1D4ED8' },
];

const fechaHora = (iso: string) => {
  const f = new Date(iso);
  return isNaN(f.getTime()) ? '' : `${f.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}, ${f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

export function AnalisisDatos({ trabajadores, vacantes, onActualizado }: Props) {
  const [nube, setNube] = useState<AnalisisNube | null>(null);
  const [cargando, setCargando] = useState(true);
  const [calculando, setCalculando] = useState(false);

  const leerNube = async () => {
    try {
      const d = await getDoc(doc(db, 'Sistema', 'Analisis'));
      setNube(d.exists() ? (d.data() as AnalisisNube) : null);
    } catch { setNube(null); }
    setCargando(false);
  };
  useEffect(() => { leerNube(); }, []);

  const calcularEnLaNube = async () => {
    setCalculando(true);
    try {
      const r = await adminPerfiles('analisis');
      await leerNube();
      await onActualizado?.();
      Alert.alert('Análisis actualizado', `El servidor recalculó la confianza de los trabajadores (${r.perfiles_actualizados ?? 0} perfiles cambiaron) y agrupó las zonas en ${r.grupos ?? 0} grupos.`);
    } catch (error: any) { Alert.alert('No se pudo', error?.message || 'Intenta de nuevo.'); }
    setCalculando(false);
  };

  // RESULTADO DE LA NUBE; SI AÚN NO EXISTE, EL MISMO CÁLCULO AQUÍ
  const activos = trabajadores.filter(t => t.estado_cuenta !== 'Bloqueada');
  const grupos: GrupoZonas[] = nube?.zonas ?? zonasConNecesidad(vacantes, trabajadores);
  const porNivel = NIVELES.map(n => ({
    ...n,
    cantidad: nube?.niveles_confianza ? (nube.niveles_confianza[n.nivel] || 0) : activos.filter(t => confianzaDe(t).nivel === n.nivel).length,
  }));
  const maximo = Math.max(1, ...porNivel.map(n => n.cantidad));

  if (cargando) return <ActivityIndicator size="large" color="#0D2340" style={{ marginTop: 30 }} />;

  return (
    <View>
      {/* ---------------------------------------------------------------- ORIGEN DEL CÁLCULO */}
      <View style={styles.tarjeta}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Ionicons name="cloud-outline" size={20} color="#0D2340" />
          <Text style={[styles.grupoTitulo, { marginLeft: 8 }]}>Analítica en la nube</Text>
        </View>
        {nube ? (
          <>
            <View style={styles.filaDato}><Text style={styles.etiqueta}>Calculado por</Text><Text style={styles.valor}>Servidor (Cloudflare Workers)</Text></View>
            <View style={styles.filaDato}><Text style={styles.etiqueta}>Última vez</Text><Text style={styles.valor}>{fechaHora(nube.actualizado)}</Text></View>
            <View style={styles.filaDato}><Text style={styles.etiqueta}>Datos analizados</Text><Text style={styles.valor}>{nube.trabajadores} trabajadores · {nube.vacantes} vacantes</Text></View>
            <View style={styles.filaDato}><Text style={styles.etiqueta}>Frecuencia</Text><Text style={styles.valor}>Todos los días, 9:00 h</Text></View>
          </>
        ) : (
          <Text style={styles.explica}>El servidor todavía no genera el análisis; lo que ves abajo se calculó en este teléfono con el mismo método.</Text>
        )}
        <TouchableOpacity style={[styles.boton, calculando && { opacity: 0.6 }]} disabled={calculando} onPress={calcularEnLaNube}>
          {calculando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonTexto}>Calcular ahora en la nube</Text>}
        </TouchableOpacity>
      </View>

      {/* ---------------------------------------------------------------- ZONAS */}
      <Text style={styles.seccion}>Zonas con necesidad de trabajadores</Text>
      <View style={styles.tarjeta}>
        <Text style={styles.explica}>
          Agrupamiento jerárquico (método de Ward): junta los municipios que se parecen en cuántas vacantes hay por cada trabajador
          de {NOMBRES_GRUPOS_OFICIOS.length} grupos de oficios. Solo municipios con 4 vacantes o más.
        </Text>
      </View>
      {grupos.length === 0 && <Text style={styles.vacio}>Todavía no hay suficientes vacantes para agrupar zonas.</Text>}
      {grupos.map(g => (
        <View key={g.numero} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: COLORES_GRUPO[(g.numero - 1) % COLORES_GRUPO.length] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={[styles.punto, { backgroundColor: COLORES_GRUPO[(g.numero - 1) % COLORES_GRUPO.length] }]} />
            <Text style={styles.grupoTitulo}>Grupo {g.numero}: {g.nombre}</Text>
          </View>
          {g.zonas.map(z => (
            <View key={z.zona} style={styles.filaZona}>
              <Text style={styles.zona} numberOfLines={1}>{z.zona}</Text>
              <Text style={styles.zonaDato}>{z.vacantes} vacantes · {z.trabajadores} trabajadores</Text>
            </View>
          ))}
          <Text style={styles.presion}>
            Vacantes por trabajador (promedio): {NOMBRES_GRUPOS_OFICIOS.map((n, i) => `${n.toLowerCase()} ${g.presionMedia[i]}`).join(' · ')}
          </Text>
        </View>
      ))}

      {/* ---------------------------------------------------------------- CONFIANZA */}
      <Text style={[styles.seccion, { marginTop: 14 }]}>Confianza de los trabajadores</Text>
      <View style={styles.tarjeta}>
        <Text style={styles.explica}>{TEXTO_MODELO} Exactitud balanceada en validación cruzada: {Math.round(ENTRENADO.exactitud_balanceada * 100)} %.</Text>
        {porNivel.map(n => (
          <View key={n.nivel} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.nivelTexto}>{n.texto}</Text>
              <Text style={styles.nivelTexto}>{n.cantidad}</Text>
            </View>
            <View style={styles.barraFondo}><View style={[styles.barra, { width: `${(n.cantidad / maximo) * 100}%`, backgroundColor: n.color }]} /></View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={[styles.explica, { flex: 1, marginLeft: 4 }]}>Nivel a una distancia típica de 10 km. El servidor recalcula el cumplimiento y la confianza de cada trabajador todos los días a las 9:00 h.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { fontSize: 13, fontWeight: 'bold', color: '#6B7280', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  tarjeta: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  explica: { fontSize: 13, color: '#4B5563', lineHeight: 19 },
  vacio: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginVertical: 10 },
  punto: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  grupoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#0D2340', flex: 1 },
  filaDato: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  etiqueta: { fontSize: 13, color: '#6B7280' },
  valor: { fontSize: 13, color: '#111827', fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 10 },
  boton: { backgroundColor: '#0D2340', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  botonTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  filaZona: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  zona: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  zonaDato: { fontSize: 13, color: '#6B7280' },
  presion: { fontSize: 12, color: '#6B7280', marginTop: 8 },
  nivelTexto: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
  barraFondo: { height: 10, backgroundColor: '#F3F4F6', borderRadius: 5, marginTop: 4, overflow: 'hidden' },
  barra: { height: 10, borderRadius: 5 },
});
