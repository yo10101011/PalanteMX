// TARJETA DE UN CONTRATO (OBRA): QUIÉN ES LA OTRA PARTE, LA VACANTE, SU ESTADO Y LOS BOTONES QUE TOQUEN.
// LA USAN LOS PANELES DEL TRABAJADOR Y DEL CONTRATISTA, CADA UNO CON SUS PROPIOS BOTONES.
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { estiloEstado } from '@/lib/contratos';

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

  return (
    <View style={[styles.tarjeta, { borderLeftColor: estado.color }]}>
      <View style={styles.encabezado}>
        <Image source={{ uri: otraParte.foto || 'https://via.placeholder.com/150' }} style={styles.foto} />
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={2}>{contrato.titulo_vacante || vacante.titulo}</Text>
          <Text style={styles.subtitulo} numberOfLines={1}>{otraParte.nombre}{otraParte.detalle ? ` • ${otraParte.detalle}` : ''}</Text>
        </View>
      </View>

      <View style={[styles.etiqueta, { backgroundColor: estado.color }]}>
        <Text style={styles.etiquetaTexto}>{estado.texto}</Text>
      </View>

      {(vacante.ubicacion || vacante.pago) ? (
        <View style={styles.detalles}>
          {vacante.ubicacion ? <View style={styles.fila}><Ionicons name="location-outline" size={14} color="#6B7280" /><Text style={styles.detalleTexto}>{vacante.ubicacion}</Text></View> : null}
          {vacante.pago ? <View style={styles.fila}><Ionicons name="cash-outline" size={14} color="#00D06C" /><Text style={[styles.detalleTexto, { color: '#00D06C', fontWeight: 'bold' }]}>{vacante.pago}</Text></View> : null}
          {contrato.fecha_inicio ? <View style={styles.fila}><Ionicons name="calendar-outline" size={14} color="#6B7280" /><Text style={styles.detalleTexto}>Inició: {contrato.fecha_inicio}{contrato.fecha_fin ? ` • Terminó: ${contrato.fecha_fin}` : ''}</Text></View> : null}
        </View>
      ) : null}

      {aviso ? <Text style={[styles.aviso, { color: estado.color }]}>{aviso}</Text> : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, borderLeftWidth: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  encabezado: { flexDirection: 'row', alignItems: 'center' },
  foto: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#E5E7EB' },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#0D2340' },
  subtitulo: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  etiqueta: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 10 },
  etiquetaTexto: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  detalles: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detalleTexto: { fontSize: 12, color: '#4B5563', marginLeft: 6, flexShrink: 1 },
  aviso: { fontSize: 12, fontWeight: 'bold', marginTop: 10 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginHorizontal: -4 },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, margin: 4, flexGrow: 1 },
  botonTexto: { fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
});
