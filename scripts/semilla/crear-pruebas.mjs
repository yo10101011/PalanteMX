// =====================================================================================================================
// DATOS DE PRUEBA DE PALANTEMX: 50 USUARIOS (35 TRABAJADORES Y 15 CONTRATISTAS) CON TODO LO QUE LLEVA UNA CUENTA REAL:
// PERFIL VERIFICADO, VACANTES, CONTRATOS EN TODOS LOS ESTADOS, BITÁCORA DÍA POR DÍA CON GPS Y FOTOS, PAGOS CON
// COMPROBANTE, CHATS, RESEÑAS, REPORTES (ABIERTOS Y RESUELTOS), NOTIFICACIONES, PORTAFOLIO Y ACTIVIDAD DIARIA.
//
// TODO LO QUE SE CREA LLEVA es_prueba: true Y LOS CORREOS TERMINAN EN @palantemx.test, PARA BORRARLO CON
// borrar-pruebas.mjs SIN TOCAR A LOS USUARIOS REALES. LAS FECHAS SE CALCULAN DESDE EL DÍA EN QUE SE CORRE.
//
// USO (EN ESTA CARPETA):  npm install   y luego   npm run crear
// NECESITA cuenta-servicio.json (Firebase > Configuración del proyecto > Cuentas de servicio > Generar nueva clave).
// =====================================================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { FOTOS, fotoDeOficio, fotoDeRecibo } from './fotos-prueba.mjs';

// node crear-pruebas.mjs --simular  ->  ARMA TODO Y MUESTRA EL RESUMEN, PERO NO ESCRIBE NADA EN FIREBASE
const SIMULAR = process.argv.includes('--simular');
const ARCHIVO_LLAVE = new URL('./cuenta-servicio.json', import.meta.url);
if (!SIMULAR && !existsSync(ARCHIVO_LLAVE)) {
  console.error('\nFalta el archivo cuenta-servicio.json en la carpeta scripts/semilla.\nDescárgalo de Firebase > Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada.\n');
  process.exit(1);
}
const vacio = { exists: false, empty: true, docs: [], data: () => undefined };
const consultaFalsa = { get: async () => vacio, limit: () => consultaFalsa, where: () => consultaFalsa };
if (!SIMULAR) initializeApp({ credential: cert(JSON.parse(readFileSync(ARCHIVO_LLAVE, 'utf8'))) });
const auth = SIMULAR ? { createUser: async () => {} } : getAuth();
const db = SIMULAR ? { doc: () => consultaFalsa, collection: () => consultaFalsa } : getFirestore();
if (!SIMULAR) db.settings({ ignoreUndefinedProperties: true });

export const DOMINIO_PRUEBAS = '@palantemx.test';
// LA CONTRASEÑA DE LAS CUENTAS DE PRUEBA NO SE ESCRIBE AQUÍ (EL REPOSITORIO ES PÚBLICO): SE TOMA DE LA VARIABLE
// CONTRASENA_PRUEBAS. EN POWERSHELL, ANTES DE CORRER EL SCRIPT:   $env:CONTRASENA_PRUEBAS = "la-contraseña"
const CONTRASENA = process.env.CONTRASENA_PRUEBAS || '';
const exigirContrasena = () => {
  if (CONTRASENA.length >= 6) return;
  console.error('\nFalta la contraseña de las cuentas de prueba. En PowerShell escribe:  $env:CONTRASENA_PRUEBAS = "la-contraseña"  y vuelve a correr.\n');
  process.exit(1);
};

