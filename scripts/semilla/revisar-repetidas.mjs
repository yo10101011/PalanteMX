// REVISA QUE LAS FOTOS DE PRUEBA NO SE REPITAN: VACANTES, DÍAS DE BITÁCORA, COMPROBANTES DE PAGO Y PORTAFOLIOS.
// (UNA VACANTE Y SUS CONTRATOS COMPARTEN FOTO A PROPÓSITO, POR ESO SOLO SE CUENTA LA DE LA VACANTE)
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('./cuenta-servicio.json', import.meta.url), 'utf8'))) });
const db = getFirestore();
const usos = new Map();
const anotar = (url, donde) => { if (typeof url === 'string' && url.includes('staticflickr')) usos.set(url, [...(usos.get(url) || []), donde]); };
const todas = (v, donde) => {
  if (typeof v === 'string') anotar(v, donde);
  else if (Array.isArray(v)) v.forEach((x, k) => todas(x, `${donde}[${k}]`));
  else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) Object.entries(v).forEach(([k, x]) => todas(x, `${donde}.${k}`));
};
for (const d of (await db.collection('Vacantes').where('es_prueba', '==', true).get()).docs) anotar(d.data().foto_trabajo, `Vacante ${d.id}`);
for (const d of (await db.collection('Postulaciones').where('es_prueba', '==', true).get()).docs) {
  (d.data().pagos || []).forEach((p, k) => anotar(p.comprobante, `Pago ${d.id}[${k}]`));
  for (const b of (await d.ref.collection('Bitacora').get()).docs) todas(b.data(), `Bitácora ${d.id}/${b.id}`);
}
for (const d of (await db.collection('Usuarios').where('es_prueba', '==', true).get()).docs) todas(d.data().portafolio, `Portafolio ${d.id}`);
for (const d of (await db.collection('Quejas_Soporte').where('es_prueba', '==', true).get()).docs) todas(d.data(), `Reporte ${d.id}`);
const repetidas = [...usos].filter(([, l]) => l.length > 1);
console.log(`${[...usos.values()].flat().length} fotos usadas, ${usos.size} distintas, ${repetidas.length} repetidas`);
repetidas.slice(0, 10).forEach(([u, l]) => console.log(' ', u.slice(-30), l.join(' | ')));
process.exit(0);
