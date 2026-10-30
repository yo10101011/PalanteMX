// MAPA PARA ELEGIR UN LUGAR (P. EJ. DÓNDE ESTÁ LA OBRA). ES GRATIS: USA MAPAS DE OPENSTREETMAP Y ESRI DENTRO DE UN
// WebView (NO NECESITA LLAVE DE GOOGLE). SE PUEDE ARRASTRAR EL PIN, TOCAR EL MAPA, BUSCAR UNA DIRECCIÓN O USAR
// "MI UBICACIÓN". ABAJO SE MUESTRA EL NOMBRE DEL LUGAR (LO CALCULA EL TELÉFONO, TAMBIÉN GRATIS).
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { nombreDeLugar, ubicacionPrecisa } from '@/lib/ubicacion';

type Punto = { latitud: number; longitud: number };

type Props = {
  visible: boolean;
  inicial?: Punto | null;
  titulo?: string;
  onElegir: (punto: Punto, nombre: string) => void;
  onCerrar: () => void;
};

const CENTRO_MEXICO: Punto = { latitud: 19.4326, longitud: -99.1332 };

const htmlMapa = (p: Punto, zoom: number) => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#mapa{height:100%;margin:0;padding:0}</style></head><body><div id="mapa"></div><script>
var mapa = L.map('mapa').setView([${p.latitud}, ${p.longitud}], ${zoom});
// CALLES: OPENSTREETMAP (GRATIS, SIN LLAVE). SI SUS MOSAICOS FALLAN, SE CAMBIA SOLO A LAS CALLES DE ESRI (TAMBIÉN GRATIS).
// SATÉLITE: FOTOS AÉREAS DE ESRI (GRATIS, SIN LLAVE). (CARTO YA PIDE LLAVE: POR ESO SE DEJÓ DE USAR)
var esriCalles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 });
var satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imágenes &copy; Esri', maxZoom: 19 });
var calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(mapa);
var fallos = 0;
calles.on('tileerror', function () { fallos++; if (fallos === 3 && mapa.hasLayer(calles)) { mapa.removeLayer(calles); calles = esriCalles.addTo(mapa); } });
window.vista = function (tipo) {
  if (tipo === 'satelite') { mapa.removeLayer(calles); satelite.addTo(mapa); }
  else { mapa.removeLayer(satelite); calles.addTo(mapa); }
};
var pin = L.marker([${p.latitud}, ${p.longitud}], { draggable: true }).addTo(mapa);
function avisar() { var q = pin.getLatLng(); window.ReactNativeWebView.postMessage(JSON.stringify({ lat: q.lat, lng: q.lng })); }
pin.on('dragend', avisar);
mapa.on('click', function (e) { pin.setLatLng(e.latlng); avisar(); });
window.mover = function (lat, lng) { pin.setLatLng([lat, lng]); mapa.setView([lat, lng], 17); avisar(); };
avisar();
</script></body></html>`;

export function SelectorMapa({ visible, inicial, titulo = 'Marca el lugar de la obra', onElegir, onCerrar }: Props) {
  const webview = useRef<WebView>(null);
  const [inicio, setInicio] = useState<{ punto: Punto; zoom: number } | null>(null);
  const [punto, setPunto] = useState<Punto | null>(null);
  const [nombre, setNombre] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'calles' | 'satelite'>('calles');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AL ABRIR: EMPIEZA EN EL LUGAR YA MARCADO, O EN DONDE ESTÁ EL TELÉFONO, O EN EL CENTRO DE MÉXICO
  useEffect(() => {
    if (!visible) { setInicio(null); return; }
    if (inicial) { setInicio({ punto: inicial, zoom: 17 }); return; }
    (async () => {
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (!permiso.granted) throw new Error();
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setInicio({ punto: { latitud: p.coords.latitude, longitud: p.coords.longitude }, zoom: 16 });
      } catch { setInicio({ punto: CENTRO_MEXICO, zoom: 5 }); }
    })();
  }, [visible]);

  // CADA VEZ QUE SE MUEVE EL PIN: SE GUARDA EL PUNTO Y SE BUSCA SU NOMBRE (MEDIO SEGUNDO DESPUÉS, PARA NO PREGUNTAR DE MÁS)
  const alMoverse = (p: Punto) => {
    setPunto(p);
    setNombre('Buscando el nombre del lugar...');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => setNombre((await nombreDeLugar(p)) || 'Lugar sin nombre en el mapa'), 500);
  };

  const mover = (p: Punto) => webview.current?.injectJavaScript(`window.mover(${p.latitud}, ${p.longitud}); true;`);

  const miUbicacion = async () => {
    setBuscando(true);
    try { const p = await ubicacionPrecisa(); mover(p); }
    catch (error: any) { Alert.alert("Ubicación", error?.message || "No se pudo obtener tu ubicación."); }
    setBuscando(false);
  };

  // BUSCAR UNA DIRECCIÓN ESCRITA (LO RESUELVE EL TELÉFONO, GRATIS)
  const buscarDireccion = async () => {
    if (!busqueda.trim()) return;
    setBuscando(true);
    try {
      const [resultado] = await Location.geocodeAsync(`${busqueda}, México`);
      if (resultado) mover({ latitud: resultado.latitude, longitud: resultado.longitude });
      else Alert.alert("No encontrado", "No encontramos esa dirección. Prueba con el nombre del pueblo o colonia y el municipio, o mueve el pin a mano.");
    } catch { Alert.alert("No encontrado", "No se pudo buscar la dirección. Mueve el pin a mano en el mapa."); }
    setBuscando(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <SafeAreaView style={styles.contenedor}>
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>{titulo}</Text>
          <TouchableOpacity onPress={onCerrar}><Ionicons name="close-circle" size={30} color="#FFF" /></TouchableOpacity>
        </View>

        <View style={styles.busqueda}>
          <TextInput style={styles.input} placeholder="Busca: pueblo o colonia, municipio" value={busqueda} onChangeText={setBusqueda} onSubmitEditing={buscarDireccion} returnKeyType="search" />
          <TouchableOpacity style={styles.botonBuscar} onPress={buscarDireccion}><Ionicons name="search" size={20} color="#FFF" /></TouchableOpacity>
        </View>
        <View style={styles.filaAyuda}>
          <Text style={[styles.ayuda, { flex: 1 }]}>Arrastra el pin o toca el mapa donde está la obra.</Text>
          <TouchableOpacity style={styles.botonVista} onPress={() => { const nueva = vista === 'calles' ? 'satelite' : 'calles'; setVista(nueva); webview.current?.injectJavaScript(`window.vista('${nueva}'); true;`); }}>
            <Ionicons name={vista === 'calles' ? 'earth' : 'map'} size={16} color="#0D2340" />
            <Text style={styles.botonVistaTexto}>{vista === 'calles' ? 'Satélite' : 'Calles'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          {inicio ? (
            <WebView
              ref={webview}
              originWhitelist={['*']}
              source={{ html: htmlMapa(inicio.punto, inicio.zoom), baseUrl: 'https://palantemx.app' }}
              onMessage={(e) => { try { const { lat, lng } = JSON.parse(e.nativeEvent.data); alMoverse({ latitud: lat, longitud: lng }); } catch {} }}
              style={{ flex: 1 }}
            />
          ) : <ActivityIndicator size="large" color="#0D2340" style={{ marginTop: 40 }} />}
          {buscando && <View style={styles.cargando}><ActivityIndicator size="large" color="#0D2340" /></View>}
        </View>

        <View style={styles.pie}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="location" size={18} color="#DC2626" />
            <Text style={styles.nombre} numberOfLines={2}>{nombre || 'Mueve el pin al lugar de la obra'}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <TouchableOpacity style={[styles.boton, { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#0D2340', flex: 1, marginRight: 6 }]} onPress={miUbicacion}>
              <Ionicons name="locate" size={16} color="#0D2340" /><Text style={[styles.botonTexto, { color: '#0D2340' }]}>Mi ubicación</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.boton, { backgroundColor: punto ? '#00D06C' : '#D1D5DB', flex: 1.4, marginLeft: 6 }]} disabled={!punto} onPress={() => punto && onElegir(punto, nombre.startsWith('Buscando') ? '' : nombre)}>
              <Ionicons name="checkmark-circle" size={16} color="#FFF" /><Text style={styles.botonTexto}>Usar este lugar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#F3F4F6' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 14 },
  titulo: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  busqueda: { flexDirection: 'row', padding: 10, paddingBottom: 4 },
  input: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  botonBuscar: { backgroundColor: '#0D2340', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', marginLeft: 8 },
  ayuda: { fontSize: 14, color: '#6B7280', paddingHorizontal: 12, paddingBottom: 6 },
  filaAyuda: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  botonVista: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#0D2340', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6 },
  botonVistaTexto: { marginLeft: 4, fontWeight: 'bold', color: '#0D2340', fontSize: 14 },
  cargando: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)', justifyContent: 'center' },
  pie: { backgroundColor: '#FFF', padding: 14, borderTopWidth: 1, borderColor: '#E5E7EB' },
  nombre: { marginLeft: 6, fontSize: 16, fontWeight: 'bold', color: '#1F2937', flex: 1 },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12 },
  botonTexto: { color: '#FFF', fontWeight: 'bold', marginLeft: 6 },
});
