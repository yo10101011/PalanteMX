// OFICIOS INFORMALES QUE SE PUEDEN ELEGIR EN TODA LA APP (REGISTRO, PERFIL, VACANTES, FILTROS).
// SI NO ESTÁ EN LA LISTA, LA PERSONA ELIGE "OTRO" Y LO ESCRIBE (SE GUARDA LO QUE ESCRIBIÓ).
export const OFICIOS = [
  'Albañil', 'Ayudante general', 'Plomero', 'Electricista', 'Carpintero', 'Pintor', 'Herrero', 'Soldador',
  'Yesero', 'Azulejero', 'Tablaroquero', 'Impermeabilizador', 'Vidriero', 'Cerrajero', 'Jardinero', 'Fumigador',
  'Técnico en refrigeración y aire acondicionado', 'Técnico en electrodomésticos', 'Mecánico', 'Hojalatero y pintor de autos',
  'Tapicero', 'Pulidor de pisos', 'Limpieza del hogar', 'Lavandería y planchado', 'Niñera', 'Cuidador de adultos mayores',
  'Cocinero', 'Mesero', 'Panadero', 'Taquero', 'Chofer', 'Repartidor', 'Cargador y mudanzas', 'Peón', 'Costurera',
  'Zapatero', 'Bolero', 'Estilista / Peluquero', 'Maquillista', 'Lavacoches', 'Rotulista', 'Recolector / Chatarrero',
  'Vendedor ambulante', 'Paseador de perros',
];

export const OTRO_OFICIO = 'Otro';

// ¿ES UN OFICIO DE LA LISTA, O UNO ESCRITO A MANO?
export const esOficioDeLista = (oficio?: string) => !!oficio && OFICIOS.includes(oficio);

// ¿EL OFICIO DEL TRABAJADOR ES EL QUE PIDE LA OBRA? SI FALTA ALGUNO DE LOS DOS, NO SE AVISA NADA.
// NO PROHÍBE NADA: SOLO SIRVE PARA MOSTRAR UN AVISO Y QUE LO PLATIQUEN EN EL CHAT.
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const oficioCoincide = (oficioTrabajador?: string, oficioObra?: string) => {
  if (!oficioTrabajador || !oficioObra || oficioObra === 'Todos') return true;
  const t = normalizar(oficioTrabajador), o = normalizar(oficioObra);
  return t === o || t.includes(o) || o.includes(t);
};

export const avisoOficio = (oficioTrabajador: string, oficioObra: string) =>
  `El oficio del trabajador es "${oficioTrabajador}" y esta obra busca "${oficioObra}". Pueden seguir, pero platiquen en el chat si sí puede hacer el trabajo antes de aceptar el trato.`;
