// UBICACIÓN Y PRECIOS: LO QUE USAN LOS FILTROS DE BÚSQUEDA (EXPLORAR DEL CONTRATISTA Y BOLSA DE TRABAJO DEL TRABAJADOR).
import * as Location from 'expo-location';

export const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México',
  'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán',
  'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
  'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

const sinAcentos = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// EL GPS DEVUELVE EL ESTADO CON NOMBRES DISTINTOS ("México", "State of Mexico", "CDMX", "Michoacán de Ocampo"...):
// SE CONVIERTE AL NOMBRE DE LA LISTA. DEVUELVE '' SI NO SE RECONOCE.
export const normalizarEstado = (region?: string | null) => {
  if (!region) return '';
  const r = sinAcentos(region);
  if (['mexico', 'state of mexico', 'edomex', 'estado de mexico', 'mex.'].includes(r)) return 'Estado de México';
  if (['cdmx', 'mexico city', 'ciudad de mexico', 'distrito federal', 'd.f.'].includes(r)) return 'Ciudad de México';
  return ESTADOS_MEXICO.find(e => r === sinAcentos(e) || r.startsWith(sinAcentos(e))) || '';
};

// CIUDAD Y ESTADO A PARTIR DE LAS COORDENADAS GUARDADAS EN EL REGISTRO
export const ubicacionDesdeGPS = async (gps?: { latitud?: number; longitud?: number }) => {
  if (!gps?.latitud || !gps?.longitud) return null;
  try {
    const [lugar] = await Location.reverseGeocodeAsync({ latitude: gps.latitud, longitude: gps.longitud });
    if (!lugar) return null;
    return { ciudad: lugar.city || lugar.subregion || lugar.name || '', estado: normalizarEstado(lugar.region) };
  } catch {
    return null;
  }
};

// DISTANCIA EN LÍNEA RECTA ENTRE DOS PUNTOS (FÓRMULA DE HAVERSINE). null SI FALTA ALGUNO
export const distanciaKm = (a?: { latitud?: number; longitud?: number } | null, b?: { latitud?: number; longitud?: number } | null) => {
  if (!a?.latitud || !a?.longitud || !b?.latitud || !b?.longitud) return null;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export const textoDistancia = (km: number | null) => (km === null ? '' : km < 1 ? 'a menos de 1 km' : `a ${Math.round(km)} km`);

// DÍAS DE LA SEMANA EN QUE EL TRABAJADOR ESTÁ DISPONIBLE (CAMPO dias_disponibles DEL PERFIL)
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// "Lun a Vie", "Lun, Mié, Vie", "Todos los días"...
export const textoDias = (dias?: string[]) => {
  const elegidos = DIAS_SEMANA.filter(d => dias?.includes(d));
  if (elegidos.length === 0) return 'Días a convenir';
  if (elegidos.length === 7) return 'Todos los días';
  const indices = elegidos.map(d => DIAS_SEMANA.indexOf(d));
  const seguidos = indices.every((n, i) => i === 0 || n === indices[i - 1] + 1);
  return seguidos && elegidos.length > 2 ? `${elegidos[0]} a ${elegidos[elegidos.length - 1]}` : elegidos.join(', ');
};

// PRECIOS: UN MONTO EN PESOS Y CADA CUÁNTO (LO PONE EL TRABAJADOR EN SU PERFIL Y EL CONTRATISTA EN SU VACANTE)
export const PERIODOS_PAGO = ['por día', 'por semana', 'por obra'];

export const textoPrecio = (monto?: number | null, periodo?: string) =>
  monto ? `$${monto.toLocaleString('es-MX')} ${periodo || ''}`.trim() : 'A convenir';
