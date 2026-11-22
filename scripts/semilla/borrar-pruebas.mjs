// BORRA TODO LO QUE CREÓ crear-pruebas.mjs: LAS CUENTAS CON CORREO @palantemx.test Y TODOS LOS DOCUMENTOS CON
// es_prueba: true (CON SUS SUBCOLECCIONES: BITÁCORA DE LOS CONTRATOS Y MENSAJES DE LOS CHATS).
// LOS USUARIOS Y DATOS REALES NO SE TOCAN.
// USO (EN ESTA CARPETA):  npm run borrar
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ARCHIVO_LLAVE = new URL('./cuenta-servicio.json', import.meta.url);
if (!existsSync(ARCHIVO_LLAVE)) {
  console.error('\nFalta el archivo cuenta-servicio.json en la carpeta scripts/semilla.\n');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(ARCHIVO_LLAVE, 'utf8'))) });
const auth = getAuth();
const db = getFirestore();
const DOMINIO_PRUEBAS = '@palantemx.test';

// 1. CUENTAS DE FIREBASE AUTHENTICATION
let borradas = 0;
let pagina;
do {
  const lista = await auth.listUsers(1000, pagina);
  const dePrueba = lista.users.filter(u => u.email?.endsWith(DOMINIO_PRUEBAS)).map(u => u.uid);
  if (dePrueba.length) { await auth.deleteUsers(dePrueba); borradas += dePrueba.length; }
  pagina = lista.pageToken;
} while (pagina);
console.log(`Cuentas borradas: ${borradas}`);

// 2. DOCUMENTOS (recursiveDelete TAMBIÉN BORRA LA BITÁCORA Y LOS MENSAJES QUE CUELGAN DE CADA UNO)
const COLECCIONES = ['Usuarios', 'Contratistas', 'Vacantes', 'Postulaciones', 'Chats', 'Quejas_Soporte', 'Resenas_Plataforma', 'Notificaciones', 'Actividad'];
for (const coleccion of COLECCIONES) {
  const snap = await db.collection(coleccion).where('es_prueba', '==', true).get();
  for (const d of snap.docs) await db.recursiveDelete(d.ref);
  console.log(`${coleccion}: ${snap.size} borrados`);
}

// 3. EL EJEMPLO DE INGRESOS POR COMERCIALES (SOLO SI LO PUSO EL SCRIPT; SI YA LO EDITASTE A MANO, SE QUEDA)
const finanzas = await db.doc('Sistema/Finanzas').get();
if (finanzas.exists && finanzas.data().es_prueba === true) {
  await finanzas.ref.delete();
  console.log('Sistema/Finanzas de ejemplo borrado');
}
console.log('\nListo: ya no quedan datos de prueba.\n');
process.exit(0);
