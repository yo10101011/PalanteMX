// TARJETA DE UNA OBRA TERMINADA EN PALANTEMX (obras_realizadas). LA MISMA PARA EL PERFIL DEL TRABAJADOR Y PARA EL DEL
// CONTRATISTA: FOTO GRANDE DE LA OBRA, TÍTULO, CON QUIÉN SE HIZO, FECHAS, DÍAS TRABAJADOS Y FOTOS DE LA BITÁCORA.
// LAS AGREGA EL SERVIDOR CUANDO LA OBRA TERMINA (A MANO O CON EL CIERRE AUTOMÁTICO).
import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  obra: any;
  vistaDe: 'trabajador' | 'contratista'; // QUIÉN LA VE: CAMBIA "PARA: CONTRATISTA" POR "TRABAJADOR: ..."
  onVerFoto: (uri: string) => void;
  onEliminar?: () => void;               // SOLO EL ADMIN
};

export function TarjetaObraTerminada({ obra, vistaDe, onVerFoto, onEliminar }: Props) {
  const conQuien = vistaDe === 'contratista'
    ? `${obra.trabajador || 'Trabajador'}${obra.oficio ? ` · ${obra.oficio}` : ''}`
    : `Para: ${obra.contratista || 'Contratista'}`;
  const fechas = obra.fecha_inicio ? `Del ${obra.fecha_inicio} al ${obra.fecha_fin}` : obra.fecha_fin ? `Terminó el ${obra.fecha_fin}` : '';

  return (
    <View style={styles.tarjeta}>
      {onEliminar && (
        <TouchableOpacity style={styles.borrar} onPress={onEliminar}><Ionicons name="trash" size={18} color="#FFF" /></TouchableOpacity>
      )}
      {obra.foto_trabajo ? (
        <TouchableOpacity activeOpacity={0.9} onPress={() => onVerFoto(obra.foto_trabajo)}>
          <Image source={{ uri: obra.foto_trabajo }} style={styles.foto} />
          <View style={styles.etiqueta}><Ionicons name="checkmark-circle" size={14} color="#FFF" /><Text style={styles.etiquetaTexto}>TERMINADA</Text></View>
        </TouchableOpacity>
      ) : null}
      <View style={{ padding: 14 }}>
        <Text style={styles.titulo}>{obra.titulo}</Text>
        <View style={styles.fila}><Ionicons name={vistaDe === 'contratista' ? 'person-outline' : 'business-outline'} size={15} color="#6B7280" /><Text style={styles.dato}>{conQuien}</Text></View>
        {obra.ubicacion ? <View style={styles.fila}><Ionicons name="location-outline" size={15} color="#6B7280" /><Text style={styles.dato}>{obra.ubicacion}</Text></View> : null}
        {fechas ? <View style={styles.fila}><Ionicons name="calendar-outline" size={15} color="#6B7280" /><Text style={styles.dato}>{fechas}</Text></View> : null}
        {obra.pago ? <View style={styles.fila}><Ionicons name="cash-outline" size={15} color="#00A355" /><Text style={[styles.dato, { color: '#00A355', fontWeight: 'bold' }]}>{obra.pago}</Text></View> : null}
        {obra.dias_trabajados ? (
          <View style={styles.dias}>
            <Ionicons name="reader-outline" size={15} color="#047857" />
            <Text style={styles.diasTexto}>{obra.dias_trabajados} día(s) trabajado(s) · {obra.dias_confirmados || 0} confirmado(s) por el contratista</Text>
          </View>
        ) : null}
        {obra.fotos?.length > 0 && (
          <>
            <Text style={styles.subtitulo}>Fotos de la bitácora</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {obra.fotos.map((f: string, j: number) => (
                <TouchableOpacity key={j} onPress={() => onVerFoto(f)}><Image source={{ uri: f }} style={styles.miniatura} /></TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  foto: { width: '100%', height: 160, backgroundColor: '#E5E7EB' },
  etiqueta: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(13,35,64,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  etiquetaTexto: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4, letterSpacing: 0.5 },
  titulo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dato: { fontSize: 14, color: '#6B7280', marginLeft: 6, flexShrink: 1 },
  dias: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 8, padding: 8, marginTop: 10 },
  diasTexto: { fontSize: 14, color: '#047857', fontWeight: 'bold', marginLeft: 6, flexShrink: 1 },
  subtitulo: { fontSize: 13, fontWeight: 'bold', color: '#6B7280', marginTop: 12, marginBottom: 6 },
  miniatura: { width: 74, height: 74, borderRadius: 10, marginRight: 8, backgroundColor: '#E5E7EB' },
  borrar: { position: 'absolute', top: 8, right: 8, zIndex: 5, backgroundColor: 'rgba(220,38,38,0.9)', padding: 7, borderRadius: 16 },
});
