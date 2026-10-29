// UBICACIÓN Y PRECIOS: LO QUE USAN LOS FILTROS DE BÚSQUEDA (EXPLORAR DEL CONTRATISTA Y BOLSA DE TRABAJO DEL TRABAJADOR).
import * as Location from 'expo-location';

import municipiosJson from '@/data/municipios.json';

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

// MUNICIPIOS DE CADA ESTADO (CATÁLOGO OFICIAL DEL INEGI, DESCARGADO UNA VEZ Y GUARDADO EN LA APP: GRATIS Y SIN INTERNET)
const MUNICIPIOS = municipiosJson as Record<string, string[]>;
export const municipiosDe = (estado?: string) => (estado && MUNICIPIOS[estado]) || [];

// NOMBRE NORMAL DE UN PUNTO DEL MAPA ("Calle Hidalgo 5, Palmillas, San Felipe del Progreso") EN LUGAR DE NÚMEROS.
// LO HACE EL PROPIO TELÉFONO (GRATIS). DEVUELVE '' SI NO SE PUDO.
export const nombreDeLugar = async (punto?: { latitud?: number; longitud?: number } | null) => {
  if (!punto?.latitud || !punto?.longitud) return '';
  try {
    const [l] = await Location.reverseGeocodeAsync({ latitude: punto.latitud, longitude: punto.longitud });
    if (!l) return '';
    const calle = l.street ? `${l.street}${l.streetNumber ? ` ${l.streetNumber}` : ''}` : '';
    const partes = [calle, l.district || (l.name !== l.street ? l.name : ''), l.city || l.subregion, normalizarEstado(l.region) || l.region];
    return [...new Set(partes.filter((p): p is string => !!p && !/^\d+$/.test(p)))].join(', ');
  } catch {
    return '';
  }
};

// UBICACIÓN ACTUAL LO MÁS PRECISA POSIBLE: HASTA 3 LECTURAS, SE QUEDA CON LA MEJOR (LA DE MENOR MARGEN DE ERROR)
export const ubicacionPrecisa = async () => {
  const permiso = await Location.requestForegroundPermissionsAsync();
  if (!permiso.granted) throw new Error("Necesitamos tu ubicación. Activa el permiso de ubicación para PalanteMX.");
  let mejor: Location.LocationObject | null = null;
  for (let i = 0; i < 3; i++) {
    const lectura = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    if (!mejor || (lectura.coords.accuracy ?? 999) < (mejor.coords.accuracy ?? 999)) mejor = lectura;
    if ((mejor.coords.accuracy ?? 999) <= 25) break; // YA ES BUENA: NO HACE FALTA ESPERAR MÁS
  }
  return {
    latitud: mejor!.coords.latitude,
    longitud: mejor!.coords.longitude,
    precision: mejor!.coords.accuracy ?? null, // MARGEN DE ERROR EN METROS
    simulada: mejor!.mocked === true,           // ANDROID AVISA SI ES UNA UBICACIÓN FALSA (APPS DE "FAKE GPS")
  };
};

// ---------------------------------------------------------------- ¿EL TRABAJADOR ESTÁ EN LA OBRA?
// SE COMPARA LA DISTANCIA ENTRE EL TELÉFONO Y EL LUGAR DE LA OBRA CONTRA EL TAMAÑO DE UNA OBRA (RADIO_OBRA_M)
// Y EL MARGEN DE ERROR DEL GPS (precisión): UN GPS CON ±80 m PUEDE MARCAR A 200 m A ALGUIEN QUE SÍ ESTÁ AHÍ.
//   en_obra    distancia ≤ radio de la obra + margen del GPS (con un GPS razonablemente bueno)
//   imprecisa  el GPS tiene mucho error (> 150 m) y, con ese error, podría estar en la obra
//   cerca      a menos de 1 km, pero fuera de la obra
//   lejos      a más de 1 km
//   falsa      el teléfono usa una app de ubicación falsa
//   sin_obra   la obra no tiene su lugar marcado en el mapa (no hay con qué comparar)
export const RADIO_OBRA_M = 150;
export type NivelUbicacion = 'en_obra' | 'imprecisa' | 'cerca' | 'lejos' | 'falsa' | 'sin_obra';

export const evaluarUbicacion = (distanciaKm: number | null | undefined, precisionM: number | null | undefined, simulada?: boolean): NivelUbicacion => {
  if (simulada) return 'falsa';
  if (distanciaKm === null || distanciaKm === undefined) return 'sin_obra';
  const distancia = distanciaKm * 1000;
  const margen = Math.min(precisionM ?? 50, 100);
  if ((precisionM ?? 50) <= 150 && distancia <= RADIO_OBRA_M + margen) return 'en_obra';
  if ((precisionM ?? 0) > 150 && distancia - (precisionM ?? 0) <= RADIO_OBRA_M) return 'imprecisa';
  return distancia <= 1000 ? 'cerca' : 'lejos';
};

const textoMetros = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

// MENSAJE PARA CADA QUIEN: AL TRABAJADOR (AL REGISTRAR) Y AL CONTRATISTA (AL REVISAR LA BITÁCORA)
export const mensajeUbicacion = (nivel: NivelUbicacion, distanciaKm: number | null | undefined, precisionM: number | null | undefined, para: 'trabajador' | 'contratista') => {
  const d = distanciaKm !== null && distanciaKm !== undefined ? textoMetros(distanciaKm) : '';
  const p = precisionM ? `±${Math.round(precisionM)} m` : '';
  const mensajes: Record<NivelUbicacion, { trabajador: string; contratista: string; color: string }> = {
    en_obra: { trabajador: '¡Muy bien! Estás en la obra.', contratista: `Sí estaba en la obra (a ${d}). Aun así revisa que la foto concuerde.`, color: '#059669' },
    imprecisa: { trabajador: `Tu GPS no es preciso ahorita (${p}). Se registró; el contratista lo revisará.`, contratista: `Señal de GPS débil (${p}): podría estar en la obra (a ${d}). Revisa bien la foto.`, color: '#2563EB' },
    cerca: { trabajador: `Estás cerca, pero no en la obra (a ${d}). Se registró de todos modos; el contratista lo revisará.`, contratista: `Estaba cerca, pero NO en la obra (a ${d}). Revisa la foto y pregúntale.`, color: '#EA580C' },
    lejos: { trabajador: `No estás en la obra (a ${d}). Se registró, pero el contratista lo revisará y puede rechazar el día.`, contratista: `NO estaba en la obra: estaba a ${d}. Puedes rechazar este día.`, color: '#DC2626' },
    falsa: { trabajador: 'Tu teléfono está usando una ubicación falsa. El contratista y el administrador lo verán.', contratista: 'Ubicación FALSA detectada (usó una app de GPS falso). Puedes rechazar este día.', color: '#DC2626' },
    sin_obra: { trabajador: 'Se registró tu ubicación. La obra no tiene su lugar marcado en el mapa.', contratista: 'Se registró su ubicación, pero la obra no tiene su lugar marcado en el mapa: compáralo tú.', color: '#6B7280' },
  };
  return { texto: mensajes[nivel][para], color: mensajes[nivel].color };
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
