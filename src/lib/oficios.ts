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
