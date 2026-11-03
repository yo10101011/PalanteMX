// DATOS DEL TRABAJADOR BAJO SU NOMBRE (SU PROPIO PERFIL Y EL QUE VEN LOS CONTRATISTAS), CENTRADOS Y PAREJOS:
// LA UBICACIÓN COMO UNA LÍNEA DISCRETA, Y UNA TARJETA CON PRECIO | TELÉFONO (O DISTANCIA) Y LOS 7 DÍAS DE LA SEMANA.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DIAS_SEMANA } from '@/lib/ubicacion';

type Props = {
  ubicacion: string;
  precio?: string;           // VACÍO = "SIN DEFINIR"
  segundoDato: { etiqueta: string; valor?: string };
  dias?: string[];
  onCompletar?: () => void;  // SOLO EN SU PROPIO PERFIL, SI LE FALTA ALGO
};

export function DatosTrabajador({ ubicacion, precio, segundoDato, dias, onCompletar }: Props) {
  const conDias = !!dias?.length;
  return (
    <>
      <View style={styles.lineaUbicacion}>
        <Ionicons name="location-outline" size={15} color="#6B7280" />
        <Text style={styles.textoUbicacion} numberOfLines={2}>{ubicacion || 'Sin ubicación'}</Text>
      </View>

      <View style={styles.tarjeta}>
        <View style={styles.fila}>
          <View style={styles.celda}>
            <Text style={styles.etiqueta}>PRECIO</Text>
            <Text style={[styles.valor, !precio && styles.sinDato]} numberOfLines={1}>{precio || 'Sin definir'}</Text>
          </View>
          <View style={styles.divisor} />
          <View style={styles.celda}>
            <Text style={styles.etiqueta}>{segundoDato.etiqueta.toUpperCase()}</Text>
            <Text style={[styles.valor, !segundoDato.valor && styles.sinDato]} numberOfLines={1}>{segundoDato.valor || 'Sin definir'}</Text>
          </View>
        </View>

        <View style={styles.separador} />
        <Text style={[styles.etiqueta, { textAlign: 'center' }]}>DÍAS DISPONIBLES</Text>
        <View style={styles.dias}>
          {DIAS_SEMANA.map(d => {
            const si = !!dias?.includes(d);
            return (
              <View key={d} style={[styles.dia, si && styles.diaSi]}>
                <Text style={[styles.diaTexto, si && { color: '#FFF' }]}>{d.charAt(0)}</Text>
              </View>
            );
          })}
        </View>
        {!conDias && <Text style={[styles.sinDato, { textAlign: 'center', fontSize: 13, marginTop: 4 }]}>A convenir</Text>}

        {onCompletar && (!precio || !conDias) && (
          <TouchableOpacity onPress={onCompletar} style={styles.completar}>
            <Text style={styles.completarTexto}>Completar mi perfil</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  lineaUbicacion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 10 },
  textoUbicacion: { fontSize: 14, color: '#6B7280', marginLeft: 4, textAlign: 'center', flexShrink: 1 },
  tarjeta: { alignSelf: 'stretch', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, marginTop: 14, elevation: 2, shadowColor: '#0D2340', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  fila: { flexDirection: 'row', alignItems: 'center' },
  celda: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  divisor: { width: 1, height: 34, backgroundColor: '#E5E7EB' },
  separador: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
  etiqueta: { fontSize: 11, color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 0.6 },
  valor: { fontSize: 15, color: '#0D2340', fontWeight: 'bold', marginTop: 3 },
  sinDato: { color: '#9CA3AF', fontWeight: 'normal' },
  dias: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  dia: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3, backgroundColor: '#F3F4F6' },
  diaSi: { backgroundColor: '#00A355' },
  diaTexto: { fontSize: 13, fontWeight: 'bold', color: '#9CA3AF' },
  completar: { borderTopWidth: 1, borderColor: '#F3F4F6', marginTop: 12, paddingTop: 10, alignItems: 'center' },
  completarTexto: { fontSize: 14, color: '#2563EB', fontWeight: 'bold' },
});
