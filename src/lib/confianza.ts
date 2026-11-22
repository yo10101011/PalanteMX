// ÍNDICE DE CONFIANZA DE UN TRABAJADOR. RECORRE EL ÁRBOL DE DECISIÓN DE modelo-confianza.ts (ENTRENADO EN
// scripts/analisis CON LAS OBRAS YA TERMINADAS EN LA APP) CON LO QUE SE SABE DEL TRABAJADOR AHORA:
//   - cumplimiento: % DE SUS OBRAS EN LA APP SIN FALTAS, REPORTES NI CANCELACIÓN TARDÍA (LO CALCULA EL SERVIDOR CADA DÍA)
//   - su calificación, cuántas obras ha terminado y la distancia a quien lo busca (o a la obra)
// DEVUELVE EL NIVEL (ALTA / MEDIA / BAJA, O NUEVO SI AÚN NO TIENE OBRAS) Y LA PROBABILIDAD DE QUE LA OBRA SALGA BIEN.
//
// ANALÍTICA EN LA NUBE: EL SERVIDOR (CLOUDFLARE WORKERS) RECORRE EL ÁRBOL TODOS LOS DÍAS A LAS 9 AM Y GUARDA EL RESULTADO
// EN EL PERFIL (confianza.tramos). LA APP SOLO ESCOGE EL TRAMO SEGÚN LA DISTANCIA. SI EL PERFIL TODAVÍA NO LO TRAE,
// LO CALCULA AQUÍ CON EL MISMO CÓDIGO (lib/arbol-confianza.ts).
import { tramoPara, tramosConfianza, variablesPerfil, type TramoConfianza } from '@/lib/arbol-confianza';
import { ENTRENADO } from '@/lib/modelo-confianza';

export type NivelConfianza = 'Alta' | 'Media' | 'Baja' | 'Nuevo';
export type ResultadoConfianza = {
  nivel: NivelConfianza;
  probabilidad: number;   // 0 A 1: PROPORCIÓN DE OBRAS SIN PROBLEMAS EN ESA HOJA DEL ÁRBOL
  titulo: string;         // "Confianza alta", "Nuevo en PalanteMX"...
  detalle: string;        // EXPLICACIÓN CORTA PARA LA PERSONA
  color: string;
  fondo: string;
};

// SI NO SE SABE LA DISTANCIA (P. EJ. EL CONTRATISTA NO TIENE UBICACIÓN), SE USA UNA TÍPICA QUE NO CASTIGA NI PREMIA
const DISTANCIA_TIPICA_KM = 10;

const ESTILO: Record<NivelConfianza, { titulo: string; color: string; fondo: string }> = {
  Alta: { titulo: 'Confianza alta', color: '#047857', fondo: '#ECFDF5' },
  Media: { titulo: 'Confianza media', color: '#B45309', fondo: '#FFFBEB' },
  Baja: { titulo: 'Confianza baja', color: '#B91C1C', fondo: '#FEF2F2' },
  Nuevo: { titulo: 'Nuevo en PalanteMX', color: '#1D4ED8', fondo: '#EFF6FF' },
};

export const variablesDe = (trabajador: any, distanciaKm?: number | null) =>
  ({ ...variablesPerfil(trabajador), distancia_km: distanciaKm ?? DISTANCIA_TIPICA_KM });

// LOS TRAMOS QUE GUARDÓ EL SERVIDOR (O, SI NO HAY, LOS QUE SE CALCULAN AQUÍ)
export const tramosDe = (trabajador: any): TramoConfianza[] => {
  const guardados = trabajador?.confianza?.tramos;
  return Array.isArray(guardados) && guardados.length ? guardados : tramosConfianza(variablesPerfil(trabajador));
};

export function confianzaDe(trabajador: any, distanciaKm?: number | null): ResultadoConfianza {
  const nodo = tramoPara(tramosDe(trabajador), distanciaKm ?? DISTANCIA_TIPICA_KM);

  const c = trabajador?.cumplimiento;
  const detalle = c?.obras
    ? `Cumplió sin problemas ${c.sin_problemas} de ${c.obras} obra${c.obras === 1 ? '' : 's'} en la app. De cada 10 obras con un perfil así, ${Math.round(nodo.probabilidad * 10)} terminaron sin problemas.`
    : 'Todavía no termina obras en la app: revisa sus reseñas y su portafolio, y platica en el chat antes de contratar.';
  return { nivel: nodo.nivel, probabilidad: nodo.probabilidad, detalle, ...ESTILO[nodo.nivel] };
}

// PARA ORDENAR "MÁS CONFIABLES": ALTA > MEDIA > NUEVO > BAJA (Y DENTRO DE CADA NIVEL, LA PROBABILIDAD)
const PESO: Record<NivelConfianza, number> = { Alta: 3, Media: 2, Nuevo: 1, Baja: 0 };
export const puntajeConfianza = (r: ResultadoConfianza) => PESO[r.nivel] + r.probabilidad;

export const TEXTO_MODELO = `Lo calcula un árbol de decisión entrenado con ${ENTRENADO.obras} obras terminadas en PalanteMX, a partir del cumplimiento, la calificación, las obras terminadas y la distancia. Lo aplica el servidor en la nube a todos los trabajadores.`;
