// TARJETA DE UN CONTRATO (OBRA): QUIÉN ES LA OTRA PARTE, LA VACANTE, SU ESTADO Y LOS BOTONES QUE TOQUEN.
// LA USAN LOS PANELES DEL TRABAJADOR Y DEL CONTRATISTA, CADA UNO CON SUS PROPIOS BOTONES.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VisorFoto } from '@/components/visor-foto';
import { VistaCondiciones } from '@/components/condiciones-obra';
import { ajustesDePago, estiloEstado, pagosPorConfirmar, textoDiasObra, tieneReporteAbierto } from '@/lib/contratos';

export type BotonContrato = {
  texto: string;
  icono: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  relleno?: boolean; // true = botón de color sólido; false = solo borde
};

type Props = {
  contrato: any;
  otraParte: { nombre: string; foto?: string; detalle?: string };
  aviso?: string; // TEXTO DESTACADO (P. EJ. "ESPERANDO A QUE EL TRABAJADOR ACEPTE")
  botones: BotonContrato[];
  deshabilitado?: boolean;
};

export function TarjetaContrato({ contrato, otraParte, aviso, botones, deshabilitado }: Props) {
  const estado = estiloEstado(contrato.estado);
  const vacante = contrato.vacante || {};
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);

  return (
    <View style={[styles.tarjeta, { borderLeftColor: estado.color }]}>
      <View style={styles.encabezado}>
        <TouchableOpacity onPress={() => otraParte.foto && setFotoGrande(otraParte.foto)}>
          <Image source={{ uri: otraParte.foto || undefined }} style={styles.foto} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={2}>{contrato.titulo_vacante || vacante.titulo}</Text>
          <Text style={styles.subtitulo} numberOfLines={1}>{otraParte.nombre}{otraParte.detalle ? ` • ${otraParte.detalle}` : ''}</Text>
        </View>
      </View>

      <View style={[styles.etiqueta, { backgroundColor: estado.color }]}>
        <Text style={styles.etiquetaTexto}>{estado.texto}</Text>
      </View>

      {/* FOTO DE LA OBRA: SE TOCA PARA VERLA COMPLETA */}
      {vacante.foto_trabajo ? (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setFotoGrande(vacante.foto_trabajo)}>
          <Image source={{ uri: vacante.foto_trabajo }} style={styles.fotoObra} />
          <View style={styles.fotoAviso}><Ionicons name="expand-outline" size={12} color="#FFF" /><Text style={styles.fotoAvisoTexto}>Toca para ver completa</Text></View>
        </TouchableOpacity>
      ) : null}

      {(vacante.ubicacion || vacante.pago || vacante.horario || vacante.descripcion || contrato.inicio_obra) ? (
        <View style={styles.detalles}>
          {vacante.ubicacion ? <View style={styles.fila}><Ionicons name="location-outline" size={14} color="#6B7280" /><Text style={styles.detalleTexto}>{vacante.ubicacion}</Text></View> : null}
          {vacante.pago ? <View style={styles.fila}><Ionicons name="cash-outline" size={14} color="#00D06C" /><Text style={[styles.detalleTexto, { color: '#00D06C', fontWeight: 'bold' }]}>{vacante.pago}</Text></View> : null}
          {vacante.horario ? <View style={styles.fila}><Ionicons name="time-outline" size={14} color="#B45309" /><Text style={styles.detalleTexto}>{vacante.horario}</Text></View> : null}
          {contrato.inicio_obra ? <View style={styles.fila}><Ionicons name="calendar-outline" size={14} color="#1D4ED8" /><Text style={[styles.detalleTexto, { color: '#1D4ED8', fontWeight: 'bold' }]}>{textoDiasObra(contrato)}</Text></View> : null}
          {contrato.fecha_inicio ? <View style={styles.fila}><Ionicons name="calendar-outline" size={14} color="#6B7280" /><Text style={styles.detalleTexto}>Trato cerrado: {contrato.fecha_inicio}{contrato.fecha_fin ? ` • Terminó: ${contrato.fecha_fin}` : ''}</Text></View> : null}
          {vacante.lugar_texto ? <View style={styles.fila}><Ionicons name="pin-outline" size={14} color="#DC2626" /><Text style={styles.detalleTexto}>Lugar de la obra: {vacante.lugar_texto}</Text></View> : null}
          {vacante.descripcion ? <Text style={styles.descripcion}>{vacante.descripcion}</Text> : null}
        </View>
      ) : null}
      <VistaCondiciones condiciones={vacante.condiciones} titulo="Lo que prometió el contratista al publicar" />

      {aviso ? <Text style={[styles.aviso, { color: estado.color }]}>{aviso}</Text> : null}

      {/* MIENTRAS EL ADMIN REVISA UN REPORTE DE ESTA OBRA, NO SE PUEDE TERMINAR */}
      {tieneReporteAbierto(contrato) ? (
        <View style={[styles.franja, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
          <Ionicons name="hourglass-outline" size={16} color="#B45309" />
          <Text style={[styles.franjaTexto, { color: '#92400E' }]}>Hay un reporte en revisión por el administrador. La obra no se puede terminar hasta que lo resuelva; les avisaremos a los dos.</Text>
        </View>
      ) : null}
      {/* AJUSTES DE DINERO QUE ORDENÓ EL ADMIN Y PAGOS QUE FALTA CONFIRMAR */}
      {ajustesDePago(contrato).map((a: any, i: number) => (
        <View key={i} style={[styles.franja, a.tipo === 'extra' ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' } : { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
          <Ionicons name={a.tipo === 'extra' ? 'add-circle-outline' : 'remove-circle-outline'} size={16} color={a.tipo === 'extra' ? '#047857' : '#B91C1C'} />
          <Text style={[styles.franjaTexto, { color: a.tipo === 'extra' ? '#065F46' : '#991B1B' }]}>Admin: {a.texto}</Text>
        </View>
      ))}
      {pagosPorConfirmar(contrato).length > 0 ? (
        <View style={[styles.franja, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <Ionicons name="cash-outline" size={16} color="#B45309" />
          <Text style={[styles.franjaTexto, { color: '#92400E' }]}>{pagosPorConfirmar(contrato).length} pago(s) esperando que el trabajador confirme que los recibió.</Text>
        </View>
      ) : null}

      {botones.length > 0 && (
        <View style={styles.botones}>
          {botones.map((boton, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.boton, boton.relleno ? { backgroundColor: boton.color, borderColor: boton.color } : { borderColor: boton.color }, deshabilitado && { opacity: 0.5 }]}
              onPress={boton.onPress}
              disabled={deshabilitado}>
              <Ionicons name={boton.icono} size={16} color={boton.relleno ? '#FFF' : boton.color} />
              <Text style={[styles.botonTexto, { color: boton.relleno ? '#FFF' : boton.color }]}>{boton.texto}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, borderLeftWidth: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  encabezado: { flexDirection: 'row', alignItems: 'center' },
  foto: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#E5E7EB' },
  titulo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  subtitulo: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  etiqueta: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 10 },
  etiquetaTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  detalles: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detalleTexto: { fontSize: 14, color: '#4B5563', marginLeft: 6, flexShrink: 1 },
  descripcion: { fontSize: 14, color: '#4B5563', marginTop: 4, lineHeight: 20 },
  fotoObra: { width: '100%', height: 170, borderRadius: 12, marginTop: 10, backgroundColor: '#E5E7EB' },
  fotoAviso: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fotoAvisoTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  aviso: { fontSize: 14, fontWeight: 'bold', marginTop: 10 },
  franja: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 10 },
  franjaTexto: { fontSize: 14, fontWeight: '600', marginLeft: 6, flex: 1 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginHorizontal: -4 },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, margin: 4, flexGrow: 1 },
  botonTexto: { fontSize: 14, fontWeight: 'bold', marginLeft: 5 },
});