// ------------------------------------------------------------------------------------------------ AZAR REPETIBLE
// SIEMPRE SALEN LOS MISMOS DATOS (MISMA SEMILLA), PARA QUE SI SE BORRA Y SE VUELVE A CREAR, QUEDE IGUAL
let semilla = 20261116;
const azar = () => { semilla |= 0; semilla = (semilla + 0x6D2B79F5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const entre = (a, b) => Math.floor(a + azar() * (b - a + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const probabilidad = (p) => azar() < p;
const idFirebase = (n = 28) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(azar() * 62)]).join('');
const idCorto = () => idFirebase(20);

// ------------------------------------------------------------------------------------------------ FECHAS (HORA DEL CENTRO DE MÉXICO)
const ZONA = 'America/Mexico_City';
const claveMexico = (f) => f.toLocaleDateString('en-CA', { timeZone: ZONA });            // 'AAAA-MM-DD'
const fechaMx = (f) => f.toLocaleDateString('es-MX', { timeZone: ZONA });                // '16/11/2026'
const horaMx = (f) => f.toLocaleTimeString('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
const fechaLarga = (f) => f.toLocaleDateString('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
// --ahora 2026-11-16T19:35:00Z  ->  ARMA LOS DATOS COMO SI SE HUBIERA CORRIDO EN ESA FECHA (PARA restaurar UN PERFIL)
const argumento = (nombre) => { const i = process.argv.indexOf(nombre); return i > -1 ? process.argv[i + 1] : undefined; };
const AHORA = argumento('--ahora') ? new Date(argumento('--ahora')) : new Date();
const [HA, HM, HD] = claveMexico(AHORA).split('-').map(Number);
// DÍA RELATIVO A HOY (0 = HOY, -1 = AYER...) A LA HORA INDICADA (HORA DE MÉXICO, UTC-6)
const dia = (desplazamiento, hora = 12, minuto = 0) => new Date(Date.UTC(HA, HM - 1, HD + desplazamiento, hora + 6, minuto));
const SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const diaSemana = (f) => SEMANA[new Date(`${claveMexico(f)}T12:00:00-06:00`).getUTCDay()];
// DÍAS DE TRABAJO ENTRE DOS DESPLAZAMIENTOS (INCLUSIVE), SEGÚN LOS DÍAS DE LA SEMANA DE LA OBRA
const diasDeTrabajo = (desde, hasta, diasObra) => {
  const lista = [];
  for (let d = desde; d <= hasta; d++) if (diasObra.includes(diaSemana(dia(d)))) lista.push(d);
  return lista;
};

// ------------------------------------------------------------------------------------------------ CATÁLOGOS
const LUGARES = [
  { region: 'centro', estado: 'Estado de México', municipio: 'Toluca', lat: 19.2826, lng: -99.6557, lada: '722' },
  { region: 'centro', estado: 'Estado de México', municipio: 'Metepec', lat: 19.2511, lng: -99.6047, lada: '722' },
  { region: 'centro', estado: 'Estado de México', municipio: 'Zinacantepec', lat: 19.2839, lng: -99.7339, lada: '722' },
  { region: 'centro', estado: 'Estado de México', municipio: 'Naucalpan de Juárez', lat: 19.4785, lng: -99.2396, lada: '55' },
  { region: 'centro', estado: 'Estado de México', municipio: 'Ecatepec de Morelos', lat: 19.6018, lng: -99.0507, lada: '55' },
  { region: 'centro', estado: 'Ciudad de México', municipio: 'Iztapalapa', lat: 19.3574, lng: -99.0594, lada: '55' },
  { region: 'centro', estado: 'Ciudad de México', municipio: 'Coyoacán', lat: 19.3467, lng: -99.1617, lada: '55' },
  { region: 'centro', estado: 'Ciudad de México', municipio: 'Gustavo A. Madero', lat: 19.4820, lng: -99.1100, lada: '55' },
  { region: 'puebla', estado: 'Puebla', municipio: 'Puebla', lat: 19.0414, lng: -98.2063, lada: '222' },
  { region: 'puebla', estado: 'Puebla', municipio: 'San Andrés Cholula', lat: 19.0510, lng: -98.2990, lada: '222' },
  { region: 'queretaro', estado: 'Querétaro', municipio: 'Querétaro', lat: 20.5888, lng: -100.3899, lada: '442' },
  { region: 'queretaro', estado: 'Querétaro', municipio: 'Corregidora', lat: 20.5361, lng: -100.4420, lada: '442' },
];
const lugaresDe = (region) => LUGARES.filter(l => l.region === region);
const COLONIAS = ['Col. Centro', 'Col. San Lorenzo', 'Fracc. Las Américas', 'Col. Independencia', 'Col. La Joya', 'Barrio de San Juan', 'Col. Del Valle', 'Col. Santa Cruz', 'Fracc. Los Pinos', 'Col. Reforma', 'Col. Emiliano Zapata', 'Col. Benito Juárez'];
const CALLES = ['Av. Hidalgo', 'Calle Morelos', 'Calle 5 de Mayo', 'Av. Juárez', 'Calle Allende', 'Calle Aldama', 'Av. Independencia', 'Calle Guerrero', 'Calle Matamoros', 'Calle Nicolás Bravo', 'Av. Lerdo', 'Calle Galeana'];

const HOMBRES = ['JOSÉ', 'JUAN', 'MIGUEL', 'LUIS', 'CARLOS', 'JORGE', 'FRANCISCO', 'ALEJANDRO', 'PEDRO', 'RICARDO', 'ROBERTO', 'FERNANDO', 'JAVIER', 'RAÚL', 'MARIO', 'ARTURO', 'EDUARDO', 'SERGIO', 'ANTONIO', 'DANIEL', 'ÓSCAR', 'HÉCTOR', 'RAFAEL', 'MARTÍN', 'GERARDO', 'ALFREDO', 'ENRIQUE', 'VÍCTOR', 'JESÚS', 'ISRAEL', 'ULISES', 'ERNESTO', 'ADRIÁN', 'SALVADOR', 'ABEL'];
const MUJERES = ['MARÍA', 'GUADALUPE', 'ROSA', 'VERÓNICA', 'LETICIA', 'PATRICIA', 'ADRIANA', 'GABRIELA', 'CLAUDIA', 'SANDRA', 'LAURA', 'ALEJANDRA', 'MÓNICA', 'YOLANDA', 'ELENA'];
const APELLIDOS = ['HERNÁNDEZ', 'GARCÍA', 'MARTÍNEZ', 'LÓPEZ', 'GONZÁLEZ', 'PÉREZ', 'RODRÍGUEZ', 'SÁNCHEZ', 'RAMÍREZ', 'CRUZ', 'FLORES', 'GÓMEZ', 'MORALES', 'VÁZQUEZ', 'JIMÉNEZ', 'REYES', 'DÍAZ', 'TORRES', 'GUTIÉRREZ', 'RUIZ', 'MENDOZA', 'AGUILAR', 'ORTIZ', 'CASTILLO', 'MORENO', 'ROMERO', 'ÁLVAREZ', 'CHÁVEZ', 'RIVERA', 'JUÁREZ', 'DOMÍNGUEZ', 'VEGA', 'SALAZAR', 'CORTÉS', 'GUERRERO', 'MEDINA', 'CASTRO', 'VARGAS', 'ESTRADA', 'NAVARRO'];

// OFICIO -> CUÁNTOS TRABAJADORES, TARIFA POR DÍA Y PALABRA PARA BUSCAR FOTOS
const OFICIOS = {
  'Albañil': { n: 7, tarifa: [480, 650], foto: 'construction,bricklayer' },
  'Ayudante general': { n: 4, tarifa: [300, 400], foto: 'construction,worker' },
  'Plomero': { n: 4, tarifa: [500, 800], foto: 'plumbing,pipes' },
  'Electricista': { n: 4, tarifa: [550, 900], foto: 'electrician,wiring' },
  'Pintor': { n: 3, tarifa: [420, 550], foto: 'painting,wall' },
  'Carpintero': { n: 3, tarifa: [500, 750], foto: 'carpentry,wood' },
  'Herrero': { n: 2, tarifa: [500, 700], foto: 'welding,metal' },
  'Jardinero': { n: 2, tarifa: [350, 450], foto: 'garden,gardening' },
  'Azulejero': { n: 2, tarifa: [500, 700], foto: 'tiles,floor' },
  'Impermeabilizador': { n: 1, tarifa: [450, 600], foto: 'roof,rooftop' },
  'Yesero': { n: 1, tarifa: [450, 600], foto: 'plaster,wall' },
  'Tablaroquero': { n: 1, tarifa: [500, 650], foto: 'drywall,construction' },
  'Técnico en refrigeración y aire acondicionado': { n: 1, tarifa: [600, 900], foto: 'airconditioner' },
};
const fotoTrabajo = (oficio, n) => fotoDeOficio(oficio, n);
const fotoComprobante = (n) => fotoDeRecibo(n);
const USO_FOTOS = {}; // CUÁNTAS FOTOS PIDE CADA OFICIO (PARA SABER SI ALCANZAN SIN REPETIRSE)
// CADA OFICIO LLEVA SU PROPIA CUENTA (0, 1, 2...) PARA QUE NINGUNA FOTO SE REPITA (fotos-prueba.mjs TIENE SUFICIENTES)
const nuevaFoto = (oficio) => { const n = USO_FOTOS[oficio] || 0; USO_FOTOS[oficio] = n + 1; return fotoTrabajo(oficio, n); };
let contadorRecibos = 0;

// LO QUE SE ESCRIBE CADA DÍA EN LA BITÁCORA, POR OFICIO (EN ORDEN DE AVANCE)
const NOTAS = {
  'Albañil': ['Trazo y excavación de la cepa para la cimentación.', 'Se coló la zapata corrida y se dejaron las varillas de los castillos.', 'Se levantaron 6 hiladas de block en el tramo norte.', 'Se armaron y colaron los castillos del primer tramo.', 'Se avanzó con el muro del tramo sur, ya va a 1.80 m.', 'Se coló la cadena de cerramiento.', 'Aplanado de mezcla en la cara exterior.', 'Detalles, limpieza general y retiro de escombro.'],
  'Ayudante general': ['Acarreo de material y preparación de mezcla.', 'Limpieza del terreno y apoyo al maestro con el block.', 'Se cribó arena y se acomodó la varilla.', 'Apoyo en el colado y retiro de escombro.', 'Limpieza general al terminar la jornada.'],
  'Plomero': ['Revisión de la fuga y corte del muro para llegar a la tubería.', 'Cambio de tubería de cobre dañada y prueba de presión.', 'Instalación de llaves nuevas en lavabo y regadera.', 'Se resanó el muro y se probó todo sin fugas.'],
  'Electricista': ['Revisión del tablero y trazo de las nuevas salidas.', 'Ranurado de muros y colocación de poliducto.', 'Cableado de contactos y apagadores de planta baja.', 'Cableado de planta alta y conexión al centro de carga.', 'Instalación de luminarias y pruebas de carga.', 'Revisión final con el cliente, todo funcionando.'],
  'Pintor': ['Lijado y resanado de grietas en muros.', 'Se aplicó sellador en toda la fachada.', 'Primera mano de pintura en fachada principal.', 'Segunda mano y detalles en marcos de ventanas.', 'Pintura de barandal y limpieza del área.'],
  'Carpintero': ['Toma de medidas finales y corte de tableros.', 'Armado de los cuerpos de los closets.', 'Instalación de cajones y entrepaños.', 'Colocación de puertas y jaladeras.', 'Ajuste de bisagras, sellado y limpieza.'],
  'Herrero': ['Toma de medidas y compra de perfiles.', 'Corte y soldadura del marco de la puerta.', 'Armado de la hoja y colocación de lámina.', 'Instalación en sitio y aplicación de primer anticorrosivo.', 'Pintura final y ajuste de chapa.'],
  'Jardinero': ['Poda de árboles y retiro de ramas secas.', 'Corte de pasto y deshierbe de jardineras.', 'Se sembraron plantas nuevas y se abonó la tierra.'],
  'Azulejero': ['Retiro del piso viejo y nivelación del firme.', 'Colocación de piso en la sala, 12 m².', 'Colocación de piso en comedor y pasillo.', 'Cortes en orillas y colocación de zoclo.', 'Emboquillado y limpieza del piso.'],
  'Impermeabilizador': ['Limpieza de la azotea y resanado de grietas.', 'Aplicación de sellador y malla en zonas críticas.', 'Aplicación de impermeabilizante, primera mano.', 'Segunda mano y revisión de bajadas de agua.'],
  'Yesero': ['Preparación de muros y colocación de reglas.', 'Aplicación de yeso en recámara principal.', 'Yeso en recámaras 2 y 3.', 'Yeso en sala y pasillo.', 'Detalles en esquinas y limpieza.'],
  'Tablaroquero': ['Trazo y colocación de canales.', 'Colocación de postes y primera cara de tablaroca.', 'Instalación eléctrica dentro del muro y segunda cara.', 'Encintado y primera capa de pasta.', 'Lijado, segunda capa de pasta y detalles.'],
  'Técnico en refrigeración y aire acondicionado': ['Instalación de la base y la unidad exterior.', 'Conexión de tubería, vacío y carga de gas; equipo funcionando.'],
};

// PLANTILLAS DE VACANTES POR OFICIO
const PLANTILLAS = {
  'Albañil': [
    { titulo: 'Barda perimetral de block de 25 metros', descripcion: 'Levantar barda de block de 25 m de largo por 2.5 m de alto, con castillos cada 3 m y cadena de cerramiento. El material ya está en el terreno.' },
    { titulo: 'Construcción de cuarto de 4 x 4 m en azotea', descripcion: 'Cuarto de block con losa de concreto, una ventana y una puerta. Incluye castillos, cadenas y aplanado.' },
    { titulo: 'Colado de losa de 6 x 8 m', descripcion: 'Armado de cimbra, varilla y colado de losa para segunda planta. Se necesita gente con experiencia en colados.' },
    { titulo: 'Ampliación de cocina y patio de servicio', descripcion: 'Demolición de muro, cimentación y levantamiento de muros nuevos para ampliar la cocina 3 m.' },
  ],
  'Ayudante general': [{ titulo: 'Ayudante para obra de construcción', descripcion: 'Acarreo de material, preparación de mezcla, limpieza y apoyo al maestro albañil.' }],
  'Plomero': [
    { titulo: 'Reparación de fuga en baño y cambio de llaves', descripcion: 'Hay una fuga dentro del muro del baño. Se necesita localizarla, cambiar la tubería dañada y poner llaves nuevas.' },
    { titulo: 'Instalación hidráulica de baño nuevo', descripcion: 'Tubería de agua fría y caliente, desagües, WC, lavabo y regadera en un baño nuevo de 2 x 2.5 m.' },
  ],
  'Electricista': [
    { titulo: 'Instalación eléctrica de casa de dos plantas', descripcion: 'Casa nueva de 120 m². Ranurado, poliducto, cableado, centro de carga y luminarias. Se entregan planos.' },
    { titulo: 'Cambio de centro de carga y revisión de cortos', descripcion: 'Se bota la pastilla seguido. Revisar instalación, cambiar centro de carga y corregir cortos.' },
  ],
  'Pintor': [
    { titulo: 'Pintura de fachada de casa de dos pisos', descripcion: 'Resanar, sellar y pintar fachada de unos 90 m², más barandal de herrería. La pintura la pongo yo.' },
    { titulo: 'Pintura interior de departamento', descripcion: 'Departamento de 3 recámaras, sala y comedor. Resanes y dos manos de pintura vinílica.' },
  ],
  'Carpintero': [
    { titulo: 'Closets de madera para 3 recámaras', descripcion: 'Fabricar e instalar 3 closets de MDF con cajones, entrepaños y puertas abatibles.' },
    { titulo: 'Cocina integral sencilla', descripcion: 'Cocina de 3 m lineales con alacenas, gabinetes y cubierta. Ya tengo el diseño.' },
  ],
  'Herrero': [
    { titulo: 'Puerta de herrería para cochera', descripcion: 'Puerta de 3 x 2.2 m de dos hojas con lámina lisa, chapa y pintura anticorrosiva.' },
    { titulo: 'Protecciones para 6 ventanas', descripcion: 'Fabricar e instalar protecciones de herrería tubular para 6 ventanas de 1.2 x 1.5 m.' },
  ],
  'Jardinero': [
    { titulo: 'Mantenimiento de jardín de casa', descripcion: 'Poda de árboles, corte de pasto, deshierbe y sembrado de plantas en jardín de 150 m².' },
    { titulo: 'Arreglo de jardín para evento', descripcion: 'Dejar listo el jardín para una fiesta: poda, corte de pasto y limpieza general.' },
  ],
  'Azulejero': [
    { titulo: 'Colocación de piso cerámico en sala y comedor', descripcion: 'Retirar piso viejo y colocar porcelanato de 60 x 60 en 35 m², con zoclo.' },
    { titulo: 'Azulejo en baño completo', descripcion: 'Muros y piso de baño de 2 x 2.5 m. El material ya está comprado.' },
  ],
  'Impermeabilizador': [{ titulo: 'Impermeabilización de azotea de 80 m²', descripcion: 'Limpieza, resanes, sellador y dos manos de impermeabilizante acrílico de 5 años.' }],
  'Yesero': [{ titulo: 'Yeso en muros de casa nueva', descripcion: 'Aplicar yeso a muros y plafones de 3 recámaras, sala y pasillo.' }],
  'Tablaroquero': [{ titulo: 'Muros de tablaroca para dividir oficina', descripcion: 'Hacer 3 privados con muros de tablaroca, con puertas y salidas eléctricas.' }],
  'Técnico en refrigeración y aire acondicionado': [{ titulo: 'Instalación de minisplit de 1.5 toneladas', descripcion: 'Instalar minisplit inverter en recámara, con base para la unidad exterior y tubería de 4 m.' }],
};

const EMPRESAS = ['Independiente', 'Constructora Ruiz y Asociados', 'Remodelaciones Sánchez', 'Independiente', 'Inmobiliaria Valle Verde', 'Independiente', 'Grupo Constructor Alfa', 'Independiente', 'Desarrollos Toluca', 'Independiente', 'Acabados y Remodelación Díaz', 'Independiente', 'Independiente', 'Mantenimiento Integral Bajío', 'Independiente'];

// DESCRIPCIÓN DE SERVICIOS DEL PERFIL DEL TRABAJADOR. NO USA azar() (SE ELIGE CON EL uid) PARA QUE AGREGARLA NO
// CAMBIE NADA MÁS DE LOS DATOS QUE SE ARMAN.
const SERVICIOS = {
  'Albañil': ['Levanto muros de block y tabique, hago cimientos, castillos, colados de losa, firmes y aplanados.', 'Construcción y remodelación: bardas, cuartos, losas, banquetas y reparación de grietas.'],
  'Ayudante general': ['Apoyo en obra: acarreo de material, mezcla, limpieza, demolición y lo que se ofrezca.', 'Ayudante de albañil y de pintor. Sé preparar mezcla, cargar material y limpiar la obra al terminar.'],
  'Plomero': ['Instalación y reparación de tubería de agua y drenaje, tinacos, boilers, calentadores y fugas.', 'Destapo drenajes, cambio llaves y regaderas, instalo sanitarios, lavabos y tinacos.'],
  'Electricista': ['Instalaciones eléctricas residenciales: cableado, centros de carga, contactos, apagadores y lámparas.', 'Reviso cortos y fallas, cambio pastillas, instalo tierra física y hago instalaciones nuevas.'],
  'Pintor': ['Pintura de interiores y exteriores, resanes, sellador e impermeabilizante. Trabajo limpio.', 'Pinto casas, bardas, fachadas y herrería. Preparo la superficie y protejo pisos y muebles.'],
  'Carpintero': ['Fabrico e instalo puertas, closets, cocinas integrales y muebles a la medida.', 'Reparación de muebles y puertas, instalación de pisos laminados y lambrines.'],
  'Herrero': ['Fabrico portones, protecciones, barandales, escaleras y estructuras metálicas.', 'Soldadura y herrería en general: reparación de puertas, rejas y techos de lámina.'],
  'Jardinero': ['Mantenimiento de jardines: corte de pasto, poda de árboles y setos, limpieza y riego.', 'Diseño y arreglo de jardines, siembra de pasto y plantas, poda y fumigación.'],
  'Azulejero': ['Coloco piso y azulejo en baños, cocinas y patios. Cortes limpios y nivel parejo.', 'Instalación de porcelanato, cerámica y mosaico. También quito piso viejo.'],
  'Impermeabilizador': ['Impermeabilizo azoteas con sistema acrílico o asfáltico, con limpieza y sellado de grietas.', 'Reparo goteras y filtraciones; aplico impermeabilizante con malla de refuerzo.'],
  'Yesero': ['Aplanados de yeso en muros y techos, molduras y acabados finos.', 'Yeso a regla y a plomo, boquillas y resanes antes de pintar.'],
  'Tablaroquero': ['Muros y plafones de tablaroca, nichos, cajillos y divisiones de oficina.', 'Instalación de tablaroca y durock, con cinta, pasta y lijado listo para pintar.'],
  'Técnico en refrigeración y aire acondicionado': ['Instalación y mantenimiento de minisplits, carga de gas y limpieza de equipos.', 'Reparo refrigeradores y aires acondicionados; instalo equipos nuevos con su tubería.'],
};
const descripcionServicios = (p) => {
  let h = 0;
  for (const c of p.uid) h = (h * 31 + c.charCodeAt(0)) | 0;
  h >>>= 0;
  const opciones = SERVICIOS[p.oficio] || SERVICIOS['Ayudante general'];
  const anios = 3 + (h % 18);
  const extra = ['Tengo herramienta propia.', 'Trabajo con un ayudante.', 'Doy presupuesto sin compromiso.', 'Soy puntual y entrego a tiempo.'][(h >>> 5) % 4];
  return `${opciones[h % opciones.length]} ${anios} años de experiencia. ${extra}`;
};

// ------------------------------------------------------------------------------------------------ ESCRITURAS EN LOTES
const escrituras = []; // { ruta, datos }
const poner = (ruta, datos) => escrituras.push({ ruta, datos });
const guardarTodo = async () => {
  if (SIMULAR) {
    // REVISA QUE NINGÚN CAMPO QUEDE SIN VALOR (undefined) O CON FECHAS INVÁLIDAS
    const problemas = [];
    const revisar = (valor, camino) => {
      if (valor === undefined) problemas.push(camino);
      else if (typeof valor === 'number' && !Number.isFinite(valor)) problemas.push(`${camino} (número inválido)`);
      else if (valor instanceof Date && isNaN(valor.getTime())) problemas.push(`${camino} (fecha inválida)`);
      else if (valor && typeof valor === 'object' && !(valor instanceof Date) && !(valor instanceof Timestamp)) Object.entries(valor).forEach(([k, v]) => revisar(v, `${camino}.${k}`));
    };
    escrituras.forEach(e => revisar(e.datos, e.ruta));
    console.log(problemas.length ? `  CAMPOS CON PROBLEMAS:\n  ${problemas.slice(0, 30).join('\n  ')}` : '  Revisión: ningún campo vacío ni inválido.');
    console.log(`  (Simulación: se habrían guardado ${escrituras.length} documentos)`);
    return;
  }
  for (let i = 0; i < escrituras.length; i += 400) {
    const lote = db.batch();
    escrituras.slice(i, i + 400).forEach(e => lote.set(db.doc(e.ruta), e.datos));
    await lote.commit();
    process.stdout.write(`  Guardados ${Math.min(i + 400, escrituras.length)} de ${escrituras.length} documentos\r`);
  }
  console.log('');
};

// ------------------------------------------------------------------------------------------------ USUARIOS
const usados = new Set();
const nombreUnico = (genero) => {
  for (;;) {
    const nombre = elegir(genero === 'M' ? MUJERES : HOMBRES);
    const apellidos = `${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    if (!usados.has(nombre + apellidos)) { usados.add(nombre + apellidos); return { nombre, apellidos }; }
  }
};
const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cerca = (lugar, km) => ({ latitud: +(lugar.lat + (azar() - 0.5) * km / 55).toFixed(6), longitud: +(lugar.lng + (azar() - 0.5) * km / 52).toFixed(6) });
const distanciaKm = (a, b) => {
  const r = (g) => g * Math.PI / 180;
  const h = Math.sin(r(b.latitud - a.latitud) / 2) ** 2 + Math.cos(r(a.latitud)) * Math.cos(r(b.latitud)) * Math.sin(r(b.longitud - a.longitud) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

let fotoHombre = 1, fotoMujer = 1;
const crearPersona = (rol, genero, lugar, extra) => {
  const uid = idFirebase();
  const { nombre, apellidos } = nombreUnico(genero);
  const primerNombre = sinAcentos(nombre.split(' ')[0]);
  const usuario = `${primerNombre}${sinAcentos(apellidos.split(' ')[0]).slice(0, 4)}${entre(10, 99)}`;
  const registro = dia(-entre(25, 95), entre(8, 21), entre(0, 59));
  const p = {
    uid, rol, genero, lugar, nombre, apellidos,
    correo: `${usuario}${DOMINIO_PRUEBAS}`,
    usuario,
    telefono: `${lugar.lada}${String(entre(10000000, 99999999)).slice(0, 10 - lugar.lada.length)}`,
    foto: genero === 'M' ? `https://randomuser.me/api/portraits/women/${fotoMujer++ + 10}.jpg` : `https://randomuser.me/api/portraits/men/${fotoHombre++ + 10}.jpg`,
    ubicacion: cerca(lugar, 6),
    registro,
    resenas: [], obras: [], ...extra,
  };
  return p;
};

const nombreCompleto = (p) => `${p.nombre} ${p.apellidos}`;
const corto = (p) => p.nombre.charAt(0) + p.nombre.slice(1).toLowerCase().split(' ')[0];

// 35 TRABAJADORES: 25 EN EL CENTRO (VALLE DE TOLUCA Y ZONA METROPOLITANA), 5 EN PUEBLA Y 5 EN QUERÉTARO
const trabajadores = [];
const regionesTrabajo = [...Array(25).fill('centro'), ...Array(5).fill('puebla'), ...Array(5).fill('queretaro')];
const listaOficios = Object.entries(OFICIOS).flatMap(([o, d]) => Array(d.n).fill(o));
// SE REVUELVE PARA QUE LOS OFICIOS QUEDEN REPARTIDOS ENTRE LAS REGIONES
for (let i = listaOficios.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [listaOficios[i], listaOficios[j]] = [listaOficios[j], listaOficios[i]]; }
listaOficios.forEach((oficio, i) => {
  const mujer = ['Pintor', 'Jardinero', 'Ayudante general'].includes(oficio) && probabilidad(0.35);
  const lugar = elegir(lugaresDe(regionesTrabajo[i]));
  const [min, max] = OFICIOS[oficio].tarifa;
  const porObra = probabilidad(0.15);
  trabajadores.push(crearPersona('Trabajador', mujer ? 'M' : 'H', lugar, {
    oficio,
    tarifa_monto: porObra ? null : Math.round(entre(min, max) / 10) * 10,
    tarifa_periodo: porObra ? 'por obra' : 'por día',
    dias_disponibles: probabilidad(0.7) ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : probabilidad(0.5) ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'] : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    ocupado: false, usos: 0,
    portafolio: probabilidad(0.55) ? Array.from({ length: entre(1, 2) }, (_, k) => ({
      id_obra: idCorto(),
      titulo: elegir(PLANTILLAS[oficio]).titulo.replace(/ de \d+.*$/, ''),
      lugar: `${elegir(COLONIAS)}, ${lugar.municipio}`,
      estado: lugar.estado,
      descripcion: elegir(['Trabajo terminado en tiempo y forma.', 'Obra particular, el cliente quedó muy contento.', 'Trabajo hecho antes de entrar a PalanteMX.', 'Proyecto con acabados de primera.']),
      foto_antes: nuevaFoto(oficio), foto_despues: nuevaFoto(oficio),
    })) : [],
  }));
});

// 15 CONTRATISTAS: 10 EN EL CENTRO, 3 EN PUEBLA Y 2 EN QUERÉTARO
const contratistas = [];
['centro', 'centro', 'centro', 'centro', 'centro', 'centro', 'centro', 'centro', 'centro', 'centro', 'puebla', 'puebla', 'puebla', 'queretaro', 'queretaro'].forEach((region, i) => {
  contratistas.push(crearPersona('Contratista', probabilidad(0.3) ? 'M' : 'H', elegir(lugaresDe(region)), { empresa: EMPRESAS[i] }));
});
const todos = [...trabajadores, ...contratistas];

// ------------------------------------------------------------------------------------------------ OBRAS Y CONTRATOS
const vacantes = [];
const contratos = [];
const chats = new Map(); // "trabajador_contratista" -> { mensajes: [] }
const quejas = [];
const notificaciones = [];
const resenasDocs = [];

const CONDICIONES_BASE = () => ({
  material: elegir(['Lo pone el contratista', 'Lo pone el contratista', 'Se reparte entre los dos']),
  herramienta: elegir(['La pone el trabajador', 'La pone el trabajador', 'Se reparte entre los dos']),
  comida: elegir(['Sí, se da comida', 'No']),
  transporte: elegir(['No', 'No', 'Sí, se paga el pasaje']),
  seguridad: elegir(['Sí', 'No se necesita']),
  forma_pago: elegir(['Efectivo', 'Transferencia', 'Efectivo o transferencia']),
});
const textoPrecio = (monto, periodo) => monto ? `$${monto.toLocaleString('es-MX')} ${periodo}` : 'A convenir';

// ELIGE A UN TRABAJADOR DEL OFICIO (DE PREFERENCIA DE LA MISMA REGIÓN Y CON MENOS OBRAS)
const elegirTrabajador = (oficio, region, { ocupa = false, excluir = [] } = {}) => {
  const libres = (lista) => lista.filter(t => !excluir.includes(t) && (!ocupa || !t.ocupado) && t.estado !== 'Bloqueada');
  let candidatos = libres(trabajadores.filter(t => t.oficio === oficio && t.lugar.region === region));
  if (!candidatos.length) candidatos = libres(trabajadores.filter(t => t.oficio === oficio));
  if (!candidatos.length) candidatos = libres(trabajadores.filter(t => t.oficio === 'Ayudante general'));
  candidatos.sort((a, b) => a.usos - b.usos || azar() - 0.5);
  const t = candidatos[0];
  t.usos++;
  if (ocupa) t.ocupado = true;
  return t;
};

let indiceContratista = 0;
const siguienteContratista = (region) => {
  const lista = region ? contratistas.filter(c => c.lugar.region === region) : contratistas;
  return lista[(indiceContratista++) % lista.length];
};

// MENSAJES DEL CHAT ENTRE LAS DOS PARTES ALREDEDOR DE UNA FECHA
const mensaje = (t, c, quien, texto, fecha) => {
  const clave = `${t.uid}_${c.uid}`;
  if (!chats.has(clave)) chats.set(clave, { t, c, mensajes: [] });
  chats.get(clave).mensajes.push({ emisor: quien === 't' ? t : c, texto, fecha });
};
const conversacion = (t, c, v, contrato, tipo) => {
  const base = contrato.fechaPostulacion;
  const minutos = (m) => new Date(base.getTime() + m * 60000);
  const inicio = fechaLarga(dia(v.inicio));
  if (contrato.origen === 'trabajador') {
    mensaje(t, c, 't', `Buenas tardes, vi su vacante "${v.titulo}" y me interesa. Tengo experiencia como ${t.oficio.toLowerCase()}. ¿Sigue disponible?`, minutos(0));
    if (tipo === 'pendiente') return;
    if (tipo === 'rechazada') { mensaje(t, c, 'c', 'Gracias por su interés, pero ya encontramos a alguien. Saludos.', minutos(entre(60, 600))); return; }
    mensaje(t, c, 'c', `Hola ${corto(t)}, sí sigue. ¿Podría empezar el ${inicio}?`, minutos(entre(20, 180)));
    mensaje(t, c, 't', `Sí, sin problema. ¿El material ya está en la obra?`, minutos(entre(200, 260)));
    mensaje(t, c, 'c', `${v.condiciones.material}. El horario es ${v.horario.toLowerCase()} y el pago es de ${v.pago}.`, minutos(entre(270, 330)));
    mensaje(t, c, 't', 'Perfecto, entonces acepto el trato.', minutos(entre(340, 400)));
  } else {
    mensaje(t, c, 'c', `Hola ${corto(t)}, vi su perfil y me gustaría proponerle la obra "${v.titulo}". ¿Le interesa?`, minutos(0));
    if (tipo === 'propuesta_sin_respuesta') return;
    mensaje(t, c, 't', 'Buenas, sí me interesa. ¿De cuánto es el pago y cuándo empezaría?', minutos(entre(30, 240)));
    mensaje(t, c, 'c', `Es de ${v.pago}. Empezaríamos el ${inicio}, ${v.horario.toLowerCase()}.`, minutos(entre(250, 300)));
    if (tipo === 'propuesta') { mensaje(t, c, 't', 'Déjeme revisar mis fechas y le confirmo hoy mismo.', minutos(entre(310, 380))); return; }
    mensaje(t, c, 't', 'Va, me parece bien. Ya acepté el trato.', minutos(entre(310, 380)));
  }
  mensaje(t, c, 'c', 'Listo, ya acepté también. Nos vemos ese día.', minutos(entre(420, 500)));
};

// AVISO EN LA CAMPANA
const avisar = (usuario, titulo, mensajeTexto, fecha, extra = {}) => notificaciones.push({
  id_usuario: usuario.uid, titulo, mensaje: mensajeTexto, leida: extra.leida ?? fecha < dia(-1), fecha: fecha.toISOString(), timestamp: fecha.getTime(),
  tipo: extra.tipo || 'contrato', importante: extra.importante || false,
  ...(extra.chat_con ? { chat_con: extra.chat_con } : {}), ...(extra.destino ? { destino: extra.destino } : {}),
});

// CREA UNA VACANTE (Y LA DEVUELVE PARA COLGARLE CONTRATOS)
const crearVacante = ({ oficio, region, inicio, fin, dias, periodo, monto, cupo = 1, cuandoPago, plantilla }) => {
  const c = siguienteContratista(region);
  const lugarObra = cerca(c.lugar, 4);
  const p = plantilla || elegir(PLANTILLAS[oficio]);
  const v = {
    id: idCorto(), contratista: c, oficio, titulo: p.titulo, descripcion: p.descripcion,
    inicio, fin, dias, periodo, monto, cupo, ocupados: 0, postulantes: 0,
    coordenadas: lugarObra,
    lugar_texto: `${elegir(CALLES)} ${entre(10, 450)}, ${elegir(COLONIAS)}, ${c.lugar.municipio}`,
    horario: elegir(['Lun a Sáb, 8:00 a 17:00', 'Lun a Vie, 8:00 a 18:00', 'Lun a Sáb, 9:00 a 18:00']),
    condiciones: { ...CONDICIONES_BASE(), cuando_pago: cuandoPago || (periodo === 'por día' ? 'Cada semana' : periodo === 'por semana' ? 'Cada semana' : 'Al terminar la obra') },
    foto_trabajo: nuevaFoto(oficio),
    publicada: dia(inicio - entre(4, 12), entre(9, 20), entre(0, 59)),
    pago: textoPrecio(monto, periodo),
    estado: 'Activa',
  };
  if (v.publicada > AHORA) v.publicada = dia(-entre(1, 3), entre(8, 12));
  vacantes.push(v);
  return v;
};

// CONTRATO DE UNA VACANTE CON UN TRABAJADOR. escenario: finalizada | activa | por_confirmar | pendiente | propuesta |
// propuesta_sin_respuesta | rechazada | cancelada_a_tiempo | suspendida_tardia | revision_cierre
const crearContrato = (v, t, escenario, opciones = {}) => {
  const c = v.contratista;
  const origen = opciones.origen || (['propuesta', 'propuesta_sin_respuesta'].includes(escenario) ? 'contratista' : ['pendiente', 'rechazada'].includes(escenario) ? 'trabajador' : elegir(['trabajador', 'contratista']));
  let fechaPostulacion = opciones.postulacion || new Date(v.publicada.getTime() + entre(2, 48) * 3600000);
  if (fechaPostulacion > AHORA) fechaPostulacion = new Date(AHORA.getTime() - entre(2, 20) * 3600000);
  const k = { id: idCorto(), v, t, c, escenario, origen, fechaPostulacion, bitacora: [], pagos: [], ajustes: [], reportes_abiertos: 0, extra: {} };
  v.postulantes++;
  contratos.push(k);

  const tipoChat = escenario === 'pendiente' ? 'pendiente' : escenario === 'rechazada' ? 'rechazada' : escenario === 'propuesta' ? 'propuesta' : escenario === 'propuesta_sin_respuesta' ? 'propuesta_sin_respuesta' : 'aceptado';
  conversacion(t, c, v, k, tipoChat);

  // AVISOS DE LA SOLICITUD / PROPUESTA
  if (origen === 'trabajador') avisar(c, 'Nueva solicitud', `${nombreCompleto(t)} se postuló a tu obra "${v.titulo}". Toca aquí para platicar en el chat; cuando estén de acuerdo, acepta el trato ahí mismo.`, fechaPostulacion, { chat_con: { id: t.uid, nombre: nombreCompleto(t), rol: t.oficio } });
  else avisar(t, 'Nueva propuesta de obra', `${nombreCompleto(c)} te propone la obra "${v.titulo}". Toca aquí para platicar en el chat; cuando estén de acuerdo, acepta el trato ahí mismo.`, fechaPostulacion, { chat_con: { id: c.uid, nombre: nombreCompleto(c), rol: 'Contratista' } });

  if (['pendiente', 'propuesta', 'propuesta_sin_respuesta', 'rechazada'].includes(escenario)) {
    if (escenario === 'rechazada') k.extra.rechazado_por = c.uid;
    return k;
  }

  // TRATO ACEPTADO POR LOS DOS (UNO O DOS DÍAS ANTES DE EMPEZAR)
  k.aceptado = new Date(Math.min(fechaPostulacion.getTime() + entre(6, 30) * 3600000, dia(v.inicio - 1, 19).getTime()));
  if (k.aceptado < fechaPostulacion) k.aceptado = new Date(fechaPostulacion.getTime() + 3 * 3600000);
  if (k.aceptado > AHORA) k.aceptado = new Date(AHORA.getTime() - 3 * 3600000);
  v.ocupados++;
  avisar(origen === 'trabajador' ? t : c, '¡Trato cerrado!', `${origen === 'trabajador' ? nombreCompleto(c) + ' (contratista)' : nombreCompleto(t) + ' (trabajador)'} también aceptó "${v.titulo}". Los dos aceptaron: la obra ya está activa en tu pestaña Obras.`, k.aceptado, { destino: { abrir: 'obra', id_contrato: k.id } });

  // HASTA QUÉ DÍA HAY BITÁCORA
  const ultimoDia = { finalizada: v.fin, activa: -1, por_confirmar: -1, suspendida_tardia: -2, revision_cierre: v.fin, cancelada_a_tiempo: null }[escenario];
  if (ultimoDia !== null && ultimoDia !== undefined) {
    const faltas = opciones.faltas || [];
    const notas = NOTAS[v.oficio] || NOTAS['Albañil'];
    const dias = diasDeTrabajo(v.inicio, Math.min(ultimoDia, v.fin), v.dias);
    dias.forEach((d, i) => {
      const fecha = dia(d, entre(16, 19), entre(0, 59));
      const clave = claveMexico(fecha);
      if (faltas.includes(i)) {
        k.bitacora.push({ id: clave, asistio: false, automatica: true, autor_id: 'sistema', evidencia: null, nota: 'El trabajador no llenó la bitácora este día. PalanteMX lo registró automáticamente como falta.', fecha: fechaMx(dia(d)), timestamp: dia(d).getTime() });
        return;
      }
      const lugarRegistro = cerca({ lat: v.coordenadas.latitud, lng: v.coordenadas.longitud }, 0.12);
      const reciente = d >= -2 && escenario !== 'finalizada';
      k.bitacora.push({
        id: clave, asistio: true, autor_id: t.uid,
        nota: notas[Math.min(Math.floor(i * notas.length / dias.length), notas.length - 1)],
        evidencia: probabilidad(0.8) ? nuevaFoto(v.oficio) : null,
        fecha: fechaMx(fecha), timestamp: fecha.getTime(),
        ubicacion_registro: { ...lugarRegistro, precision: entre(6, 35), simulada: false },
        distancia_obra_km: Math.round(distanciaKm(lugarRegistro, v.coordenadas) * 1000) / 1000,
        lugar_registro: v.lugar_texto,
        revision: reciente || probabilidad(0.08) ? 'Pendiente' : 'Confirmada',
        ...(reciente ? {} : { fecha_revision: new Date(fecha.getTime() + entre(2, 20) * 3600000).toISOString() }),
      });
    });
  }

  // PAGOS SEGÚN CADA CUÁNDO SE PAGA
  const trabajados = () => k.bitacora.filter(b => b.asistio && b.revision !== 'Descontada').length;
  const pagar = (monto, concepto, fecha, estado = 'Recibido') => {
    k.pagos.push({ id: idFirebase(12), monto, concepto, comprobante: fotoComprobante(contadorRecibos++), estado, fecha: fechaMx(fecha), timestamp: fecha.getTime(), ...(estado === 'Recibido' ? { fecha_confirmacion: new Date(fecha.getTime() + entre(1, 10) * 3600000).toISOString() } : {}) });
  };
  if (v.periodo === 'por día' && k.bitacora.length) {
    // CADA SÁBADO (O AL FINAL) SE PAGAN LOS DÍAS TRABAJADOS DE LA SEMANA
    let pendientes = 0;
    k.bitacora.forEach((b, i) => {
      if (b.asistio) pendientes++;
      const esFinDeSemana = diaSemana(new Date(b.timestamp)) === 'Sáb' || i === k.bitacora.length - 1;
      if (esFinDeSemana && pendientes) {
        const cuando = new Date(b.timestamp + 2 * 3600000);
        const ultimo = i === k.bitacora.length - 1 && escenario !== 'finalizada';
        pagar(pendientes * v.monto, 'Pago de la semana', cuando, ultimo && cuando > dia(-3) ? 'Por confirmar' : 'Recibido');
        pendientes = 0;
      }
    });
  } else if (v.periodo === 'por semana') {
    const semanas = Math.floor((Math.min(ultimoDia ?? -1, 0) - v.inicio + 1) / 7);
    for (let s = 1; s <= semanas; s++) pagar(v.monto, 'Pago de la semana', dia(v.inicio + s * 7 - 1, 18), escenario === 'activa' && s === semanas ? 'Por confirmar' : 'Recibido');
  } else if (v.periodo === 'por obra') {
    if (v.condiciones.cuando_pago === 'Mitad al inicio y mitad al final') pagar(v.monto / 2, 'Pago parcial / adelanto', dia(v.inicio, 9));
    if (escenario === 'finalizada') pagar(v.condiciones.cuando_pago === 'Mitad al inicio y mitad al final' ? v.monto / 2 : v.monto, 'Pago de la obra', dia(v.fin + 1, 13));
  }
  const ultimoPago = k.pagos[k.pagos.length - 1];
  if (ultimoPago) avisar(t, 'Te registraron un pago', `${nombreCompleto(c)} (contratista) registró un pago de $${ultimoPago.monto.toLocaleString('es-MX')} (${ultimoPago.concepto}) en "${v.titulo}". Entra a la obra → Pagos y confirma si de verdad lo recibiste.`, new Date(ultimoPago.timestamp), { destino: { abrir: 'pagos', id_contrato: k.id }, leida: ultimoPago.estado !== 'Por confirmar' });

  // CIERRE SEGÚN EL ESCENARIO
  if (escenario === 'finalizada') {
    k.fin = dia(v.fin + (opciones.cierreAutomatico ? 1 : entre(0, 1)), opciones.cierreAutomatico ? 9 : entre(17, 20), 5);
    if (opciones.cierreAutomatico) k.extra.cierre_automatico = true;
    mensaje(t, c, 'c', 'Muchas gracias, quedó muy bien el trabajo.', new Date(k.fin.getTime() + 3600000));
    mensaje(t, c, 't', 'Gracias a usted, para lo que se ofrezca.', new Date(k.fin.getTime() + 2 * 3600000));
    avisar(c, 'Obra finalizada', `${nombreCompleto(t)} confirmó que "${v.titulo}" terminó. Ya pueden calificarse.`, k.fin, { destino: { abrir: 'obra', id_contrato: k.id } });
  }
  if (escenario === 'activa' || escenario === 'por_confirmar') {
    mensaje(t, c, 't', elegir(['Buen día, ya voy en camino.', 'Buenos días, hoy llego a las 8.', 'Ya terminamos lo de hoy, mañana seguimos.']), dia(-1, entre(7, 18), entre(0, 59)));
    if (escenario === 'por_confirmar') {
      mensaje(t, c, 'c', 'Ya marqué la obra como terminada, ¿me confirma en la app por favor?', dia(0, 9, 30));
      avisar(t, 'Obra marcada como terminada', `${nombreCompleto(c)} marcó "${v.titulo}" como terminada. Entra a Obras y confirma si de verdad ya terminó.`, dia(0, 9, 31), { destino: { abrir: 'obra', id_contrato: k.id }, leida: false });
    }
  }
  return k;
};

// ------------------------------------------------------------------------------------------------ ESCENARIOS
const TODA_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ENTRE_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

// --- OBRAS TERMINADAS (HISTORIAL, PORTAFOLIO Y RESEÑAS) ---
const terminadas = [];
const obraTerminada = (oficios, datos, opciones = {}) => {
  const v = crearVacante({ oficio: oficios[0], region: 'centro', cupo: oficios.length, ...datos });
  v.estado = 'Cerrada';
  const excluir = [];
  oficios.forEach((oficio, i) => {
    const t = elegirTrabajador(oficio, v.contratista.lugar.region, { excluir });
    excluir.push(t);
    terminadas.push(crearContrato(v, t, 'finalizada', opciones));
  });
  return v;
};
obraTerminada(['Albañil', 'Ayudante general'], { inicio: -75, fin: -62, dias: TODA_SEMANA, periodo: 'por día', monto: 550 });
obraTerminada(['Plomero'], { inicio: -68, fin: -66, dias: TODA_SEMANA, periodo: 'por obra', monto: 3500 });
obraTerminada(['Electricista'], { inicio: -60, fin: -52, dias: TODA_SEMANA, periodo: 'por obra', monto: 9000, cuandoPago: 'Mitad al inicio y mitad al final' });
obraTerminada(['Pintor'], { inicio: -55, fin: -49, dias: TODA_SEMANA, periodo: 'por día', monto: 450 });
obraTerminada(['Carpintero'], { inicio: -50, fin: -38, dias: ENTRE_SEMANA, periodo: 'por obra', monto: 14000 });
obraTerminada(['Herrero'], { inicio: -45, fin: -41, dias: TODA_SEMANA, periodo: 'por obra', monto: 6500 });
obraTerminada(['Albañil', 'Albañil'], { inicio: -40, fin: -27, dias: TODA_SEMANA, periodo: 'por semana', monto: 3300 });
obraTerminada(['Jardinero'], { inicio: -35, fin: -33, dias: TODA_SEMANA, periodo: 'por día', monto: 400 });
const vAzulejo = obraTerminada(['Azulejero'], { inicio: -30, fin: -24, dias: TODA_SEMANA, periodo: 'por día', monto: 600 });
obraTerminada(['Impermeabilizador'], { inicio: -22, fin: -20, dias: TODA_SEMANA, periodo: 'por obra', monto: 7200 }, { cierreAutomatico: true });

// REPORTE RESUELTO EN LA OBRA DE AZULEJO: EL CONTRATISTA RECLAMÓ PISO MAL NIVELADO; SE DESCONTÓ UN DÍA
{
  const k = contratos.find(x => x.v === vAzulejo);
  const fecha = dia(-26, 19, 10);
  const idQueja = idCorto();
  quejas.push({
    id: idQueja, contrato: k, tipo: 'incumplimiento', motivo: 'Trabajo mal hecho',
    reportante: k.c, acusado: k.t, fecha,
    descripcion: 'Tres piezas del comedor quedaron desniveladas y suenan huecas. Le pedí que las cambiara y dijo que así quedaba.',
    version_acusado: { texto: 'Las piezas se cambiaron al día siguiente, pero el firme estaba disparejo desde antes. Se lo avisé al empezar.', fotos: [], de_acuerdo: false, fecha: dia(-25, 10).toISOString() },
    resuelta: { fecha: dia(-23, 12), decision: 'procede', descuento: 600, resolucion: `Tiene la razón ${nombreCompleto(k.c)} (contratista). Se descuentan $600 del pago a ${nombreCompleto(k.t)} (trabajador).`, nota: 'Por las fotos, las piezas sí quedaron mal colocadas. Se descuenta un día de trabajo; el resto del trabajo quedó bien.', responsable: 'Trabajador' },
  });
  k.ajustes.push({ tipo: 'descuento', monto: 600, texto: `Se descuentan $600 del pago a ${nombreCompleto(k.t)} (trabajador).`, motivo: 'Trabajo mal hecho', id_queja: idQueja, fecha: fechaMx(dia(-23)) });
}

// --- OBRAS EN CURSO ---
const enCurso = (oficios, datos, opciones = {}) => {
  const v = crearVacante({ oficio: oficios[0], region: 'centro', cupo: oficios.length, ...datos });
  const lista = [];
  oficios.forEach(oficio => {
    const t = elegirTrabajador(oficio, v.contratista.lugar.region, { ocupa: true, excluir: lista.map(k => k.t) });
    lista.push(crearContrato(v, t, opciones.escenario || 'activa', opciones));
  });
  if (v.ocupados >= v.cupo) v.estado = 'Cerrada';
  return { v, lista };
};
enCurso(['Albañil', 'Ayudante general'], { inicio: -9, fin: 10, dias: TODA_SEMANA, periodo: 'por día', monto: 600 });
enCurso(['Electricista'], { inicio: -6, fin: 4, dias: TODA_SEMANA, periodo: 'por obra', monto: 12000, cuandoPago: 'Mitad al inicio y mitad al final' });
const pintura = enCurso(['Pintor'], { inicio: -6, fin: 3, dias: TODA_SEMANA, periodo: 'por día', monto: 480 });
enCurso(['Plomero'], { inicio: -3, fin: 2, dias: TODA_SEMANA, periodo: 'por día', monto: 650 });
enCurso(['Tablaroquero'], { inicio: -8, fin: 6, dias: ENTRE_SEMANA, periodo: 'por semana', monto: 3600 });
enCurso(['Yesero'], { inicio: -2, fin: 8, dias: TODA_SEMANA, periodo: 'por día', monto: 520 });
enCurso(['Carpintero'], { inicio: -10, fin: 0, dias: ENTRE_SEMANA, periodo: 'por obra', monto: 8000 }, { escenario: 'por_confirmar' });
enCurso(['Técnico en refrigeración y aire acondicionado'], { inicio: -1, fin: 0, dias: TODA_SEMANA, periodo: 'por obra', monto: 2500 }, { escenario: 'por_confirmar' });

// DÍA EN DISPUTA YA RESUELTO EN LA OBRA DE PINTURA: EL CONTRATISTA DIJO QUE ESE DÍA NO SE TRABAJÓ Y EL ADMIN LE DIO LA RAZÓN
{
  const k = pintura.lista[0];
  const b = k.bitacora.find(x => x.asistio && x.revision === 'Confirmada') || k.bitacora[0];
  b.revision = 'Descontada';
  b.nota_admin = 'El trabajador no se presentó ese día según el vecino y no hay fotos de avance. El día no cuenta.';
  quejas.push({
    id: idCorto(), contrato: k, tipo: 'bitacora', motivo: 'Bitácora rechazada', reportante: k.c, acusado: k.t, fecha: new Date(b.timestamp + 5 * 3600000),
    descripcion: `El ${b.fecha} no vino a trabajar; llegué a la obra a las 12 y no había nadie.`, fecha_dia: b.fecha, id_entrada: b.id,
    version_acusado: { texto: 'Fui temprano a comprar material y regresé en la tarde.', fotos: [], de_acuerdo: false, fecha: new Date(b.timestamp + 20 * 3600000).toISOString() },
    resuelta: { fecha: new Date(b.timestamp + 30 * 3600000), decision: 'a_favor_contratista', descuento: 0, resolucion: `Tiene la razón ${nombreCompleto(k.c)} (contratista): el día ${b.fecha} NO cuenta y se descuenta. Sin ajuste de dinero.`, nota: b.nota_admin, responsable: 'Trabajador' },
  });
}

// --- SUSPENDIDA: EL TRABAJADOR CANCELÓ TARDE (CON LA OBRA YA EMPEZADA Y UN PAGO HECHO) ---
{
  const v = crearVacante({ oficio: 'Albañil', region: 'centro', inicio: -5, fin: 9, dias: TODA_SEMANA, periodo: 'por día', monto: 580 });
  const t = elegirTrabajador('Albañil', v.contratista.lugar.region);
  const k = crearContrato(v, t, 'suspendida_tardia');
  const pagado = k.pagos.reduce((s, p) => s + p.monto, 0);
  const cuando = dia(-1, 20, 15);
  const idQueja = idCorto();
  const motivo = 'Me salió un trabajo fijo en una fábrica y ya no voy a poder seguir con la obra.';
  Object.assign(k.extra, { cancelado_por: t.uid, motivo_cancelacion: motivo, id_queja: idQueja, timestamp_cancelacion: cuando.getTime(), cancelacion_tardia: true, horas_aviso: Math.floor((dia(v.inicio, 0).getTime() - cuando.getTime()) / 3600000) });
  k.reportes_abiertos = 1;
  quejas.push({
    id: idQueja, contrato: k, tipo: 'cancelacion', motivo: 'Cancelación tardía de obra', reportante: t, acusado: v.contratista, fecha: cuando,
    descripcion: `${motivo}\n\nAVISO: canceló con la obra ya empezada (menos de las 48 horas que se piden).${pagado ? `\nDINERO YA PAGADO: el contratista ya había pagado $${pagado.toLocaleString('es-MX')} antes de la cancelación.` : ''}`,
    monto_pagado: pagado, cancelacion_tardia: true, horas_aviso: k.extra.horas_aviso,
    version_acusado: { texto: 'Me avisó por mensaje en la noche y me dejó la barda a la mitad. Ya le había pagado la semana y ahora tengo que buscar a otra persona.', fotos: [nuevaFoto('Albañil')], de_acuerdo: false, fecha: dia(0, 8, 40).toISOString() },
    asignado: true,
  });
  avisar(v.contratista, 'Obra suspendida: da tu versión', `${nombreCompleto(t)} canceló la obra "${v.titulo}" con la obra ya empezada. Motivo: "${motivo}". Queda suspendida mientras el administrador revisa el caso.${pagado ? ` Ya habías pagado $${pagado.toLocaleString('es-MX')}; el administrador decidirá si se devuelven.` : ''} Toca aquí para dar tu versión antes de que decida.`, cuando, { destino: { abrir: 'reportes', id_contrato: k.id }, tipo: 'reporte', importante: true, leida: true });
  mensaje(t, v.contratista, 't', 'Disculpe, le aviso que ya no voy a poder seguir con la obra. Me salió un trabajo fijo.', new Date(cuando.getTime() - 600000));
  mensaje(t, v.contratista, 'c', 'Pues me deja a medias, ya le había pagado la semana. Voy a ver qué dice el administrador.', new Date(cuando.getTime() + 1200000));
}

// --- SUSPENDIDA EN REVISIÓN DE CIERRE: LA OBRA TERMINÓ CON 2 FALTAS ---
{
  const v = crearVacante({ oficio: 'Pintor', region: 'centro', inicio: -12, fin: -2, dias: TODA_SEMANA, periodo: 'por día', monto: 450 });
  const t = elegirTrabajador('Pintor', v.contratista.lugar.region);
  const k = crearContrato(v, t, 'revision_cierre', { faltas: [3, 6] });
  const faltas = k.bitacora.filter(b => b.automatica).map(b => b.id);
  const idQueja = idCorto();
  const fecha = dia(-1, 9, 2);
  k.reportes_abiertos = 1;
  const motivo = `${faltas.length} día(s) de trabajo sin asistencia registrada`;
  k.extra.revision_cierre = { motivo, fecha: fechaMx(fecha), dias_falta: faltas, id_queja: idQueja };
  quejas.push({
    id: idQueja, contrato: k, tipo: 'cierre', motivo: 'Faltas al cerrar la obra', reportante: v.contratista, acusado: t, fecha, automatico: true,
    descripcion: `La obra terminó el ${fechaLarga(dia(v.fin))}. ${nombreCompleto(t)} (trabajador) no registró asistencia estos días de trabajo: ${faltas.map(f => fechaLarga(new Date(`${f}T12:00:00-06:00`))).join(', ')}. Hay que decidir si esos días se descuentan del pago. Al resolver este reporte, la obra se da por terminada.`,
    dias_falta: faltas,
  });
  for (const u of [t, v.contratista]) avisar(u, 'Obra en revisión', `"${v.titulo}" terminó el ${fechaLarga(dia(v.fin))}, pero hay pendientes: ${motivo}. La obra queda en revisión del administrador; cuando lo resuelva, se dará por terminada.`, fecha, { destino: { abrir: 'reportes', id_contrato: k.id }, tipo: 'reporte', importante: true, leida: u !== t });
}

// --- CANCELADA A TIEMPO Y VUELTA A PUBLICAR, CON UN NUEVO INTERESADO ---
{
  const v = crearVacante({ oficio: 'Herrero', region: 'centro', inicio: 6, fin: 10, dias: TODA_SEMANA, periodo: 'por obra', monto: 7500 });
  v.publicada = dia(-8, 10, 30);
  const t = elegirTrabajador('Herrero', v.contratista.lugar.region);
  const k = crearContrato(v, t, 'cancelada_a_tiempo', { postulacion: dia(-7, 13, 15) });
  const cuando = dia(-2, 18, 40);
  Object.assign(k.extra, { cancelado_por: t.uid, motivo_cancelacion: 'Me operan de la rodilla la próxima semana y no podré trabajar.', timestamp_cancelacion: cuando.getTime(), cancelacion_tardia: false, horas_aviso: Math.floor((dia(v.inicio, 0).getTime() - cuando.getTime()) / 3600000), cupo_liberado: true, republicada: true });
  v.ocupados--;
  avisar(v.contratista, 'Obra cancelada con aviso', `${nombreCompleto(t)} (trabajador) canceló "${v.titulo}" ${Math.floor(k.extra.horas_aviso / 24)} día(s) antes de empezar, a tiempo. Motivo: "${k.extra.motivo_cancelacion}".\n\n¿Quieres volver a publicar la obra para buscar a otro trabajador? Toca aquí.`, cuando, { destino: { abrir: 'republicar', id_contrato: k.id }, tipo: 'contrato', importante: true, leida: true });
  // EL CONTRATISTA LA VOLVIÓ A PUBLICAR CON NUEVOS DÍAS
  v.inicio = 9; v.fin = 13; v.republicada = dia(-1, 10, 15);
  const otro = elegirTrabajador('Herrero', v.contratista.lugar.region, { excluir: [t] });
  crearContrato(v, otro, 'pendiente', { postulacion: dia(-1, 16, 20) });
  avisar(t, 'La obra se volvió a publicar', `${nombreCompleto(v.contratista)} (contratista) volvió a publicar "${v.titulo}" para buscar a otro trabajador.`, v.republicada, { destino: { abrir: 'obra', id_contrato: k.id } });
}

// --- VACANTES ABIERTAS CON SOLICITUDES, PROPUESTAS Y RECHAZOS ---
const abierta = (oficio, region, datos, interesados) => {
  const v = crearVacante({ oficio, region, ...datos });
  const excluir = [];
  interesados.forEach(escenario => {
    const t = elegirTrabajador(oficio, region, { excluir });
    excluir.push(t);
    crearContrato(v, t, escenario);
  });
  return v;
};
abierta('Albañil', 'centro', { inicio: 4, fin: 18, dias: TODA_SEMANA, periodo: 'por día', monto: 600, cupo: 2 }, ['pendiente', 'pendiente', 'rechazada']);
abierta('Plomero', 'centro', { inicio: 3, fin: 4, dias: TODA_SEMANA, periodo: 'por obra', monto: 4200 }, ['propuesta']);
abierta('Electricista', 'puebla', { inicio: 5, fin: 9, dias: TODA_SEMANA, periodo: 'por obra', monto: 3800 }, ['pendiente', 'rechazada']);
abierta('Jardinero', 'centro', { inicio: 2, fin: 2, dias: TODA_SEMANA, periodo: 'por día', monto: 420 }, ['propuesta_sin_respuesta']);
abierta('Pintor', 'queretaro', { inicio: 7, fin: 12, dias: TODA_SEMANA, periodo: 'por día', monto: 470 }, ['pendiente', 'propuesta']);
abierta('Ayudante general', 'centro', { inicio: 5, fin: 20, dias: TODA_SEMANA, periodo: 'por día', monto: 350, cupo: 3 }, ['rechazada', 'pendiente']);
abierta('Carpintero', 'puebla', { inicio: 10, fin: 20, dias: ENTRE_SEMANA, periodo: 'por obra', monto: 16000 }, []);
abierta('Azulejero', 'queretaro', { inicio: 8, fin: 12, dias: TODA_SEMANA, periodo: 'por día', monto: 650 }, ['pendiente']);
abierta('Impermeabilizador', 'centro', { inicio: 6, fin: 7, dias: TODA_SEMANA, periodo: 'por obra', monto: 6800 }, []);

// --- UN TRABAJADOR BLOQUEADO POR EL ADMIN (INSULTOS EN EL CHAT) ---
{
  // UNO QUE NO TENGA OBRAS (O, SI TODOS TIENEN, EL QUE MENOS TENGA Y NO ESTÉ EN UNA OBRA EN CURSO)
  const t = [...trabajadores].filter(x => !x.ocupado).sort((a, b) => a.usos - b.usos || azar() - 0.5)[0];
  const c = contratistas[contratistas.length - 1];
  t.estado = 'Bloqueada';
  mensaje(t, c, 't', 'Buenas, ¿todavía busca gente?', dia(-20, 11));
  mensaje(t, c, 'c', 'Ya no, gracias.', dia(-20, 12));
  mensaje(t, c, 't', 'Pues usted se lo pierde, ojalá le salga todo mal.', dia(-20, 12, 30));
  quejas.push({
    id: idCorto(), contrato: null, tipo: null, motivo: 'Lenguaje ofensivo', reportante: c, acusado: t, fecha: dia(-20, 13),
    descripcion: 'Me contestó de mala manera en el chat cuando le dije que ya no necesitaba a nadie.',
    resuelta: { fecha: dia(-19, 10), decision: 'procede', descuento: 0, resolucion: `Tiene la razón ${nombreCompleto(c)} (contratista). Sin ajuste de dinero. La cuenta de ${nombreCompleto(t)} (trabajador) quedó BLOQUEADA.`, nota: 'Se revisó el chat: hubo una amenaza. Se bloquea la cuenta.', responsable: 'Trabajador' },
  });
}

// ------------------------------------------------------------------------------------------------ RESEÑAS DE LAS OBRAS TERMINADAS
const COMENTARIOS_A_TRABAJADOR = ['Muy buen trabajo, cumplido y limpio.', 'Llegó puntual todos los días y el acabado quedó excelente.', 'Trabajador responsable, lo vuelvo a contratar.', 'Buen trabajo, aunque tardó un día más de lo acordado.', 'Muy recomendable, explica todo lo que hace.', 'Hizo exactamente lo que se pidió y dejó todo limpio.'];
const COMENTARIOS_A_CONTRATISTA = ['Pagó a tiempo y siempre tuvo el material listo.', 'Buen trato, muy claro con lo que quería.', 'Todo conforme a lo acordado, recomendado.', 'Buena persona, solo se retrasó un poco con el último pago.', 'Excelente contratista, ojalá haya más obras.', 'Respetó el horario y la comida que prometió.'];
const resenar = (de, para, estrellas, comentario, fecha) => {
  const r = { evaluador_id: de.uid, evaluador_nombre: nombreCompleto(de), evaluador_foto: de.foto, estrellas, comentario, fecha: fechaMx(fecha), timestamp: fecha.getTime() };
  para.resenas.push(r);
  resenasDocs.push({ id: `${de.uid}_${para.uid}`, ...r, evaluado_id: para.uid, evaluado_nombre: nombreCompleto(para), evaluado_rol: para.rol });
};
terminadas.forEach(k => {
  const conProblema = k.ajustes.length > 0;
  if (probabilidad(0.95)) resenar(k.c, k.t, conProblema ? 3 : elegir([5, 5, 5, 4, 4]), conProblema ? 'El trabajo quedó bien en general, pero hubo que corregir varias piezas.' : elegir(COMENTARIOS_A_TRABAJADOR), new Date(k.fin.getTime() + entre(2, 40) * 3600000));
  if (probabilidad(0.85)) resenar(k.t, k.c, elegir([5, 5, 4, 4, 3]), elegir(COMENTARIOS_A_CONTRATISTA), new Date(k.fin.getTime() + entre(2, 60) * 3600000));
});

// ------------------------------------------------------------------------------------------------ PORTAFOLIO DE LAS DOS PARTES
terminadas.forEach(k => {
  const validos = k.bitacora.filter(b => b.asistio && b.revision !== 'Descontada');
  const comun = {
    fotos: validos.map(b => b.evidencia).filter(Boolean).slice(-6), dias_trabajados: validos.length,
    dias_confirmados: validos.filter(b => b.revision === 'Confirmada').length, id_contrato: k.id, titulo: k.v.titulo,
    ubicacion: `${k.c.lugar.municipio}, ${k.c.lugar.estado}`, pago: k.v.pago, foto_trabajo: k.v.foto_trabajo,
    fecha_inicio: fechaMx(k.aceptado), fecha_fin: fechaMx(k.fin),
  };
  k.t.obras.push({ ...comun, contratista: nombreCompleto(k.c) });
  k.c.obras.push({ ...comun, trabajador: nombreCompleto(k.t), oficio: k.t.oficio, id_trabajador: k.t.uid });
});

// ================================================================================================================ LOTE 2
// 80 USUARIOS MÁS (52 TRABAJADORES Y 28 CONTRATISTAS) EN 16 MUNICIPIOS, CON 8 MESES DE HISTORIAL, PARA EL ANÁLISIS DE
// DATOS (ÁRBOL DE DECISIÓN Y AGRUPAMIENTO JERÁRQUICO). USA SU PROPIA SEMILLA PARA QUE LOS DATOS DEL LOTE 1 NO CAMBIEN.
//
// CADA TRABAJADOR TIENE UNA "RESPONSABILIDAD" OCULTA (0 A 1) QUE **NO SE GUARDA EN FIREBASE**: DE ELLA DEPENDE QUE
// FALTE, QUE LE REPORTEN O QUE ABANDONE UNA OBRA (Y TAMBIÉN LA DISTANCIA A LA OBRA INFLUYE). EL ANÁLISIS NUNCA LA VE:
// SOLO VE LO QUE LA APP REGISTRA (CALIFICACIONES, OBRAS TERMINADAS, DISTANCIA...), COMO PASARÍA CON USUARIOS REALES.
// CADA ZONA TIENE UN "TIPO" (TAMBIÉN OCULTO) QUE DECIDE CUÁNTA DEMANDA Y CUÁNTA OFERTA HAY DE CADA OFICIO.
const LOTE2 = { personas: [], contratos: [], vacantes: [], pagos: [] };
{
  const semillaLote1 = semilla;
  semilla = 20261119;

  const lugar = (m) => LUGARES.find(l => l.municipio === m);
  const ZONAS = [
    { ...lugar('Toluca'), tipo: 'oferta' },
    { ...lugar('Iztapalapa'), tipo: 'oferta' },
    { ...lugar('Puebla'), tipo: 'oferta' },
    { region: 'nuevoleon', estado: 'Nuevo León', municipio: 'Monterrey', lat: 25.6866, lng: -100.3161, lada: '81', tipo: 'oferta' },
    { ...lugar('Querétaro'), tipo: 'crecimiento' },
    { region: 'bajio', estado: 'Guanajuato', municipio: 'León', lat: 21.1250, lng: -101.6860, lada: '477', tipo: 'crecimiento' },
    { region: 'nuevoleon', estado: 'Nuevo León', municipio: 'Apodaca', lat: 25.7817, lng: -100.1886, lada: '81', tipo: 'crecimiento' },
    { region: 'jalisco', estado: 'Jalisco', municipio: 'Zapopan', lat: 20.7236, lng: -103.3848, lada: '33', tipo: 'crecimiento' },
    { ...lugar('Coyoacán'), tipo: 'remodelacion' },
    { ...lugar('San Andrés Cholula'), tipo: 'remodelacion' },
    { region: 'jalisco', estado: 'Jalisco', municipio: 'Guadalajara', lat: 20.6597, lng: -103.3496, lada: '33', tipo: 'remodelacion' },
    { region: 'morelos', estado: 'Morelos', municipio: 'Cuernavaca', lat: 18.9242, lng: -99.2216, lada: '777', tipo: 'remodelacion' },
    { region: 'michoacan', estado: 'Michoacán', municipio: 'Morelia', lat: 19.7060, lng: -101.1950, lada: '443', tipo: 'remodelacion' },
    { region: 'hidalgo', estado: 'Hidalgo', municipio: 'Pachuca de Soto', lat: 20.1011, lng: -98.7591, lada: '771', tipo: 'baja' },
    { ...lugar('Zinacantepec'), tipo: 'baja' },
    { ...lugar('Corregidora'), tipo: 'baja' },
  ];
  const OFICIOS2 = ['Albañil', 'Pintor', 'Electricista', 'Plomero', 'Carpintero', 'Azulejero'];
  const todos6 = (n) => Object.fromEntries(OFICIOS2.map(o => [o, n]));
  // CUÁNTO SE BUSCA CADA OFICIO (VACANTES) Y CUÁNTOS TRABAJADORES HAY, SEGÚN EL TIPO DE ZONA
  const DEMANDA = {
    oferta: todos6(2),
    crecimiento: { 'Albañil': 5, 'Pintor': 1, 'Electricista': 4, 'Plomero': 3, 'Carpintero': 1, 'Azulejero': 1 },
    remodelacion: { 'Albañil': 1, 'Pintor': 4, 'Electricista': 1, 'Plomero': 2, 'Carpintero': 3.5, 'Azulejero': 3.5 },
    baja: todos6(0.6),
  };
  const OFERTA = {
    oferta: todos6(3),
    crecimiento: { 'Albañil': 1.4, 'Pintor': 1.5, 'Electricista': 0.9, 'Plomero': 0.8, 'Carpintero': 0.8, 'Azulejero': 0.8 },
    remodelacion: { 'Albañil': 2, 'Pintor': 0.4, 'Electricista': 1.5, 'Plomero': 1, 'Carpintero': 0.3, 'Azulejero': 0.3 },
    baja: todos6(0.7),
  };
  const N_TRABAJADORES = { 'Albañil': 13, 'Pintor': 9, 'Electricista': 9, 'Plomero': 7, 'Carpintero': 7, 'Azulejero': 7 };
  const N_VACANTES = { 'Albañil': 36, 'Pintor': 38, 'Electricista': 40, 'Plomero': 22, 'Carpintero': 28, 'Azulejero': 30 };
  const DURACION = { 'Albañil': [2, 6], 'Pintor': [2, 5], 'Electricista': [1, 3], 'Plomero': [1, 2], 'Carpintero': [2, 5], 'Azulejero': [2, 4] };
  const RADIO_KM = 60; // NADIE ACEPTA UNA OBRA A MÁS DE ESTO DE SU CASA

  const elegirPeso = (lista, peso) => {
    const total = lista.reduce((s, x) => s + peso(x), 0);
    let r = azar() * total;
    for (const x of lista) { r -= peso(x); if (r <= 0) return x; }
    return lista[lista.length - 1];
  };
  const rango = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  // CARAS: PRIMERO LAS DE randomuser.me (0 A 99 POR GÉNERO) QUE EL LOTE 1 NO USÓ Y LUEGO LAS DE xsgames.co (0 A 78)
  const urlsCaras = (carpeta, desde, otra) => [...[...rango(desde + 10, 99), ...rango(0, 10)].map(i => `https://randomuser.me/api/portraits/${carpeta}/${i}.jpg`), ...rango(0, 78).map(i => `https://xsgames.co/randomusers/assets/avatars/${otra}/${i}.jpg`)];
  const caras = { H: urlsCaras('men', fotoHombre, 'male'), M: urlsCaras('women', fotoMujer, 'female') };
  const nuevaPersona = (rol, genero, zona, extra) => {
    const p = crearPersona(rol, genero, zona, extra);
    while (todos.some(x => x.usuario === p.usuario) || LOTE2.personas.some(x => x.usuario === p.usuario)) p.usuario = p.usuario.replace(/\d+$/, String(entre(10, 99)));
    p.correo = `${p.usuario}${DOMINIO_PRUEBAS}`;
    const cara = caras[genero].shift();
    if (cara === undefined) throw new Error('Se acabaron las caras de randomuser.me');
    p.foto = cara;
    p.zona = zona; p.lote = 2; p.ocupadoEn = [];
    LOTE2.personas.push(p);
    return p;
  };

  // TRABAJADORES: SE REPARTEN SEGÚN LA OFERTA DE CADA ZONA
  // PRIMERO DOS POR ZONA (EL OFICIO SEGÚN LA OFERTA DE LA ZONA) Y LOS DEMÁS SEGÚN LA OFERTA
  const trabajadores2 = [];
  const cupo = { ...N_TRABAJADORES };
  const lugares = [];
  for (const zona of [...ZONAS, ...ZONAS]) {
    const oficio = elegirPeso(OFICIOS2.filter(o => cupo[o] > 0), o => OFERTA[zona.tipo][o] * cupo[o]);
    cupo[oficio]--; lugares.push({ oficio, zona });
  }
  for (const oficio of OFICIOS2) while (cupo[oficio]-- > 0) lugares.push({ oficio, zona: elegirPeso(ZONAS, z => OFERTA[z.tipo][oficio]) });
  for (const { oficio, zona } of lugares) {
    {
      const [min, max] = OFICIOS[oficio].tarifa;
      const u = azar();
      trabajadores2.push(nuevaPersona('Trabajador', ['Pintor', 'Azulejero', 'Carpintero'].includes(oficio) && probabilidad(0.25) ? 'M' : 'H', zona, {
        oficio, tarifa_monto: Math.round(entre(min, max) / 10) * 10, tarifa_periodo: 'por día',
        dias_disponibles: probabilidad(0.75) ? TODA_SEMANA : ENTRE_SEMANA, ocupado: false, usos: 0, portafolio: [],
        // OCULTA: 50% MUY CUMPLIDOS, 32% REGULARES, 18% POCO CUMPLIDOS
        responsabilidad: u < 0.50 ? 0.86 + azar() * 0.12 : u < 0.82 ? 0.62 + azar() * 0.22 : 0.30 + azar() * 0.30,
      }));
    }
  }
  // CONTRATISTAS: UNO POR ZONA Y EL RESTO DONDE HAY MÁS DEMANDA
  const contratistas2 = [];
  const demandaZona = (z) => OFICIOS2.reduce((s, o) => s + DEMANDA[z.tipo][o], 0);
  const zonasContratistas = [...ZONAS, ...Array.from({ length: 12 }, () => elegirPeso(ZONAS, demandaZona))];
  for (const zona of zonasContratistas) contratistas2.push(nuevaPersona('Contratista', probabilidad(0.36) ? 'M' : 'H', zona, { empresa: elegir(EMPRESAS) }));

  // VACANTES DE LOS ÚLTIMOS 8 MESES (CADA UNA CON SU PROPIA FOTO, SIN REPETIR; LAS OBRAS GRANDES PIDEN 2 O 3 PERSONAS)
  const planes = [];
  for (const oficio of OFICIOS2) {
    const disponibles = FOTOS[oficio].length - (USO_FOTOS[oficio] || 0);
    for (let i = 0; i < Math.min(N_VACANTES[oficio], disponibles); i++) planes.push({ oficio, zona: elegirPeso(ZONAS, z => DEMANDA[z.tipo][oficio]), inicio: -entre(14, 240) });
  }
  planes.sort((a, b) => a.inicio - b.inicio);

  const libre = (t, a, b) => t.ocupadoEn.every(([x, y]) => b < x - 1 || a > y + 1);
  const resenados = new Set();
  const resenar2 = (de, para, estrellas, comentario, fecha) => {
    if (resenados.has(`${de.uid}_${para.uid}`)) return; // UNA RESEÑA POR PAREJA (COMO EN LA APP)
    resenados.add(`${de.uid}_${para.uid}`);
    resenar(de, para, estrellas, comentario, fecha);
  };
  const MOTIVOS_REPORTE = [
    ['Trabajo mal hecho', 'Varias partes quedaron mal y hubo que pedirle que las corrigiera.'],
    ['Llegó tarde varios días', 'Quedamos a las 8 y llegaba después de las 10; el trabajo se atrasó.'],
    ['Dejó la obra sucia', 'Al terminar dejó escombro y material tirado; tuve que pagar la limpieza.'],
  ];

  for (const plan of planes) {
    const { oficio, zona } = plan;
    // DÍAS DE TRABAJO (LUNES A SÁBADO)
    let d = plan.inicio;
    const dias = [];
    const n = entre(...DURACION[oficio]);
    while (dias.length < n && d <= -4) { if (diaSemana(dia(d)) !== 'Dom') dias.push(d); d++; }
    if (!dias.length) continue;
    const inicio = dias[0], fin = dias[dias.length - 1];
    const c = elegir(contratistas2.filter(x => x.zona.municipio === zona.municipio));
    const p = elegir(PLANTILLAS[oficio]);
    const [min, max] = OFICIOS[oficio].tarifa;
    const periodo = probabilidad(0.6) ? 'por día' : 'por obra';
    const monto = periodo === 'por día' ? Math.round(entre(min, max) / 10) * 10 : Math.round(dias.length * entre(min, max) * 1.05 / 100) * 100;
    const coordenadas = cerca(zona, 7);
    const v = {
      id: idCorto(), contratista: c, oficio, titulo: p.titulo, descripcion: p.descripcion,
      inicio, fin, dias: TODA_SEMANA, periodo, monto, ocupados: 0, postulantes: 0, coordenadas,
      cupo: ['Albañil', 'Pintor'].includes(oficio) ? elegir([2, 2, 3, 4]) : elegir([1, 2, 2]),
      lugar_texto: `${elegir(CALLES)} ${entre(10, 450)}, ${elegir(COLONIAS)}, ${zona.municipio}`,
      horario: elegir(['Lun a Sáb, 8:00 a 17:00', 'Lun a Sáb, 9:00 a 18:00']),
      condiciones: { ...CONDICIONES_BASE(), cuando_pago: 'Al terminar la obra' },
      foto_trabajo: nuevaFoto(oficio),
      publicada: dia(inicio - entre(3, 10), entre(9, 20), entre(0, 59)),
      pago: textoPrecio(monto, periodo), estado: 'Cerrada', lote: 2,
    };
    vacantes.push(v); LOTE2.vacantes.push(v);

    // QUIÉNES LA TOMAN: DE LOS TRES MÁS CERCANOS QUE ESTÉN LIBRES (SI NADIE ESTÁ CERCA, SE QUEDA SIN CUBRIR)
    const candidatos = trabajadores2
      .filter(t => t.oficio === oficio && libre(t, inicio, fin + 2))
      .map(t => ({ t, km: distanciaKm(t.ubicacion, coordenadas) }))
      .filter(x => x.km <= RADIO_KM)
      .sort((a, b) => a.km - b.km);
    if (!candidatos.length) { v.sin_cubrir = true; continue; }
    const elegidos = [];
    while (elegidos.length < v.cupo && candidatos.length) {
      const r = azar();
      elegidos.push(candidatos.splice(Math.min(candidatos.length - 1, r < 0.55 ? 0 : r < 0.85 ? 1 : 2), 1)[0]);
    }
    v.postulantes = v.ocupados = elegidos.length;
    for (const { t, km } of elegidos) {
    t.ocupadoEn.push([inicio, fin + 2]);
    t.usos++;

    const origen = elegir(['trabajador', 'contratista']);
    const fechaPostulacion = new Date(v.publicada.getTime() + entre(2, 40) * 3600000);
    const k = { id: idCorto(), v, t, c, escenario: 'finalizada', origen, fechaPostulacion, bitacora: [], pagos: [], ajustes: [], reportes_abiertos: 0, extra: {}, lote: 2, km };
    k.aceptado = new Date(Math.min(fechaPostulacion.getTime() + entre(6, 30) * 3600000, dia(inicio - 1, 19).getTime()));
    if (k.aceptado < fechaPostulacion) k.aceptado = new Date(fechaPostulacion.getTime() + 3 * 3600000);
    contratos.push(k); LOTE2.contratos.push(k);
    conversacion(t, c, v, k, 'aceptado');
    avisar(origen === 'trabajador' ? t : c, '¡Trato cerrado!', `${origen === 'trabajador' ? nombreCompleto(c) + ' (contratista)' : nombreCompleto(t) + ' (trabajador)'} también aceptó "${v.titulo}". Los dos aceptaron: la obra ya está activa en tu pestaña Obras.`, k.aceptado, { destino: { abrir: 'obra', id_contrato: k.id } });

    // QUÉ PASÓ EN LA OBRA (DEPENDE DE LA RESPONSABILIDAD OCULTA Y DE LO LEJOS QUE QUEDA)
    const resp = t.responsabilidad;
    const pFalta = Math.min(0.6, 0.5 * (1 - resp) ** 1.6 + Math.max(0, km - 15) * 0.003);
    const abandona = probabilidad(0.35 * (1 - resp) ** 1.4 + (km > 30 ? 0.04 : 0));
    const diaAbandono = abandona ? Math.floor(azar() * Math.max(1, dias.length - 1)) : null; // ÚLTIMO DÍA QUE SÍ FUE
    const reportado = !abandona && probabilidad(0.3 * (1 - resp) ** 1.2);
    const notas = NOTAS[oficio];
    const faltas = [];
    dias.forEach((dd, i) => {
      if (abandona && i > diaAbandono + 2) return; // DESPUÉS DE DOS FALTAS SEGUIDAS, EL CONTRATISTA CANCELA
      const fecha = dia(dd, entre(16, 19), entre(0, 59));
      const clave = claveMexico(fecha);
      const falta = abandona ? (i > diaAbandono || probabilidad(pFalta)) : probabilidad(pFalta);
      if (falta) {
        faltas.push(clave);
        k.bitacora.push({ id: clave, asistio: false, automatica: true, autor_id: 'sistema', evidencia: null, nota: 'El trabajador no llenó la bitácora este día. PalanteMX lo registró automáticamente como falta.', fecha: fechaMx(dia(dd)), timestamp: dia(dd).getTime() });
        return;
      }
      const lugarRegistro = cerca({ lat: coordenadas.latitud, lng: coordenadas.longitud }, 0.12);
      k.bitacora.push({
        id: clave, asistio: true, autor_id: t.uid,
        nota: notas[Math.min(Math.floor(i * notas.length / dias.length), notas.length - 1)],
        evidencia: null, fecha: fechaMx(fecha), timestamp: fecha.getTime(),
        ubicacion_registro: { ...lugarRegistro, precision: entre(6, 35), simulada: false },
        distancia_obra_km: Math.round(distanciaKm(lugarRegistro, coordenadas) * 1000) / 1000,
        lugar_registro: v.lugar_texto, revision: 'Confirmada',
        fecha_revision: new Date(fecha.getTime() + entre(2, 20) * 3600000).toISOString(),
      });
    });
    const trabajados = k.bitacora.filter(b => b.asistio).length;
    const tarifaDia = periodo === 'por día' ? monto : Math.round(monto / dias.length);
    const ultimoDia = k.bitacora.length ? k.bitacora[k.bitacora.length - 1].timestamp : dia(inicio).getTime();
    const resolver = (fecha, descuento, resolucion, nota) => ({ fecha, decision: 'procede', descuento, resolucion, nota, responsable: 'Trabajador' });

    if (abandona) {
      // EL TRABAJADOR DEJÓ DE IR: EL CONTRATISTA CANCELA, LA OBRA SE SUSPENDE Y EL ADMIN LA CANCELA (CULPA DEL TRABAJADOR)
      k.escenario = 'cancelada_admin';
      const cuando = new Date(ultimoDia + entre(3, 8) * 3600000);
      const idQueja = idCorto();
      const motivo = 'El trabajador dejó de presentarse a la obra y ya no contesta los mensajes.';
      Object.assign(k.extra, { cancelado_por: c.uid, motivo_cancelacion: motivo, id_queja: idQueja, timestamp_cancelacion: cuando.getTime(), cancelacion_tardia: true, horas_aviso: 0, cupo_liberado: true });
      mensaje(t, c, 'c', `${corto(t)}, ¿va a venir hoy? Ya van dos días que no llega.`, new Date(ultimoDia - 3600000));
      quejas.push({
        id: idQueja, contrato: k, tipo: 'cancelacion', motivo: 'Cancelación tardía de obra', reportante: c, acusado: t, fecha: cuando,
        descripcion: `${motivo}\n\nAVISO: canceló con la obra ya empezada (menos de las 48 horas que se piden).`,
        monto_pagado: 0, cancelacion_tardia: true, horas_aviso: 0,
        resuelta: resolver(new Date(cuando.getTime() + entre(10, 40) * 3600000), 0, `Tiene la razón ${nombreCompleto(c)} (contratista). La obra queda CANCELADA y se libera el lugar.`, 'El trabajador dejó de llenar la bitácora y no respondió en el chat. Se cancela la obra por causa del trabajador.'),
      });
      if (trabajados) k.pagos.push({ id: idFirebase(12), monto: trabajados * tarifaDia, concepto: 'Pago de los días trabajados', comprobante: null, estado: 'Recibido', fecha: fechaMx(new Date(cuando.getTime() + 86400000)), timestamp: cuando.getTime() + 86400000, fecha_confirmacion: new Date(cuando.getTime() + 90000000).toISOString() });
    } else {
      k.fin = dia(fin + (faltas.length || reportado ? entre(2, 4) : entre(0, 1)), entre(17, 20), 5);
      if (!faltas.length && !reportado && probabilidad(0.3)) { k.fin = dia(fin + 1, 9, 5); k.extra.cierre_automatico = true; }
      if (faltas.length) {
        // EL CIERRE AUTOMÁTICO ENCONTRÓ FALTAS: REPORTE DE CIERRE, EL ADMIN DESCUENTA ESOS DÍAS Y LA OBRA SE TERMINA
        const idQueja = idCorto();
        const fecha = dia(fin + 1, 9, 2);
        const descuento = faltas.length * tarifaDia;
        k.extra.revision_cierre = { motivo: `${faltas.length} día(s) de trabajo sin asistencia registrada`, fecha: fechaMx(fecha), dias_falta: faltas, id_queja: idQueja };
        quejas.push({
          id: idQueja, contrato: k, tipo: 'cierre', motivo: 'Faltas al cerrar la obra', reportante: c, acusado: t, fecha, automatico: true, dias_falta: faltas,
          descripcion: `La obra terminó el ${fechaLarga(dia(fin))}. ${nombreCompleto(t)} (trabajador) no registró asistencia ${faltas.length} día(s) de trabajo. Hay que decidir si esos días se descuentan del pago.`,
          resuelta: resolver(new Date(fecha.getTime() + entre(8, 40) * 3600000), descuento, `Tiene la razón ${nombreCompleto(c)} (contratista). Se descuentan $${descuento.toLocaleString('es-MX')} del pago a ${nombreCompleto(t)} (trabajador).`, 'No hay bitácora de esos días: se descuentan y la obra se da por terminada.'),
        });
        k.ajustes.push({ tipo: 'descuento', monto: descuento, texto: `Se descuentan $${descuento.toLocaleString('es-MX')} del pago a ${nombreCompleto(t)} (trabajador).`, motivo: 'Faltas al cerrar la obra', id_queja: idQueja, fecha: fechaMx(fecha) });
      }
      if (reportado) {
        const [motivo, descripcion] = elegir(MOTIVOS_REPORTE);
        const idQueja = idCorto();
        const fecha = dia(dias[Math.floor(dias.length / 2)], 19, 30);
        const procede = probabilidad(0.75);
        const descuento = procede ? tarifaDia : 0;
        quejas.push({
          id: idQueja, contrato: k, tipo: 'incumplimiento', motivo, reportante: c, acusado: t, fecha, descripcion,
          version_acusado: { texto: elegir(['Hice el trabajo como se acordó; el material no era el adecuado.', 'Llegué tarde dos días por el transporte, pero recuperé las horas.', 'Sí quedó un detalle, ya lo corregí al día siguiente.']), fotos: [], de_acuerdo: false, fecha: new Date(fecha.getTime() + 14 * 3600000).toISOString() },
          resuelta: procede
            ? resolver(new Date(fecha.getTime() + entre(20, 60) * 3600000), descuento, `Tiene la razón ${nombreCompleto(c)} (contratista). Se descuentan $${descuento.toLocaleString('es-MX')} del pago a ${nombreCompleto(t)} (trabajador).`, 'Por la evidencia, el reporte procede. Se descuenta un día de trabajo.')
            : { ...resolver(new Date(fecha.getTime() + entre(20, 60) * 3600000), 0, `Tiene la razón ${nombreCompleto(t)} (trabajador). Sin ajuste de dinero.`, 'No hay pruebas suficientes del reporte.'), decision: 'no_procede', responsable: 'Nadie' },
        });
        if (procede) k.ajustes.push({ tipo: 'descuento', monto: descuento, texto: `Se descuentan $${descuento.toLocaleString('es-MX')} del pago a ${nombreCompleto(t)} (trabajador).`, motivo, id_queja: idQueja, fecha: fechaMx(dia(fin)) });
      }
      const total = (periodo === 'por día' ? trabajados * monto : monto) - k.ajustes.reduce((s, a) => s + a.monto, 0);
      const cuando = new Date(k.fin.getTime() + entre(1, 20) * 3600000);
      if (total > 0) k.pagos.push({ id: idFirebase(12), monto: total, concepto: 'Pago de la obra', comprobante: null, estado: 'Recibido', fecha: fechaMx(cuando), timestamp: cuando.getTime(), fecha_confirmacion: new Date(cuando.getTime() + entre(1, 10) * 3600000).toISOString() });
      mensaje(t, c, 'c', faltas.length || reportado ? 'Ya quedó, aunque hubo detalles. Gracias.' : 'Muchas gracias, quedó muy bien el trabajo.', new Date(k.fin.getTime() + 3600000));
      mensaje(t, c, 't', 'Gracias a usted, para lo que se ofrezca.', new Date(k.fin.getTime() + 2 * 3600000));
      avisar(c, 'Obra finalizada', `${nombreCompleto(t)} confirmó que "${v.titulo}" terminó. Ya pueden calificarse.`, k.fin, { destino: { abrir: 'obra', id_contrato: k.id } });
    }
    k.faltas = faltas.length; k.reportado = reportado; k.abandono = abandona;
    for (const pago of k.pagos) { pago.comprobante = `lote2:${pago.id}`; LOTE2.pagos.push({ pago, k }); }

    // RESEÑAS (LA DEL CONTRATISTA REFLEJA LO QUE PASÓ)
    const despues = (k.fin || new Date(k.extra.timestamp_cancelacion)).getTime();
    const estrellas = abandona ? elegir([1, 1, 2]) : reportado ? elegir([2, 3, 3]) : faltas.length >= 2 ? elegir([2, 3]) : faltas.length === 1 ? elegir([3, 4, 4]) : elegir([5, 5, 5, 4]);
    const comentario = abandona ? elegir(['Dejó la obra a medias y ya no contestó.', 'No cumplió, abandonó el trabajo.']) : reportado ? elegir(['Hubo que corregirle varias cosas.', 'El trabajo salió, pero con problemas.']) : faltas.length ? elegir(['Buen trabajo, pero faltó algunos días.', 'Cumplió a medias, faltó sin avisar.']) : elegir(COMENTARIOS_A_TRABAJADOR);
    if (probabilidad(0.9)) resenar2(c, t, estrellas, comentario, new Date(despues + entre(2, 40) * 3600000));
    if (probabilidad(0.8)) resenar2(t, c, elegir([5, 5, 4, 4, 3]), elegir(COMENTARIOS_A_CONTRATISTA), new Date(despues + entre(2, 60) * 3600000));

    // OBRA TERMINADA EN EL PERFIL DE LOS DOS
    if (k.escenario === 'finalizada') {
      const comun = {
        fotos: [], dias_trabajados: trabajados, dias_confirmados: trabajados, id_contrato: k.id, titulo: v.titulo,
        ubicacion: `${zona.municipio}, ${zona.estado}`, pago: v.pago, foto_trabajo: v.foto_trabajo,
        fecha_inicio: fechaMx(k.aceptado), fecha_fin: fechaMx(k.fin),
      };
      t.obras.push({ ...comun, contratista: nombreCompleto(c) });
      c.obras.push({ ...comun, trabajador: nombreCompleto(t), oficio: t.oficio, id_trabajador: t.uid });
    }
    }
  }
  todos.push(...LOTE2.personas);
  semilla = semillaLote1;
}

// ------------------------------------------------------------------------------------------------ ARMAR LOS DOCUMENTOS
const ESTADO_FIRESTORE = {
  finalizada: 'Finalizada', activa: 'Aceptada (En Proceso)', por_confirmar: 'Por confirmar fin', pendiente: 'Pendiente',
  propuesta: 'Propuesta', propuesta_sin_respuesta: 'Propuesta', rechazada: 'Rechazada', cancelada_a_tiempo: 'Cancelada',
  suspendida_tardia: 'Suspendida', revision_cierre: 'Suspendida', cancelada_admin: 'Cancelada',
};

const armar = async () => {
  // ADMIN QUE "RESOLVIÓ" LOS REPORTES DE PRUEBA (EL PRINCIPAL)
  const perfilAdmin = await db.doc('Sistema/AdminProfile').get();
  const admins = await db.collection('Administradores').limit(5).get();
  const admin = admins.docs.find(d => d.data().principal !== false) || admins.docs[0];
  const nombreAdmin = perfilAdmin.data()?.nombre || admin?.data()?.nombre || 'Administrador';

  // NADIE PUEDE HABER USADO LA APP ANTES DE REGISTRARSE: SI SU PRIMERA VACANTE, SOLICITUD O MENSAJE ES ANTERIOR
  // A SU FECHA DE REGISTRO, SE REGISTRÓ ENTRE 1 Y 6 DÍAS ANTES DE ESO
  for (const p of todos) {
    const fechas = [
      ...vacantes.filter(v => v.contratista === p).map(v => v.publicada),
      ...contratos.filter(k => k.t === p || k.c === p).map(k => k.fechaPostulacion),
      ...[...chats.values()].filter(ch => ch.t === p || ch.c === p).flatMap(ch => ch.mensajes.map(m => m.fecha)),
    ];
    const primera = fechas.length ? new Date(Math.min(...fechas.map(f => f.getTime()))) : null;
    if (primera && primera <= p.registro) p.registro = new Date(primera.getTime() - entre(1, 6) * 86400000 - entre(1, 10) * 3600000);
  }

  // USUARIOS (PERFIL PÚBLICO)
  for (const p of todos) {
    const ocupado = contratos.some(k => k.t === p && ['activa', 'por_confirmar'].includes(k.escenario));
    const calificacion = p.resenas.length ? (p.resenas.reduce((s, r) => s + r.estrellas, 0) / p.resenas.length).toFixed(1) : '0.0';
    const comun = {
      rol_usuario: p.rol, nombre: p.nombre, apellidos: p.apellidos, correo: p.correo, numero_telefono: p.telefono,
      nombre_usuario: p.usuario, foto_rostro_url: p.foto, ubicacion: p.ubicacion, ubicacion_precision: entre(8, 40),
      ubicacion_actualizada: dia(-entre(0, 4), entre(8, 20)).toISOString(), ubicacion_estado: p.lugar.estado, ubicacion_texto: p.lugar.municipio,
      kyc_aprobado: true, estado_cuenta: p.estado || 'Activa', calificacion, numero_resenas: p.resenas.length,
      resenas: p.resenas.sort((a, b) => a.timestamp - b.timestamp), obras_realizadas: p.obras, fecha_registro: Timestamp.fromDate(p.registro), es_prueba: true,
    };
    if (p.rol === 'Trabajador') {
      poner(`Usuarios/${p.uid}`, {
        ...comun, descripcion_servicios: descripcionServicios(p),
        oficio_principal: p.oficio, tarifa_monto: p.tarifa_monto, tarifa_periodo: p.tarifa_periodo,
        dias_disponibles: p.dias_disponibles, disponibilidad: ocupado ? 'Ocupado' : 'Disponible', portafolio: p.portafolio,
      });
    } else {
      poner(`Contratistas/${p.uid}`, { ...comun, empresa: p.empresa });
    }
  }

  // VACANTES
  for (const v of vacantes) {
    const c = v.contratista;
    poner(`Vacantes/${v.id}`, {
      titulo: v.titulo, ubicacion: `${c.lugar.municipio}, ${c.lugar.estado}`, estado_republica: c.lugar.estado,
      pago: v.pago, pago_monto: v.monto, pago_periodo: v.periodo, horario: v.horario,
      inicio_obra: claveMexico(dia(v.inicio)), fin_obra: claveMexico(dia(v.fin)), dias_obra: v.dias,
      descripcion: v.descripcion, categoria: v.oficio, cupo_total: v.cupo, foto_trabajo: v.foto_trabajo,
      coordenadas: v.coordenadas, coordenadas_obra: v.coordenadas, lugar_obra_texto: v.lugar_texto, condiciones: v.condiciones,
      contratista: nombreCompleto(c), foto_contratista: c.foto, empresa: c.empresa, id_contratista: c.uid,
      cupo_actual: Math.max(v.ocupados, 0), etiquetas: ['Nueva'], estado: v.estado, postulantes: v.postulantes,
      fecha_publicacion: (v.republicada || v.publicada).toISOString(), ...(v.republicada ? { fecha_republicada: v.republicada.toISOString() } : {}),
      es_prueba: true,
    });
  }

  // CONTRATOS (Postulaciones) Y SU BITÁCORA
  for (const k of contratos) {
    const v = k.v;
    // LAS FECHAS DEL CONTRATO SON LAS QUE TENÍA AL ACEPTARSE (EN LA CANCELADA, ANTES DE VOLVER A PUBLICAR)
    const inicio = k.escenario === 'cancelada_a_tiempo' ? 6 : v.inicio;
    const fin = k.escenario === 'cancelada_a_tiempo' ? 10 : v.fin;
    const datos = {
      id_vacante: v.id, titulo_vacante: v.titulo, id_trabajador: k.t.uid, nombre_trabajador: nombreCompleto(k.t),
      id_contratista: k.c.uid, contratista: nombreCompleto(k.c),
      inicio_obra: claveMexico(dia(inicio)), fin_obra: claveMexico(dia(fin)), dias_obra: v.dias, oficio_trabajador: k.t.oficio,
      vacante: {
        titulo: v.titulo, oficio: v.oficio, contratista: nombreCompleto(k.c), ubicacion: `${k.c.lugar.municipio}, ${k.c.lugar.estado}`,
        pago: v.pago, pago_monto: v.monto, pago_periodo: v.periodo, horario: v.horario, descripcion: v.descripcion,
        foto_trabajo: v.foto_trabajo, foto_contratista: k.c.foto, coordenadas: v.coordenadas, lugar_exacto: true, lugar_texto: v.lugar_texto,
        condiciones: v.condiciones,
      },
      aceptado_por: k.aceptado ? [k.t.uid, k.c.uid] : [],
      reportes_abiertos: k.reportes_abiertos,
      estado: ESTADO_FIRESTORE[k.escenario], origen: k.origen,
      fecha_postulacion: fechaMx(k.fechaPostulacion), timestamp: k.fechaPostulacion.getTime(),
      pagos: k.pagos, ajustes_pago: k.ajustes, es_prueba: true, ...k.extra,
    };
    if (k.aceptado) Object.assign(datos, { fecha_inicio: fechaMx(k.aceptado), timestamp_inicio: k.aceptado.getTime() });
    if (k.fin) Object.assign(datos, { fecha_fin: fechaMx(k.fin), timestamp_fin: k.fin.getTime() });
    const idQueja = quejas.find(q => q.contrato === k && q.tipo === 'cancelacion')?.id;
    if (idQueja) datos.id_queja = idQueja;
    poner(`Postulaciones/${k.id}`, datos);
    for (const b of k.bitacora) { const { id, ...resto } = b; poner(`Postulaciones/${k.id}/Bitacora/${id}`, resto); }
  }

  // REPORTES
  for (const q of quejas) {
    const datos = {
      ...(q.tipo ? { tipo: q.tipo } : {}), motivo: q.motivo, descripcion: q.descripcion,
      id_reportante: q.reportante.uid, nombre_reportante: q.automatico ? `${nombreCompleto(q.reportante)} (reporte automático de PalanteMX)` : nombreCompleto(q.reportante), rol_reportante: q.reportante.rol,
      id_acusado: q.acusado.uid, acusado: nombreCompleto(q.acusado), rol_acusado: q.acusado.rol,
      ...(q.contrato ? { id_contrato: q.contrato.id, titulo_obra: q.contrato.v.titulo } : {}),
      estado: q.resuelta ? 'Resuelta' : 'En Revisión Administrativa', fecha_reporte: q.fecha.toISOString(),
      fotos_evidencia: [], es_prueba: true,
      ...(q.fecha_dia ? { fecha_dia: q.fecha_dia, id_entrada: q.id_entrada } : {}),
      ...(q.dias_falta ? { dias_falta: q.dias_falta } : {}),
      ...(q.monto_pagado !== undefined ? { monto_pagado: q.monto_pagado, cancelacion_tardia: q.cancelacion_tardia, horas_aviso: q.horas_aviso } : {}),
      ...(q.version_acusado ? { version_acusado: q.version_acusado } : {}),
      ...(q.asignado && admin ? { asignado_a: { uid: admin.id, nombre: nombreAdmin, fecha: dia(0, 9, 5).toISOString() } } : {}),
    };
    if (q.resuelta) {
      Object.assign(datos, {
        resolucion: q.resuelta.resolucion, nota_admin: q.resuelta.nota, descuento: q.resuelta.descuento,
        fecha_resolucion: q.resuelta.fecha.toISOString(), atendida_por: nombreAdmin, atendida_por_uid: admin?.id || '', responsable: q.resuelta.responsable,
      });
      const motivoTexto = q.motivo;
      const obra = q.contrato ? ` en "${q.contrato.v.titulo}"` : '';
      const extra = { tipo: 'admin', importante: true, leida: true, ...(q.contrato ? { destino: { abrir: 'reportes', id_contrato: q.contrato.id } } : {}) };
      avisar(q.reportante, 'Tu reporte fue resuelto', `Reporte "${motivoTexto}"${obra}: ${q.resuelta.resolucion}\n\nNota del administrador: ${q.resuelta.nota}`, q.resuelta.fecha, extra);
      avisar(q.acusado, 'Se resolvió un reporte sobre ti', `Reporte "${motivoTexto}"${obra}, levantado por ${nombreCompleto(q.reportante)} (${q.reportante.rol.toLowerCase()}): ${q.resuelta.resolucion}\n\nNota del administrador: ${q.resuelta.nota}`, q.resuelta.fecha, extra);
    }
    poner(`Quejas_Soporte/${q.id}`, datos);
  }

  // CHATS Y MENSAJES
  for (const { t, c, mensajes } of chats.values()) {
    const id = idCorto();
    mensajes.sort((a, b) => a.fecha - b.fecha);
    const ultimo = mensajes[mensajes.length - 1];
    poner(`Chats/${id}`, {
      usuarios_ids: [t.uid, c.uid],
      datos_usuarios: { [t.uid]: { nombre: nombreCompleto(t), foto: t.foto, rol: 'Trabajador' }, [c.uid]: { nombre: nombreCompleto(c), foto: c.foto, rol: 'Contratista' } },
      ultimo_mensaje: ultimo.texto, ultimo_emisor_id: ultimo.emisor.uid, leido: ultimo.fecha < dia(-1), bloqueado: false,
      timestamp: ultimo.fecha.getTime(), es_prueba: true,
    });
    for (const m of mensajes) {
      poner(`Chats/${id}/Mensajes/${idCorto()}`, { emisor_id: m.emisor.uid, texto: m.texto, archivo_url: null, archivo_nombre: null, archivo_tipo: null, hora: horaMx(m.fecha), timestamp: m.fecha.getTime() });
    }
  }

  // RESEÑAS, NOTIFICACIONES Y ACTIVIDAD DIARIA (ÚLTIMOS 30 DÍAS)
  for (const r of resenasDocs) { const { id, ...resto } = r; poner(`Resenas_Plataforma/${id}`, { ...resto, es_prueba: true }); }
  for (const n of notificaciones) poner(`Notificaciones/${idCorto()}`, { ...n, es_prueba: true });
  for (let d = -29; d <= 0; d++) {
    const fecha = claveMexico(dia(d));
    for (const p of todos) {
      if (p.registro > dia(d, 23)) continue;
      const activo = contratos.some(k => k.t === p || k.c === p);
      if (probabilidad(activo ? 0.55 : 0.2)) poner(`Actividad/${fecha}_${p.uid}`, { uid: p.uid, fecha, rol: p.rol, es_prueba: true });
    }
  }

  // INGRESOS POR COMERCIALES DE EJEMPLO PARA EL REPORTE FINANCIERO (SOLO SI TODAVÍA NO HAY NADA CONFIGURADO)
  const finanzas = await db.doc('Sistema/Finanzas').get();
  if (!finanzas.exists) {
    const mes = (n) => { const f = dia(0); f.setUTCMonth(f.getUTCMonth() - n); return claveMexico(f).slice(0, 7); };
    poner('Sistema/Finanzas', {
      comerciales: {
        [mes(2)]: { monto: 4500, detalle: 'Ferretería López $2,500; Materiales García $2,000' },
        [mes(1)]: { monto: 7200, detalle: 'Ferretería López $2,500; Materiales García $2,000; Pinturas del Valle $2,700' },
        [mes(0)]: { monto: 8900, detalle: 'Ferretería López $2,500; Materiales García $2,400; Pinturas del Valle $2,700; Cementos Toluca $1,300' },
      },
      costo_verificacion: 0,
      gastos: [
        { concepto: 'Servidores (Cloudflare y Firebase)', monto: 0 },
        { concepto: 'Almacenamiento de fotos (Cloudinary)', monto: 0 },
        { concepto: 'Personal de soporte', monto: 2500 },
        { concepto: 'Promoción de la app', monto: 1200 },
        { concepto: 'Dominio y correo', monto: 150 },
      ],
      gastos_financieros: 80, isr_pct: 30, dividendos_pct: 0, comision_pct: 10, costo_cobro_pct: 3.5,
      es_prueba: true,
    });
  }
};

// ------------------------------------------------------------------------------------------------ EJECUCIÓN
// --exportar archivo.json (CON --simular): GUARDA LOS PERFILES ARMADOS EN UN ARCHIVO PARA COMPARARLOS CON FIREBASE
if (SIMULAR && argumento('--exportar')) {
  await armar();
  const { writeFileSync } = await import('node:fs');
  const perfiles = Object.fromEntries(escrituras.filter(e => /^(Usuarios|Contratistas)\//.test(e.ruta)).map(e => [e.ruta, e.datos]));
  const docs = Object.fromEntries(escrituras.map(e => [e.ruta, e.datos]));
  writeFileSync(argumento('--exportar'), JSON.stringify({ uso_fotos: USO_FOTOS, docs, perfiles, usuarios: Object.fromEntries(todos.map(p => [p.usuario, `${p.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas'}/${p.uid}`])) }));
  process.exit(0);
}

// --lote2: SOLO ESCRIBE LOS 80 USUARIOS DEL LOTE 2 (LOS DEL LOTE 1 YA ESTÁN EN FIREBASE). PASOS:
//   1) node crear-pruebas.mjs --simular --lote2 --ahora FECHA --exportar-pagos pagos.json   (RESUMEN + LISTA DE PAGOS)
//   2) SE GENERAN LAS FOTOS DE LOS COMPROBANTES (UNA POR PAGO, LLAMADA <id del pago>.jpg)
//   3) node crear-pruebas.mjs --lote2 --ahora FECHA --comprobantes carpeta                 (CREA TODO EN FIREBASE)
// LA MISMA --ahora EN LOS PASOS 1 Y 3, PARA QUE LOS DATOS (Y LOS id DE LOS PAGOS) SALGAN IGUALES.
if (process.argv.includes('--lote2')) {
  await armar();
  // LAS PERSONAS DEL LOTE 2 SOLO TIENEN TRATOS ENTRE ELLAS: UN DOCUMENTO ES DEL LOTE 2 SI MENCIONA A UNA DE ELLAS
  const uids = LOTE2.personas.map(p => p.uid);
  const delLote = (texto) => uids.some(u => texto.includes(u));
  const padres = new Set();
  const elegidos = escrituras.filter(e => e.ruta.split('/').length === 2 && (delLote(e.ruta) || delLote(JSON.stringify(e.datos))) && padres.add(e.ruta));
  const hijos = escrituras.filter(e => { const r = e.ruta.split('/'); return r.length > 2 && padres.has(r.slice(0, 2).join('/')); });
  escrituras.splice(0, escrituras.length, ...elegidos, ...hijos);

  const ks = LOTE2.contratos;
  const porColeccion = {};
  for (const e of escrituras) { const c = e.ruta.split('/').length > 2 ? e.ruta.split('/')[2] : e.ruta.split('/')[0]; porColeccion[c] = (porColeccion[c] || 0) + 1; }
  console.log(`\nLOTE 2: ${LOTE2.personas.filter(p => p.rol === 'Trabajador').length} trabajadores y ${LOTE2.personas.filter(p => p.rol === 'Contratista').length} contratistas`);
  console.log(`  ${LOTE2.vacantes.length} vacantes (${LOTE2.vacantes.filter(v => v.sin_cubrir).length} se quedaron sin cubrir)`);
  console.log(`  ${ks.length} contratos: ${ks.filter(k => !k.faltas && !k.reportado && !k.abandono).length} sin problemas, ${ks.filter(k => k.faltas && !k.abandono).length} con faltas, ${ks.filter(k => k.reportado).length} reportados, ${ks.filter(k => k.abandono).length} abandonados`);
  console.log(`  ${LOTE2.pagos.length} pagos con comprobante; documentos a escribir: ${escrituras.length}`, porColeccion);
  if (process.argv.includes("--diagnostico")) { const t = {}; for (const v of LOTE2.vacantes) { const z = v.lugar_texto.split(", ").pop(); t[z] ??= { vac: 0, sin: 0, trab: LOTE2.personas.filter(p => p.rol === "Trabajador" && p.zona.municipio === z).length }; t[z].vac++; if (v.sin_cubrir) t[z].sin++; } console.table(t); }
  if (argumento('--exportar-docs')) { const { writeFileSync } = await import('node:fs'); writeFileSync(argumento('--exportar-docs'), JSON.stringify(Object.fromEntries(escrituras.map(e => [e.ruta, e.datos])))); }
  if (argumento("--exportar-pagos")) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(argumento('--exportar-pagos'), JSON.stringify(LOTE2.pagos.map(({ pago, k }) => ({
      id: pago.id, monto: pago.monto, concepto: pago.concepto, fecha: pago.fecha, timestamp: pago.timestamp, forma: k.v.condiciones.forma_pago,
      de: nombreCompleto(k.c), para: nombreCompleto(k.t), obra: k.v.titulo, ciudad: k.v.lugar_texto.split(', ').pop(),
    }))));
  }
  // --borrar-lote2: BORRA EXACTAMENTE LOS DOCUMENTOS Y CUENTAS QUE CREÓ EL LOTE 2 (MISMA --ahora QUE AL CREARLO)
  if (process.argv.includes('--borrar-lote2') && !SIMULAR) {
    const rutas = escrituras.map(e => e.ruta).sort((a, b) => b.split('/').length - a.split('/').length);
    for (let i = 0; i < rutas.length; i += 400) {
      const lote = db.batch();
      rutas.slice(i, i + 400).forEach(r => lote.delete(db.doc(r)));
      await lote.commit();
    }
    const r = await auth.deleteUsers(LOTE2.personas.map(p => p.uid));
    console.log(`Borrados ${rutas.length} documentos y ${r.successCount} cuentas del lote 2 (${r.failureCount} fallaron).`);
    process.exit(0);
  }
  if (SIMULAR) { await guardarTodo(); process.exit(0); }

  const primera = LOTE2.personas[0];
  if ((await db.doc(`${primera.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas'}/${primera.uid}`).get()).exists) {
    console.error('\nEl lote 2 ya está en Firebase.\n'); process.exit(1);
  }
  const carpeta = argumento('--comprobantes');
  if (!carpeta) { console.error('\nFalta --comprobantes carpeta (las fotos de los comprobantes).\n'); process.exit(1); }
  const { join } = await import('node:path');
  for (const { pago } of LOTE2.pagos) if (!existsSync(join(carpeta, `${pago.id}.jpg`))) { console.error(`Falta el comprobante ${pago.id}.jpg`); process.exit(1); }

  exigirContrasena();
  console.log(`\nCreando ${LOTE2.personas.length} cuentas (contraseña ${CONTRASENA})...`);
  for (const p of LOTE2.personas) await auth.createUser({ uid: p.uid, email: p.correo, password: CONTRASENA, displayName: nombreCompleto(p), emailVerified: true, disabled: false });

  // COMPROBANTES: SE SUBEN A CLOUDINARY IGUAL QUE EN LA APP: CON LA SESIÓN DEL CONTRATISTA Y LA FIRMA DE NUESTRO SERVIDOR
  // (QUEDAN EN palantemx/publico/<uid del contratista>)
  const URL_API = readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(/EXPO_PUBLIC_KYC_API_URL=(\S+)/)[1];
  const LLAVE_WEB = readFileSync(new URL('../../firebaseConfig.js', import.meta.url), 'utf8').match(/apiKey:\s*"([^"]+)"/)[1];
  const sesiones = {};
  const sesion = async (uid) => {
    if (sesiones[uid]) return sesiones[uid];
    const token = await auth.createCustomToken(uid);
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${LLAVE_WEB}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) });
    const j = await r.json();
    if (!j.idToken) throw new Error('No se pudo abrir la sesión de prueba: ' + JSON.stringify(j));
    return (sesiones[uid] = j.idToken);
  };
  const urls = {};
  let n = 0;
  for (const { pago, k } of LOTE2.pagos) {
    const idToken = await sesion(k.c.uid);
    const firma = await (await fetch(`${URL_API}/firma-subida`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ tipo: 'publica' }) })).json();
    if (!firma.signature) throw new Error('El servidor no dio la firma: ' + JSON.stringify(firma));
    const form = new FormData();
    form.append('file', new Blob([readFileSync(join(carpeta, `${pago.id}.jpg`))], { type: 'image/jpeg' }), `comprobante_${pago.id}.jpg`);
    for (const campo of ['api_key', 'timestamp', 'signature', 'folder', 'type']) if (firma[campo] !== undefined) form.append(campo, String(firma[campo]));
    const subida = await (await fetch(`https://api.cloudinary.com/v1_1/${firma.cloud_name}/image/upload`, { method: 'POST', body: form })).json();
    if (!subida.secure_url) throw new Error('Cloudinary no aceptó el comprobante: ' + JSON.stringify(subida));
    urls[pago.id] = subida.secure_url;
    if (++n % 20 === 0) console.log(`  ${n}/${LOTE2.pagos.length} comprobantes subidos`);
  }
  for (const e of escrituras) if (Array.isArray(e.datos.pagos)) e.datos.pagos = e.datos.pagos.map(p => (typeof p.comprobante === 'string' && p.comprobante.startsWith('lote2:')) ? { ...p, comprobante: urls[p.id] } : p);
  if (escrituras.some(e => JSON.stringify(e.datos).includes('"lote2:'))) { console.error('Quedó un comprobante sin subir.'); process.exit(1); }

  console.log('Escribiendo en Firestore...');
  await guardarTodo();
  console.log('\nListo: lote 2 creado.\n');
  process.exit(0);
}

