// BOTONES "WHATSAPP" Y "LLAMAR" (REQUISITO RF14): ABREN WHATSAPP O EL MARCADOR DEL TELÉFONO PARA ACORDAR DETALLES.
// SOLO SE MUESTRAN CUANDO YA HAY UN TRATO ACEPTADO ENTRE LAS DOS PERSONAS (ANTES SE PLATICA POR EL CHAT DE LA APP,
// ASÍ NADIE REPARTE SU NÚMERO A DESCONOCIDOS). SI NO HAY TRATO, SE MUESTRA UNA NOTA QUE LO EXPLICA.
import { Ionicons } from '@expo/vector-icons';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  telefono?: string | null; // null = TODAVÍA NO HAY TRATO
  nombre?: string;          // PARA EL MENSAJE DE WHATSAPP
  mensaje?: string;         // TEXTO QUE YA VA ESCRITO EN WHATSAPP
  compacto?: boolean;       // EN LAS TARJETAS DE CONTRATO: SIN TÍTULO NI NOTA
};

// NÚMERO MEXICANO DE 10 DÍGITOS -> FORMATO INTERNACIONAL (52 + NÚMERO) QUE PIDE WHATSAPP
export const numeroWhatsApp = (telefono: string) => {
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 13 && digitos.startsWith('521')) return `52${digitos.slice(3)}`;
  return digitos;
};

const abrirEnlace = async (url: string, respaldo?: string) => {
  try { await Linking.openURL(url); }
  catch {
    if (respaldo) { try { await Linking.openURL(respaldo); return; } catch {} }
    Alert.alert('No se pudo abrir', 'Revisa que tengas la aplicación instalada.');
  }
};
export const telefonoValido = (telefono?: string | null): telefono is string => !!telefono && telefono.replace(/\D/g, '').length >= 10;
export const abrirWhatsApp = (telefono: string, mensaje: string) => {
  const numero = numeroWhatsApp(telefono);
  const texto = encodeURIComponent(mensaje);
  abrirEnlace(`whatsapp://send?phone=${numero}&text=${texto}`, `https://wa.me/${numero}?text=${texto}`);
};
export const llamar = (telefono: string) => abrirEnlace(`tel:${telefono.replace(/[^\d+]/g, '')}`);

export function BotonesContacto({ telefono, nombre, mensaje, compacto }: Props) {
  if (telefono === null) {
    return compacto ? null : (
      <View style={styles.nota}>
        <Ionicons name="lock-closed-outline" size={16} color="#6B7280" />
        <Text style={styles.notaTexto}>Los botones de WhatsApp y llamada aparecen cuando aceptan un trato. Mientras, platiquen por el chat de PalanteMX.</Text>
      </View>
    );
  }
  if (!telefonoValido(telefono)) return null;
  const textoWhatsApp = mensaje || `Hola${nombre ? ` ${nombre.split(' ')[0]}` : ''}, te escribo por PalanteMX.`;

  return (
    <View style={compacto ? undefined : styles.caja}>
      {!compacto && <Text style={styles.titulo}>Contacto directo</Text>}
      <View style={styles.fila}>
        <TouchableOpacity style={[styles.boton, { backgroundColor: '#25D366' }]} onPress={() => abrirWhatsApp(telefono, textoWhatsApp)}>
          <Ionicons name="logo-whatsapp" size={18} color="#FFF" /><Text style={styles.botonTexto}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.boton, { backgroundColor: '#0D2340' }]} onPress={() => llamar(telefono)}>
          <Ionicons name="call" size={18} color="#FFF" /><Text style={styles.botonTexto}>Llamar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#0D2340', marginBottom: 8 },
  fila: { flexDirection: 'row', marginHorizontal: -4 },
  boton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 10, marginHorizontal: 4 },
  botonTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 6 },
  nota: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  notaTexto: { flex: 1, fontSize: 14, color: '#6B7280', marginLeft: 6 },
});
