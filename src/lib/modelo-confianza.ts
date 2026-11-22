// ARCHIVO GENERADO POR scripts/analisis/analisis.py — NO EDITAR A MANO (VUELVE A CORRER EL ANÁLISIS).
// ÁRBOL DE DECISIÓN ENTRENADO CON 199 OBRAS TERMINADAS (143 SIN PROBLEMAS). VALIDACIÓN CRUZADA:
// EXACTITUD BALANCEADA 59%; OBRAS QUE MARCA COMO CONFIABLES: 78% SIN PROBLEMAS,
// COMO RIESGO: 62%. VARIABLES: cumplimiento_previo, calificacion_previa, obras_previas, distancia_km.
// 'si' = LA VARIABLE ES MENOR O IGUAL AL UMBRAL. cumplimiento_previo = -1 CUANDO NO TIENE OBRAS EN LA APP.
export type NodoConfianza =
  | { hoja: true; probabilidad: number; nivel: 'Alta' | 'Media' | 'Baja' | 'Nuevo'; obras: number }
  | { hoja: false; variable: 'cumplimiento_previo' | 'calificacion_previa' | 'obras_previas' | 'distancia_km'; umbral: number; si: NodoConfianza; no: NodoConfianza };

export const ARBOL_CONFIANZA: NodoConfianza = {
  "hoja": false,
  "variable": "cumplimiento_previo",
  "umbral": 63.5,
  "si": {
    "hoja": false,
    "variable": "cumplimiento_previo",
    "umbral": -0.5,
    "si": {
      "hoja": true,
      "probabilidad": 0.742,
      "nivel": "Nuevo",
      "obras": 62
    },
    "no": {
      "hoja": false,
      "variable": "cumplimiento_previo",
      "umbral": 12.5,
      "si": {
        "hoja": true,
        "probabilidad": 0.357,
        "nivel": "Baja",
        "obras": 28
      },
      "no": {
        "hoja": true,
        "probabilidad": 0.625,
        "nivel": "Media",
        "obras": 24
      }
    }
  },
  "no": {
    "hoja": false,
    "variable": "distancia_km",
    "umbral": 13.1,
    "si": {
      "hoja": false,
      "variable": "obras_previas",
      "umbral": 1.5,
      "si": {
        "hoja": true,
        "probabilidad": 0.87,
        "nivel": "Alta",
        "obras": 23
      },
      "no": {
        "hoja": true,
        "probabilidad": 0.966,
        "nivel": "Alta",
        "obras": 29
      }
    },
    "no": {
      "hoja": true,
      "probabilidad": 0.727,
      "nivel": "Media",
      "obras": 33
    }
  }
};

export const ENTRENADO = { obras: 199, fecha: '2026-11-19', exactitud_balanceada: 0.59 };
