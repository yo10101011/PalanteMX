// AYUDA PARA restaurar: GUARDA EN UN ARCHIVO LOS PERFILES DE PRUEBA QUE HAY EN FIREBASE Y LA HORA EN QUE SE CREARON
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('./cuenta-servicio.json', import.meta.url), 'utf8'))) });
const db = getFirestore();
const salida = { perfiles: {}, creado: null };
for (const c of ['Usuarios', 'Contratistas']) {
  const snap = await db.collection(c).where('es_prueba', '==', true).get();
  for (const d of snap.docs) {
    salida.perfiles[`${c}/${d.id}`] = d.data();
    const t = d.createTime.toDate().toISOString();
    if (!salida.creado || t < salida.creado) salida.creado = t;
  }
}
writeFileSync(process.argv[2], JSON.stringify(salida));
console.log(Object.keys(salida.perfiles).length, 'perfiles; creados', salida.creado);
process.exit(0);