// --restaurar usuario --ahora FECHA: VUELVE A CREAR LA CUENTA Y EL PERFIL DE UNA PERSONA DE PRUEBA QUE SE BORRÓ,
// IGUAL QUE COMO ESTABA (MISMO uid), PARA QUE SUS CONTRATOS, CHATS Y BITÁCORAS VUELVAN A QUEDAR LIGADOS.
if (argumento('--restaurar')) {
  await armar();
  const p = todos.find(x => x.usuario === argumento('--restaurar'));
  if (!p) { console.error('No existe ese usuario en los datos de prueba.'); process.exit(1); }
  const ruta = `${p.rol === 'Trabajador' ? 'Usuarios' : 'Contratistas'}/${p.uid}`;
  const perfil = escrituras.find(e => e.ruta === ruta);
  exigirContrasena();
  await auth.createUser({ uid: p.uid, email: p.correo, password: CONTRASENA, displayName: nombreCompleto(p), emailVerified: true, disabled: false });
  await db.doc(ruta).set(perfil.datos);
  console.log(`\nRestaurado: ${p.usuario} (${nombreCompleto(p)}), contraseña ${CONTRASENA}\n`);
  process.exit(0);
}

const yaHay = await db.collection('Usuarios').where('es_prueba', '==', true).limit(1).get();
if (!yaHay.empty) {
  console.error('\nYa hay datos de prueba en Firebase. Bórralos primero con:  npm run borrar\n');
  process.exit(1);
}

