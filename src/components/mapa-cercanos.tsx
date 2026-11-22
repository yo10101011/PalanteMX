// MAPA INTERACTIVO CON MARCADORES (REQUISITOS RF8, RF9 Y RF10): EL CONTRATISTA VE A LOS TRABAJADORES CERCANOS Y EL
// TRABAJADOR VE LAS VACANTES (SOLICITUDES DE TRABAJO) CERCANAS. EMPIEZA EN DONDE ESTÁ EL TELÉFONO (PUNTO AZUL).
// ES GRATIS, COMO selector-mapa: OPENSTREETMAP (CON ESRI DE RESPALDO) DENTRO DE UN WebView, SIN LLAVE DE GOOGLE.
// AL TOCAR UN MARCADOR SE MUESTRA ABAJO SU TARJETA CON UN BOTÓN (VER PERFIL / VER VACANTE).
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

type Punto = { latitud: number; longitud: number };

export type MarcadorMapa = {
  id: string;
  punto: Punto;
  titulo: string;
  detalle?: string;     // P. EJ. "Albañil · $500 por día · a 3 km"
  foto?: string;
  color?: string;       // COLOR DEL MARCADOR
  aproximado?: boolean; // UBICACIÓN MOVIDA A PROPÓSITO (CASA DE UNA PERSONA): SE DIBUJA UNA ZONA, NO UN PUNTO EXACTO
};

type Props = {
  visible: boolean;
  titulo: string;
  marcadores: MarcadorMapa[];
  miPunto?: Punto | null;   // MI UBICACIÓN GUARDADA (SI EL GPS DEL TELÉFONO NO RESPONDE)
  textoBoton: string;       // QUÉ PASA AL TOCAR UNA FOTO: "ver su perfil", "ver la vacante"
  nota?: string;
  leyenda?: { color: string; texto: string }[];
  onElegir: (id: string) => void;
  onCerrar: () => void;
};

const CENTRO_MEXICO: Punto = { latitud: 19.4326, longitud: -99.1332 };

// LA CASA DE UN TRABAJADOR NO SE MUESTRA EXACTA: SE MUEVE ENTRE 300 Y 700 M (SIEMPRE IGUAL PARA LA MISMA PERSONA)
export const puntoAproximado = (p: Punto, id: string): Punto => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const angulo = ((h >>> 0) % 360) * Math.PI / 180;
  const metros = 300 + ((h >>> 9) % 400);
  return {
    latitud: p.latitud + (metros / 111320) * Math.cos(angulo),
    longitud: p.longitud + (metros / (111320 * Math.cos(p.latitud * Math.PI / 180))) * Math.sin(angulo),
  };
};

