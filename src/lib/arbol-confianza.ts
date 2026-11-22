// RECORRIDO DEL ÁRBOL DE DECISIÓN DE CONFIANZA. LO USAN **EL SERVIDOR** (backend/kyc-worker, TODOS LOS DÍAS A LAS 9 AM,
// GUARDA EL RESULTADO EN EL PERFIL: campo confianza) Y LA APP (src/lib/confianza.ts, SOLO SI EL SERVIDOR AÚN NO LO CALCULÓ).
// CÓDIGO PURO, SIN IMPORTS CON '@/', PARA QUE EL WORKER LO PUEDA EMPAQUETAR TAL CUAL.
//
// EL ÁRBOL PREGUNTA LA DISTANCIA A LA OBRA, QUE DEPENDE DE QUIÉN BUSCA AL TRABAJADOR. EL SERVIDOR NO LA SABE, ASÍ QUE
// GUARDA EL RESULTADO "POR TRAMOS": P. EJ. [{hasta_km: 13.1, nivel: 'Alta'}, {hasta_km: null, nivel: 'Media'}].
// LA APP SOLO ESCOGE EL TRAMO QUE CORRESPONDE A LA DISTANCIA REAL.
import { ARBOL_CONFIANZA, type NodoConfianza } from './modelo-confianza';

export type Nivel = 'Alta' | 'Media' | 'Baja' | 'Nuevo';
export type TramoConfianza = { hasta_km: number | null; nivel: Nivel; probabilidad: number }; // null = SIN LÍMITE
export type VariablesPerfil = { cumplimiento_previo: number; calificacion_previa: number; obras_previas: number };

// LAS VARIABLES DEL ÁRBOL QUE SALEN DEL PERFIL (LA DISTANCIA NO: ESA LA PONE CADA BÚSQUEDA)
export const variablesPerfil = (perfil: any): VariablesPerfil => {
  const c = perfil?.cumplimiento;
  return {
    cumplimiento_previo: c?.obras ? Number(c.porcentaje) : -1, // -1 = TODAVÍA NO TIENE OBRAS EN LA APP
    calificacion_previa: perfil?.numero_resenas ? parseFloat(perfil.calificacion) || 0 : 0,
    obras_previas: Array.isArray(perfil?.obras_realizadas) ? perfil.obras_realizadas.length : 0,
  };
};

// RECORRE EL ÁRBOL; CUANDO LA PREGUNTA ES LA DISTANCIA, SIGUE LOS DOS CAMINOS Y ANOTA HASTA QUÉ KM VALE CADA UNO
export function tramosConfianza(v: VariablesPerfil, arbol: NodoConfianza = ARBOL_CONFIANZA): TramoConfianza[] {
  const tramos: TramoConfianza[] = [];
  const recorrer = (nodo: NodoConfianza, desde: number, hasta: number) => {
    if (nodo.hoja) {
      tramos.push({ hasta_km: hasta === Infinity ? null : hasta, nivel: nodo.nivel, probabilidad: nodo.probabilidad });
      return;
    }
    if (nodo.variable === 'distancia_km') {
      if (desde <= nodo.umbral) recorrer(nodo.si, desde, Math.min(hasta, nodo.umbral));
      if (hasta > nodo.umbral) recorrer(nodo.no, Math.max(desde, nodo.umbral), hasta);
      return;
    }
    recorrer(v[nodo.variable] <= nodo.umbral ? nodo.si : nodo.no, desde, hasta);
  };
  recorrer(arbol, 0, Infinity);
  return tramos.sort((a, b) => (a.hasta_km ?? Infinity) - (b.hasta_km ?? Infinity));
}

// EL TRAMO QUE CORRESPONDE A UNA DISTANCIA
export const tramoPara = (tramos: TramoConfianza[], distanciaKm: number) =>
  tramos.find(t => t.hasta_km === null || distanciaKm <= t.hasta_km) || tramos[tramos.length - 1];
