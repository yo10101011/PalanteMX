// PERFIL PÚBLICO DE UN TRABAJADOR: LO VEN EL CONTRATISTA (EXPLORAR, SOLICITUDES, OBRAS) Y EL ADMIN.
// MUESTRA SUS DATOS, LAS OBRAS QUE TERMINÓ EN PALANTEMX (CON FOTOS DE SU BITÁCORA), SU PORTAFOLIO Y SUS RESEÑAS.
// EL CONTENIDO VA DENTRO DE UN ScrollView QUE PONE QUIEN LO USA.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VisorFoto } from '@/components/visor-foto';
import { DIAS_SEMANA, textoDias, textoPrecio } from '@/lib/ubicacion';

type Props = {
  trabajador: any;
  distancia?: string;                         // P. EJ. "a 12 km" (DESDE QUIEN LO VE)
  onEliminarObra?: (obra: any) => void;       // SOLO EL ADMIN PUEDE BORRAR OBRAS DEL PORTAFOLIO
  obrasEnCurso?: any[];                       // CONTRATOS QUE AÚN NO TERMINA (SOLO EL ADMIN PUEDE VERLOS)
  onEliminarObraPalante?: (obra: any) => void; // SOLO EL ADMIN: QUITAR UNA OBRA TERMINADA EN PALANTEMX
  onEliminarResena?: (resena: any) => void;    // SOLO EL ADMIN: BORRAR UNA RESEÑA (LA CALIFICACIÓN SE RECALCULA)
};

// QUITA DEL PORTAFOLIO SOLO LA OBRA INDICADA (LA PRIMERA IGUAL A ELLA). NO SE COMPARA SOLO POR id_obra PORQUE LAS
// OBRAS VIEJAS NO LO TIENEN: SI SE COMPARARA ASÍ, TODAS LAS QUE NO TIENEN id SE BORRARÍAN JUNTAS.
export const quitarUnaObra = (portafolio: any[], obra: any) => {
  const igual = (o: any) => o && (obra.id_obra ? o.id_obra === obra.id_obra : JSON.stringify(o) === JSON.stringify(obra));
  const indice = portafolio.findIndex(igual);
  return indice === -1 ? portafolio : portafolio.filter((_, i) => i !== indice);
};