const htmlMapa = (centro: Punto, zoom: number, marcadores: MarcadorMapa[], yo: Punto | null) => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#mapa{height:100%;margin:0;padding:0}
.pin{width:40px;height:40px;border-radius:50%;border:3px solid;overflow:hidden;background:#E5E7EB;box-shadow:0 2px 6px rgba(0,0,0,.35);box-sizing:border-box}
.pin img{width:100%;height:100%;object-fit:cover;display:block}</style></head><body><div id="mapa"></div><script>
var mapa = L.map('mapa', { zoomControl: true }).setView([${centro.latitud}, ${centro.longitud}], ${zoom});
var esriCalles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 });
var calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(mapa);
var fallos = 0;
calles.on('tileerror', function () { fallos++; if (fallos === 3 && mapa.hasLayer(calles)) { mapa.removeLayer(calles); calles = esriCalles.addTo(mapa); } });
var datos = ${JSON.stringify(marcadores.map(m => ({ id: m.id, lat: m.punto.latitud, lng: m.punto.longitud, color: m.color || '#00A355', aprox: !!m.aproximado, foto: m.foto || '' }))).replace(/</g, '\\u003c')};
var grupo = [];
// CADA MARCADOR ES LA FOTO DE LA PERSONA (O DE LA OBRA) CON UN BORDE DE COLOR. AL TOCARLO SE ABRE SU PERFIL.
datos.forEach(function (d) {
  if (d.aprox) L.circle([d.lat, d.lng], { radius: 700, color: d.color, weight: 1, fillOpacity: 0.06, interactive: false }).addTo(mapa);
  var icono = L.divIcon({ className: '', html: '<div class="pin" style="border-color:' + d.color + ';background:' + d.color + '"><img></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
  var m = L.marker([d.lat, d.lng], { icon: icono }).addTo(mapa);
  var img = m.getElement() && m.getElement().querySelector('img');
  if (img) { if (d.foto) img.src = d.foto; else img.style.display = 'none'; img.onerror = function () { img.style.display = 'none'; }; }
  m.on('click', function () { window.ReactNativeWebView.postMessage(JSON.stringify({ id: d.id })); });
  grupo.push([d.lat, d.lng]);
});
var yo = null;
window.ponerYo = function (lat, lng, centrar) {
  if (yo) mapa.removeLayer(yo);
  yo = L.circleMarker([lat, lng], { radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(mapa).bindTooltip('Tú estás aquí');
  if (centrar) mapa.setView([lat, lng], 13);
};
window.verTodos = function () { if (grupo.length) mapa.fitBounds(grupo.concat(yo ? [[yo.getLatLng().lat, yo.getLatLng().lng]] : []), { padding: [30, 30], maxZoom: 14 }); };
${yo ? `window.ponerYo(${yo.latitud}, ${yo.longitud}, false);` : ''}
</script></body></html>`;

export function MapaCercanos({ visible, titulo, marcadores, miPunto, textoBoton, nota, leyenda, onElegir, onCerrar }: Props) {
  const webview = useRef<WebView>(null);
  const [inicio, setInicio] = useState<{ centro: Punto; zoom: number; yo: Punto | null } | null>(null);

  // AL ABRIR: SE CENTRA EN DONDE ESTÁ EL TELÉFONO; SI NO HAY PERMISO, EN MI UBICACIÓN GUARDADA; SI NO, EN MÉXICO
  useEffect(() => {
    if (!visible) { setInicio(null); return; }
    (async () => {
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (!permiso.granted) throw new Error();
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const yo = { latitud: p.coords.latitude, longitud: p.coords.longitude };
        setInicio({ centro: yo, zoom: 12, yo });
      } catch {
        setInicio(miPunto ? { centro: miPunto, zoom: 12, yo: miPunto } : { centro: CENTRO_MEXICO, zoom: 5, yo: null });
      }
    })();
  }, [visible]);

  // TOCAR UNA FOTO DEL MAPA ABRE DIRECTO SU PERFIL (O LA VACANTE)
  const alMensaje = (dato: string) => {
    try { const { id } = JSON.parse(dato); if (id) onElegir(id); } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <SafeAreaView style={styles.contenedor}>
        <View style={styles.encabezado}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{titulo}</Text>
            <Text style={styles.subtitulo}>{marcadores.length} en el mapa</Text>
          </View>
          <TouchableOpacity onPress={onCerrar}><Ionicons name="close-circle" size={30} color="#FFF" /></TouchableOpacity>
        </View>

        {leyenda?.length ? (
          <View style={styles.leyenda}>
            {leyenda.map(l => (
              <View key={l.texto} style={styles.leyendaItem}><View style={[styles.leyendaPunto, { backgroundColor: l.color }]} /><Text style={styles.leyendaTexto}>{l.texto}</Text></View>
            ))}
            <View style={styles.leyendaItem}><View style={[styles.leyendaPunto, { backgroundColor: '#2563EB' }]} /><Text style={styles.leyendaTexto}>Tú</Text></View>
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          {inicio ? (
            <WebView
              ref={webview}
              originWhitelist={['*']}
              source={{ html: htmlMapa(inicio.centro, inicio.zoom, marcadores, inicio.yo), baseUrl: 'https://palantemx.app' }}
              onMessage={(e) => alMensaje(e.nativeEvent.data)}
              style={{ flex: 1 }}
            />
          ) : <ActivityIndicator size="large" color="#0D2340" style={{ marginTop: 40 }} />}

          {/* BOTONES FLOTANTES: VOLVER A MI UBICACIÓN Y VER TODOS LOS MARCADORES */}
          {inicio && (
            <View style={styles.flotantes}>
              {inicio.yo && (
                <TouchableOpacity style={styles.flotante} onPress={() => webview.current?.injectJavaScript(`window.ponerYo(${inicio.yo!.latitud}, ${inicio.yo!.longitud}, true); true;`)}>
                  <Ionicons name="locate" size={22} color="#0D2340" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.flotante} onPress={() => webview.current?.injectJavaScript('window.verTodos(); true;')}>
                <Ionicons name="expand" size={22} color="#0D2340" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.pie}>
          <Text style={styles.ayuda}>{marcadores.length ? `Toca una foto del mapa para ${textoBoton}.` : 'No hay resultados con los filtros que elegiste.'}</Text>
          {nota ? <Text style={styles.nota}>{nota}</Text> : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#F3F4F6' },
  encabezado: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', padding: 14 },
  titulo: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  subtitulo: { color: '#CBD5E1', fontSize: 14, marginTop: 2 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  leyendaPunto: { width: 12, height: 12, borderRadius: 6, marginRight: 5, borderWidth: 2, borderColor: '#FFF' },
  leyendaTexto: { fontSize: 14, color: '#374151' },
  flotantes: { position: 'absolute', right: 12, bottom: 12 },
  flotante: { backgroundColor: '#FFF', borderRadius: 24, width: 46, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  pie: { backgroundColor: '#FFF', padding: 14, borderTopWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center' },
  ayuda: { fontSize: 15, fontWeight: 'bold', color: '#0D2340', textAlign: 'center' },
  nota: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4 },
});
