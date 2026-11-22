// CALCULA YA EL "CUMPLIMIENTO" DE TODOS LOS TRABAJADORES (LO MISMO QUE HACE EL SERVIDOR CADA DÍA A LAS 9 AM EN
// actualizarCumplimientoTodos). SIRVE DESPUÉS DE CREAR DATOS DE PRUEBA, PARA NO ESPERAR AL DÍA SIGUIENTE.
// USO (EN ESTA CARPETA):  node calcular-cumplimiento.mjs
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('./cuenta-servicio.json', import.meta.url), 'utf8'))) });
const db = getFirestore();

const [trabajadores, contratos, quejas] = await Promise.all(['Usuarios', 'Postulaciones', 'Quejas_Soporte'].map(c => db.collection(c).get()));
const acusado = new Map();
for (const q of quejas.docs) { const { id_acusado, id_contrato } = q.data(); if (id_acusado && id_contrato) acusado.set(id_acusado, (acusado.get(id_acusado) || new Set()).add(id_contrato)); }

const lote = db.batch();
let n = 0;
for (const t of trabajadores.docs) {
  let obras = 0, sinProblemas = 0;
  for (const c of contratos.docs.filter(c => c.data().id_trabajador === t.id)) {
    const k = c.data();
    const tardia = !!k.cancelacion_tardia;
    if (!k.timestamp_inicio || !(k.estado === 'Finalizada' || (k.estado === 'Cancelada' && tardia))) continue;
    obras++;
    const problema = !!k.revision_cierre || (acusado.get(t.id)?.has(c.id) ?? false) || (k.cancelado_por === t.id && tardia);
    if (!problema) sinProblemas++;
  }
  lote.update(t.ref, { cumplimiento: { obras, sin_problemas: sinProblemas, porcentaje: obras ? Math.round(100 * sinProblemas / obras) : null, actualizado: new Date().toISOString() } });
  n++;
}
await lote.commit();
console.log(`Cumplimiento calculado para ${n} trabajadores.`);
process.exit(0);
