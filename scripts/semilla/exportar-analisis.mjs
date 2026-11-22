// EXPORTA DE FIRESTORE LO QUE NECESITA EL ANÁLISIS DE DATOS (scripts/analisis/analisis.py) A UN ARCHIVO JSON.
// USO (EN ESTA CARPETA):  node exportar-analisis.mjs ../analisis/datos.json
// LEE TODO LO QUE HAY EN LA APP (USUARIOS REALES Y DE PRUEBA). NO GUARDA CONTRASEÑAS NI FOTOS DE LA INE.
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('./cuenta-servicio.json', import.meta.url), 'utf8'))) });
const db = getFirestore();

// SOLO LOS CAMPOS QUE USA EL ANÁLISIS (NADA DE CORREOS, TELÉFONOS NI FOTOS)
const CAMPOS = {
  Usuarios: ['nombre_usuario', 'oficio_principal', 'ubicacion', 'ubicacion_estado', 'ubicacion_texto', 'calificacion', 'numero_resenas', 'estado_cuenta', 'es_prueba'],
  Contratistas: ['nombre_usuario', 'ubicacion', 'ubicacion_estado', 'ubicacion_texto', 'es_prueba'],
  Vacantes: ['categoria', 'ubicacion', 'estado_republica', 'coordenadas', 'fecha_publicacion', 'inicio_obra', 'fin_obra', 'cupo_total', 'cupo_actual', 'estado', 'id_contratista', 'pago_monto', 'pago_periodo', 'es_prueba'],
  Postulaciones: ['id_vacante', 'id_trabajador', 'id_contratista', 'estado', 'oficio_trabajador', 'inicio_obra', 'fin_obra', 'timestamp_inicio', 'timestamp_fin', 'timestamp_cancelacion', 'cancelado_por', 'cancelacion_tardia', 'revision_cierre', 'reportes_abiertos', 'vacante', 'es_prueba'],
  Quejas_Soporte: ['tipo', 'motivo', 'id_contrato', 'id_reportante', 'id_acusado', 'estado', 'fecha_reporte', 'responsable', 'es_prueba'],
  Resenas_Plataforma: ['evaluador_id', 'evaluado_id', 'evaluado_rol', 'estrellas', 'timestamp', 'es_prueba'],
};
const limpiar = (v) => v instanceof Timestamp ? v.toDate().toISOString() : Array.isArray(v) ? v.map(limpiar) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiar(x)])) : v;

const salida = { exportado: new Date().toISOString() };
for (const [coleccion, campos] of Object.entries(CAMPOS)) {
  const snap = await db.collection(coleccion).get();
  salida[coleccion] = snap.docs.map(d => {
    const datos = d.data();
    const fila = { id: d.id };
    for (const c of campos) if (datos[c] !== undefined) fila[c] = limpiar(datos[c]);
    if (coleccion === 'Postulaciones' && fila.vacante) fila.vacante = { coordenadas: fila.vacante.coordenadas, oficio: fila.vacante.oficio, ubicacion: fila.vacante.ubicacion };
    return fila;
  });
  console.log(`${coleccion}: ${salida[coleccion].length}`);
}
writeFileSync(process.argv[2] || 'datos-analisis.json', JSON.stringify(salida));
process.exit(0);
