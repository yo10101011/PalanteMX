// BÚSQUEDA TOLERANTE: NO IMPORTAN ACENTOS NI MAYÚSCULAS, SE ACEPTA UNA LETRA EQUIVOCADA ("albanil", "plomro")
// Y SE RECONOCEN PALABRAS DE LA MISMA FAMILIA ("albañil" ENCUENTRA "Albañilería", "pintor" ENCUENTRA "Pintura").

export const normalizar = (texto: string) =>
  (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').trim();

const palabras = (texto: string) => normalizar(texto).split(/\s+/).filter(Boolean);

// DISTANCIA DE LEVENSHTEIN (CUÁNTAS LETRAS HAY QUE CAMBIAR PARA PASAR DE UNA PALABRA A OTRA)
const distancia = (a: string, b: string) => {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temporal = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = temporal;
    }
  }
  return fila[b.length];
};

// ¿LA PALABRA BUSCADA "PEGA" CON UNA PALABRA DEL TEXTO?
const pega = (buscada: string, palabra: string) => {
  if (palabra.startsWith(buscada)) return true;                                   // "plom" -> "plomeria"
  const raiz = Math.min(buscada.length, 5);
  if (buscada.length >= 4 && palabra.slice(0, raiz) === buscada.slice(0, raiz)) return true; // "pintor" -> "pintura"
  if (buscada.length >= 4) return distancia(buscada, palabra.slice(0, buscada.length)) <= 1; // "plomro" -> "plomero"
  return false;
};

// ¿EL TEXTO COINCIDE CON LO QUE SE BUSCA? TODAS LAS PALABRAS BUSCADAS DEBEN PEGAR CON ALGUNA DEL TEXTO
export const coincide = (texto: string, consulta: string) => {
  const buscadas = palabras(consulta);
  if (buscadas.length === 0) return true;
  const delTexto = palabras(texto);
  return buscadas.every(b => delTexto.some(p => pega(b, p)));
};

// SUGERENCIAS PARA AUTOCOMPLETAR: LAS FRASES DEL VOCABULARIO QUE COINCIDEN (SIN REPETIR, LAS QUE EMPIEZAN IGUAL PRIMERO)
export const sugerencias = (vocabulario: string[], consulta: string, maximo = 5) => {
  const c = normalizar(consulta);
  if (c.length < 2) return [];
  const unicas = [...new Map(vocabulario.filter(Boolean).map(v => [normalizar(v), v.trim()])).values()];
  return unicas
    .filter(v => normalizar(v) !== c && coincide(v, consulta))
    .sort((a, b) => Number(normalizar(b).startsWith(c)) - Number(normalizar(a).startsWith(c)) || a.length - b.length)
    .slice(0, maximo);
};