exigirContrasena();
console.log(`\nCreando ${todos.length} cuentas en Firebase Authentication (contraseña de todas: ${CONTRASENA})...`);
for (const p of todos) {
  await auth.createUser({ uid: p.uid, email: p.correo, password: CONTRASENA, displayName: nombreCompleto(p), emailVerified: true, disabled: false });
}
console.log('Armando perfiles, vacantes, contratos, bitácoras, pagos, chats, reseñas, reportes y notificaciones...');
await armar();
await guardarTodo();

const cuenta = (e) => contratos.filter(k => k.escenario === e).length;
console.log(`
Listo. Se crearon:
  ${trabajadores.length} trabajadores y ${contratistas.length} contratistas (correos @palantemx.test, contraseña ${CONTRASENA})
  ${vacantes.length} vacantes
  ${contratos.length} contratos: ${cuenta('finalizada')} terminados, ${cuenta('activa')} en curso, ${cuenta('por_confirmar')} por confirmar fin,
     ${cuenta('suspendida_tardia') + cuenta('revision_cierre')} suspendidos, ${cuenta('cancelada_a_tiempo')} cancelado, ${cuenta('pendiente')} solicitudes, ${cuenta('propuesta') + cuenta('propuesta_sin_respuesta')} propuestas, ${cuenta('rechazada')} rechazados
  ${contratos.reduce((s, k) => s + k.bitacora.length, 0)} días de bitácora y ${contratos.reduce((s, k) => s + k.pagos.length, 0)} pagos
  ${chats.size} chats, ${resenasDocs.length} reseñas, ${quejas.length} reportes y ${notificaciones.length} notificaciones

Cuentas para entrar a probar (usuario / contraseña ${CONTRASENA}):`);
const muestra = [
  ...contratos.filter(k => k.escenario === 'activa').slice(0, 2).flatMap(k => [k.t, k.c]),
  contratos.find(k => k.escenario === 'suspendida_tardia')?.c,
  contratos.find(k => k.escenario === 'revision_cierre')?.t,
  contratos.find(k => k.escenario === 'por_confirmar')?.t,
].filter(Boolean);
for (const p of [...new Set(muestra)]) console.log(`  ${p.rol.padEnd(12)} ${p.usuario.padEnd(18)} ${nombreCompleto(p)}`);
console.log('');
process.exit(0);