export function PerfilTrabajador({ trabajador: t, distancia, onEliminarObra, obrasEnCurso, onEliminarObraPalante, onEliminarResena }: Props) {
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const obrasPalante: any[] = [...(t?.obras_realizadas || [])].reverse();
  const portafolio: any[] = (t?.portafolio || []).filter((o: any) => o && typeof o === 'object');
  const resenas: any[] = [...(t?.resenas || [])].reverse();
  const ubicacion = [t?.ubicacion_texto, t?.ubicacion_estado].filter(Boolean).join(', ');

  return (
    <View>
      {/* DATOS PRINCIPALES */}
      <View style={[styles.tarjeta, { alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => t?.foto_rostro_url && setFotoGrande(t.foto_rostro_url)}>
          <Image source={{ uri: t?.foto_rostro_url || undefined }} style={styles.foto} />
        </TouchableOpacity>
        <Text style={styles.nombre}>{t?.nombre} {t?.apellidos}</Text>
        <Text style={styles.oficio}>{t?.oficio_principal || 'Trabajador General'}</Text>
        <View style={[styles.estadoDisp, { backgroundColor: t?.disponibilidad === 'Ocupado' ? '#FEF3C7' : '#D1FAE5' }]}>
          <View style={[styles.punto, { backgroundColor: t?.disponibilidad === 'Ocupado' ? '#F59E0B' : '#059669' }]} />
          <Text style={{ color: t?.disponibilidad === 'Ocupado' ? '#B45309' : '#059669', fontWeight: 'bold', fontSize: 14 }}>{t?.disponibilidad === 'Ocupado' ? 'OCUPADO EN OTRA OBRA' : 'DISPONIBLE PARA TRABAJAR'}</Text>
        </View>

        {/* DATOS EN FILAS ORDENADAS: ÍCONO, Y LA ETIQUETA CHIQUITA ENCIMA DEL VALOR */}
        <View style={styles.datos}>
          {([
            ['location', '#DC2626', 'Ubicación', `${ubicacion || 'Sin ubicación'}${distancia ? ` (${distancia})` : ''}`],
            ['cash', '#059669', 'Precio', textoPrecio(t?.tarifa_monto, t?.tarifa_periodo)],
            ['calendar', '#D97706', 'Días disponibles', textoDias(t?.dias_disponibles)],
          ] as const).map(([icono, color, etiqueta, valor], i) => (
            <View key={etiqueta} style={[styles.filaDato, i > 0 && styles.filaDatoBorde]}>
              <View style={[styles.iconoDato, { backgroundColor: `${color}15` }]}><Ionicons name={icono} size={16} color={color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
                <Text style={styles.datoValor} numberOfLines={2}>{valor}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statNumero}>{t?.calificacion || '0.0'}</Text><Text style={styles.statTexto}>Calificación</Text></View>
          <View style={styles.stat}><Text style={styles.statNumero}>{t?.numero_resenas || 0}</Text><Text style={styles.statTexto}>Reseñas</Text></View>
          <View style={styles.stat}><Text style={styles.statNumero}>{obrasPalante.length + portafolio.length}</Text><Text style={styles.statTexto}>Obras</Text></View>
        </View>
      </View>

      {obrasEnCurso && (
        <>
          <Text style={styles.seccion}>Obras en proceso ({obrasEnCurso.length})</Text>
          {obrasEnCurso.length === 0 ? <Text style={styles.vacio}>No tiene obras en proceso ahorita.</Text> : obrasEnCurso.map(c => (
            <View key={c.id} style={[styles.tarjeta, { borderLeftWidth: 5, borderLeftColor: '#F59E0B' }]}>
              <Text style={styles.obraTitulo}>{c.titulo_vacante}</Text>
              <Text style={styles.obraDato}>Para: {c.contratista || c.vacante?.contratista} · {c.estado === 'Suspendida' ? 'SUSPENDIDA (en revisión)' : c.estado === 'Por confirmar fin' ? 'Esperando confirmar que terminó' : 'EN PROCESO, aún no termina'}</Text>
              {c.fecha_inicio ? <Text style={styles.obraDato}>Empezó: {c.fecha_inicio}</Text> : null}
            </View>
          ))}
        </>
      )}

      {/* OBRAS TERMINADAS DENTRO DE PALANTEMX (LAS AGREGA EL SERVIDOR AL FINALIZAR CADA CONTRATO) */}
      <Text style={styles.seccion}>Obras terminadas en PalanteMX ({obrasPalante.length})</Text>
      {obrasPalante.length === 0 ? <Text style={styles.vacio}>Todavía no termina obras dentro de PalanteMX.</Text> : obrasPalante.map((obra, i) => (
        <View key={i} style={[styles.tarjeta, { padding: 0, overflow: 'hidden' }]}>
          {onEliminarObraPalante && (
            <TouchableOpacity style={styles.borrar} onPress={() => onEliminarObraPalante(obra)}><Ionicons name="trash" size={18} color="#FFF" /></TouchableOpacity>
          )}
          {obra.foto_trabajo ? <TouchableOpacity onPress={() => setFotoGrande(obra.foto_trabajo)}><Image source={{ uri: obra.foto_trabajo }} style={styles.fotoObra} /></TouchableOpacity> : null}
          <View style={{ padding: 14 }}>
            <Text style={styles.obraTitulo}>{obra.titulo}</Text>
            <Text style={styles.obraDato}>Para: {obra.contratista}{obra.ubicacion ? ` • ${obra.ubicacion}` : ''}</Text>
            <Text style={styles.obraDato}>Del {obra.fecha_inicio || '—'} al {obra.fecha_fin}</Text>
            {obra.dias_trabajados ? <Text style={[styles.obraDato, { color: '#059669', fontWeight: 'bold' }]}>{obra.dias_trabajados} días trabajados ({obra.dias_confirmados || 0} confirmados por el contratista)</Text> : null}
            {obra.fotos?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {obra.fotos.map((f: string, j: number) => (
                  <TouchableOpacity key={j} onPress={() => setFotoGrande(f)}><Image source={{ uri: f }} style={styles.miniatura} /></TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ))}

      {/* PORTAFOLIO QUE SUBIÓ EL TRABAJADOR (TRABAJOS DE ANTES O FUERA DE LA PLATAFORMA) */}
      <Text style={styles.seccion}>Portafolio ({portafolio.length})</Text>
      {portafolio.length === 0 ? <Text style={styles.vacio}>Todavía no sube fotos de trabajos anteriores.</Text> : portafolio.map((obra, i) => (
        <View key={i} style={[styles.tarjeta, { padding: 0, overflow: 'hidden' }]}>
          {onEliminarObra && (
            <TouchableOpacity style={styles.borrar} onPress={() => onEliminarObra(obra)}><Ionicons name="trash" size={18} color="#FFF" /></TouchableOpacity>
          )}
          {(obra.foto_antes || obra.foto_despues) && (
            <View style={{ flexDirection: 'row', height: 140 }}>
              {obra.foto_antes ? <TouchableOpacity style={{ flex: 1 }} onPress={() => setFotoGrande(obra.foto_antes)}><Image source={{ uri: obra.foto_antes }} style={styles.mitad} /><View style={styles.etiqueta}><Text style={styles.etiquetaTexto}>Antes</Text></View></TouchableOpacity> : null}
              {obra.foto_despues ? <TouchableOpacity style={{ flex: 1 }} onPress={() => setFotoGrande(obra.foto_despues)}><Image source={{ uri: obra.foto_despues }} style={styles.mitad} /><View style={styles.etiqueta}><Text style={styles.etiquetaTexto}>Después</Text></View></TouchableOpacity> : null}
            </View>
          )}
          <View style={{ padding: 14 }}>
            <Text style={styles.obraTitulo}>{obra.titulo}</Text>
            <Text style={styles.obraDato}>{obra.lugar}{obra.estado ? ` • ${obra.estado}` : ''}</Text>
            {obra.descripcion ? <Text style={[styles.obraDato, { color: '#4B5563' }]}>{obra.descripcion}</Text> : null}
          </View>
        </View>
      ))}

      <Text style={styles.seccion}>Reseñas ({resenas.length})</Text>
      {resenas.length === 0 ? <Text style={styles.vacio}>Todavía no tiene reseñas.</Text> : resenas.map((r, i) => (
        <View key={i} style={styles.tarjeta}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={{ uri: r.evaluador_foto || undefined }} style={styles.fotoResena} />
            {onEliminarResena && (
              <TouchableOpacity style={[styles.borrar, { top: 0, right: 0 }]} onPress={() => onEliminarResena(r)}><Ionicons name="trash" size={16} color="#FFF" /></TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.obraTitulo}>{r.evaluador_nombre}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {[...Array(5)].map((_, k) => <Ionicons key={k} name={k < r.estrellas ? 'star' : 'star-outline'} size={12} color="#F59E0B" />)}
                <Text style={styles.obraDato}> • {r.fecha}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.comentario}>"{r.comentario}"</Text>
        </View>
      ))}

      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  foto: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E5E7EB', borderWidth: 3, borderColor: '#F3F4F6' },
  nombre: { fontSize: 21, fontWeight: 'bold', color: '#0D2340', marginTop: 8, textAlign: 'center' },
  oficio: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  precio: { fontSize: 17, color: '#00A355', fontWeight: 'bold', marginTop: 4 },
  estadoDisp: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  punto: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'stretch', justifyContent: 'center' },
  filaTexto: { fontSize: 15, color: '#0D2340', marginLeft: 5, fontWeight: '600', flexShrink: 1 },
  dias: { flexDirection: 'row', marginTop: 8 },
  dia: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, marginHorizontal: 2, backgroundColor: '#F3F4F6' },
  diaSi: { backgroundColor: '#00A355' },
  diaTexto: { fontSize: 13, fontWeight: 'bold', color: '#9CA3AF' },
  datos: { alignSelf: 'stretch', marginTop: 14, backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 12, elevation: 2, shadowColor: '#0D2340', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  filaDato: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  filaDatoBorde: { borderTopWidth: 1, borderColor: '#F3F4F6' },
  iconoDato: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  datoEtiqueta: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.3 },
  datoValor: { fontSize: 14, color: '#0D2340', fontWeight: '600', marginTop: 1 },
  stats: { flexDirection: 'row', marginTop: 12, backgroundColor: '#F9FAFB', borderRadius: 12, paddingVertical: 10, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center' },
  statNumero: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  statTexto: { fontSize: 13, color: '#9CA3AF', fontWeight: 'bold' },
  seccion: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginTop: 8, marginBottom: 10 },
  vacio: { color: '#9CA3AF', textAlign: 'center', marginBottom: 12 },
  fotoObra: { width: '100%', height: 150, backgroundColor: '#E5E7EB' },
  obraTitulo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  obraDato: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  miniatura: { width: 70, height: 70, borderRadius: 8, marginRight: 8, backgroundColor: '#E5E7EB' },
  mitad: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  etiqueta: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  etiquetaTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  borrar: { position: 'absolute', top: 8, right: 8, zIndex: 5, backgroundColor: 'rgba(220,38,38,0.9)', padding: 7, borderRadius: 16 },
  fotoResena: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: '#E5E7EB' },
  comentario: { fontSize: 15, color: '#4B5563', fontStyle: 'italic', marginTop: 8 },
});
