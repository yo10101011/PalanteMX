// ZONAS CON NECESIDAD: AGRUPAMIENTO JERÁRQUICO (MÉTODO DE WARD) DE LOS MUNICIPIOS SEGÚN LA "PRESIÓN DE DEMANDA"
// (VACANTES POR CADA TRABAJADOR) DE 4 GRUPOS DE OFICIOS. ES EL MISMO CÁLCULO QUE scripts/analisis/analisis.py
// (scipy linkage 'ward'), PERO EN VIVO CON LO QUE EL PANEL DEL ADMIN YA CARGÓ.
//
// CÓMO FUNCIONA (PARA EXPLICARLO): AL INICIO CADA MUNICIPIO ES SU PROPIO GRUPO. EN CADA PASO SE JUNTAN LOS DOS GRUPOS
// MÁS PARECIDOS (LOS QUE MENOS AUMENTAN LA DIFERENCIA DENTRO DEL GRUPO). SE REPITE HASTA QUE QUEDAN K GRUPOS.

export const GRUPOS_OFICIOS: Record<string, string[]> = {
  'Obra negra': ['Albañil', 'Ayudante general'],
  'Instalaciones': ['Electricista', 'Plomero', 'Técnico en refrigeración y aire acondicionado'],
  'Acabados': ['Pintor', 'Azulejero', 'Yesero', 'Tablaroquero', 'Impermeabilizador'],
  'Carpintería y herrería': ['Carpintero', 'Herrero', 'Jardinero'],
};
const NOMBRES_GRUPOS = Object.keys(GRUPOS_OFICIOS);
const GRUPO_DE: Record<string, string> = Object.fromEntries(Object.entries(GRUPOS_OFICIOS).flatMap(([g, lista]) => lista.map(o => [o, g])));

export type Zona = { zona: string; vacantes: number; trabajadores: number; demanda: number[]; oferta: number[]; presion: number[] };
export type GrupoZonas = { numero: number; nombre: string; faltan: string[]; zonas: Zona[]; presionMedia: number[] };

// DEMANDA (VACANTES) Y OFERTA (TRABAJADORES) DE CADA GRUPO DE OFICIOS POR MUNICIPIO
export function zonasDe(vacantes: any[], trabajadores: any[], minimoVacantes = 4): Zona[] {
  const mapa = new Map<string, Zona>();
  const fila = (zona: string) => {
    if (!mapa.has(zona)) mapa.set(zona, { zona, vacantes: 0, trabajadores: 0, demanda: NOMBRES_GRUPOS.map(() => 0), oferta: NOMBRES_GRUPOS.map(() => 0), presion: [] });
    return mapa.get(zona)!;
  };
  for (const v of vacantes) {
    const g = GRUPO_DE[v.categoria];
    if (!g || typeof v.ubicacion !== 'string' || !v.ubicacion.includes(', ')) continue;
    const z = fila(v.ubicacion);
    z.demanda[NOMBRES_GRUPOS.indexOf(g)]++; z.vacantes++;
  }
  for (const t of trabajadores) {
    const g = GRUPO_DE[t.oficio_principal];
    if (!g || !t.ubicacion_texto || t.estado_cuenta === 'Bloqueada') continue;
    const z = fila(`${t.ubicacion_texto}, ${t.ubicacion_estado || ''}`);
    z.oferta[NOMBRES_GRUPOS.indexOf(g)]++; z.trabajadores++;
  }
  const zonas = [...mapa.values()].filter(z => z.vacantes >= minimoVacantes);
  // PRESIÓN = VACANTES POR CADA TRABAJADOR DEL GRUPO (EL +1 EVITA DIVIDIR ENTRE CERO)
  zonas.forEach(z => { z.presion = z.demanda.map((d, i) => Math.round((d / (z.oferta[i] + 1)) * 100) / 100); });
  return zonas;
}

