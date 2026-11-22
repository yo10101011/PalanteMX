// REPARTE LAS FOTOS DE fotos-prueba.mjS EN LOS DATOS DE PRUEBA QUE YA ESTÁN EN FIREBASE, SIN QUE NINGUNA SE REPITA.
// VUELVE A ARMAR LOS DATOS (SON SIEMPRE LOS MISMOS CON LA MISMA FECHA) Y, EN CADA LUGAR DONDE HAY UNA FOTO DE PRUEBA
// (live.staticflickr.com), PONE LA QUE LE TOCA AHORA. NO TOCA LO DEMÁS NI LAS FOTOS QUE SUBIÓ ALGUIEN DESDE LA APP.
// USO (EN ESTA CARPETA):  node arreglar-fotos.mjs --ahora 2026-11-16T19:35:00Z
//   (--ahora = CUÁNDO SE CORRIÓ crear-pruebas.mjs; volcar.mjs LO DICE: "creados ...")
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const i = process.argv.indexOf('--ahora');
const ahora = i > -1 ? process.argv[i + 1] : undefined;
if (!ahora) { console.error('\nFalta --ahora (la fecha en que se crearon los datos de prueba).\n'); process.exit(1); }
const ARCHIVO_LLAVE = new URL('./cuenta-servicio.json', import.meta.url);
if (!existsSync(ARCHIVO_LLAVE)) { console.error('\nFalta el archivo cuenta-servicio.json en la carpeta scripts/semilla.\n'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(readFileSync(ARCHIVO_LLAVE, 'utf8'))) });
const db = getFirestore();

// 1. LOS DATOS COMO LOS ARMA EL GENERADOR (CON LAS FOTOS NUEVAS)
const archivo = join(mkdtempSync(join(tmpdir(), 'semilla-')), 'generado.json');
execFileSync('node', ['crear-pruebas.mjs', '--simular', '--ahora', ahora, '--exportar', archivo], { cwd: new URL('.', import.meta.url) });
const generado = JSON.parse(readFileSync(archivo, 'utf8')).docs;

// 2. RECORRE LO QUE HAY Y LO GENERADO AL MISMO TIEMPO; SOLO CAMBIA TEXTOS QUE SON FOTOS DE PRUEBA
const esFotoPrueba = (v) => typeof v === 'string' && v.startsWith('https://live.staticflickr.com/');
let cambios = 0;
const arreglar = (actual, nuevo) => {
  if (esFotoPrueba(actual)) {
    if (esFotoPrueba(nuevo) && nuevo !== actual) { cambios++; return nuevo; }
    return actual;
  }
  if (Array.isArray(actual)) return actual.map((x, k) => arreglar(x, Array.isArray(nuevo) ? nuevo[k] : undefined));
  if (actual && typeof actual === 'object' && Object.getPrototypeOf(actual) === Object.prototype) {
    return Object.fromEntries(Object.entries(actual).map(([k, x]) => [k, arreglar(x, nuevo && typeof nuevo === 'object' ? nuevo[k] : undefined)]));
  }
  return actual;
};

let documentos = 0;
const rutas = Object.keys(generado);
for (let k = 0; k < rutas.length; k += 100) {
  const grupo = rutas.slice(k, k + 100);
  const snaps = await db.getAll(...grupo.map(r => db.doc(r)));
  const lote = db.batch();
  let enLote = 0;
  snaps.forEach((snap, j) => {
    if (!snap.exists) return;
    const antes = cambios;
    const datos = arreglar(snap.data(), generado[grupo[j]]);
    if (cambios > antes) { lote.set(snap.ref, datos); enLote++; documentos++; }
  });
  if (enLote) await lote.commit();
  process.stdout.write(`  Revisados ${Math.min(k + 100, rutas.length)} de ${rutas.length}\r`);
}
console.log(`\nListo: ${cambios} fotos cambiadas en ${documentos} documentos.\n`);
process.exit(0);