// ESTANDARIZA CADA COLUMNA (MEDIA 0, DESVIACIÓN 1) PARA QUE LOS 4 GRUPOS DE OFICIOS PESEN IGUAL
const estandarizar = (filas: number[][]) => {
  const columnas = filas[0]?.length || 0;
  const medias = Array.from({ length: columnas }, (_, j) => filas.reduce((s, f) => s + f[j], 0) / filas.length);
  const desv = medias.map((m, j) => Math.sqrt(filas.reduce((s, f) => s + (f[j] - m) ** 2, 0) / filas.length) || 1);
  return filas.map(f => f.map((x, j) => (x - medias[j]) / desv[j]));
};

// WARD CON LA FÓRMULA DE LANCE-WILLIAMS. DEVUELVE A QUÉ GRUPO (0..K-1) QUEDA CADA PUNTO.
export function ward(puntos: number[][], k: number): number[] {
  const n = puntos.length;
  if (n <= k) return puntos.map((_, i) => i);
  const d: number[][] = puntos.map(a => puntos.map(b => Math.sqrt(a.reduce((s, x, j) => s + (x - b[j]) ** 2, 0))));
  const tamano = puntos.map(() => 1);
  const miembros: number[][] = puntos.map((_, i) => [i]);
  const vivo = puntos.map(() => true);
  for (let paso = 0; paso < n - k; paso++) {
    let mejor = Infinity, a = -1, b = -1;
    for (let i = 0; i < n; i++) if (vivo[i]) for (let j = i + 1; j < n; j++) if (vivo[j] && d[i][j] < mejor) { mejor = d[i][j]; a = i; b = j; }
    // A ABSORBE A B; LA DISTANCIA DEL NUEVO GRUPO A CADA OTRO SE ACTUALIZA (LANCE-WILLIAMS PARA WARD)
    for (let m = 0; m < n; m++) {
      if (!vivo[m] || m === a || m === b) continue;
      const t = tamano[a] + tamano[b] + tamano[m];
      const nueva = Math.sqrt(((tamano[a] + tamano[m]) * d[a][m] ** 2 + (tamano[b] + tamano[m]) * d[b][m] ** 2 - tamano[m] * mejor ** 2) / t);
      d[a][m] = d[m][a] = nueva;
    }
    tamano[a] += tamano[b]; miembros[a].push(...miembros[b]); vivo[b] = false;
  }
  const grupo = puntos.map(() => 0);
  miembros.filter((_, i) => vivo[i]).forEach((lista, g) => lista.forEach(i => { grupo[i] = g; }));
  return grupo;
}

// ZONAS AGRUPADAS Y CON NOMBRE: "FALTAN: ..." SI EL GRUPO TIENE 2.5 O MÁS VACANTES POR TRABAJADOR EN ALGÚN GRUPO DE OFICIOS
export function zonasConNecesidad(vacantes: any[], trabajadores: any[], k = 4): GrupoZonas[] {
  const zonas = zonasDe(vacantes, trabajadores);
  if (zonas.length < 2) return [];
  const asignado = ward(estandarizar(zonas.map(z => z.presion)), Math.min(k, zonas.length));
  const grupos = new Map<number, Zona[]>();
  zonas.forEach((z, i) => grupos.set(asignado[i], [...(grupos.get(asignado[i]) || []), z]));
  const resultado = [...grupos.values()].map(lista => {
    const presionMedia = NOMBRES_GRUPOS.map((_, j) => Math.round((lista.reduce((s, z) => s + z.presion[j], 0) / lista.length) * 10) / 10);
    const faltan = NOMBRES_GRUPOS.map((g, j) => ({ g, p: presionMedia[j] })).filter(x => x.p >= 2.5).sort((a, b) => b.p - a.p).map(x => x.g.toLowerCase());
    return { numero: 0, nombre: faltan.length ? `Faltan: ${faltan.join(', ')}` : 'Oferta suficiente', faltan, zonas: lista.sort((a, b) => b.vacantes - a.vacantes), presionMedia };
  });
  // PRIMERO EL GRUPO CON MÁS PRESIÓN (MISMO ORDEN QUE EL ANÁLISIS EN PYTHON)
  resultado.sort((a, b) => b.presionMedia.reduce((s, x) => s + x, 0) - a.presionMedia.reduce((s, x) => s + x, 0));
  resultado.forEach((g, i) => { g.numero = i + 1; });
  return resultado;
}

export const NOMBRES_GRUPOS_OFICIOS = NOMBRES_GRUPOS;
