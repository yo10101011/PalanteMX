// LA OBRA DEL PORTAFOLIO DEL TRABAJADOR QUE CORRESPONDE A UNA VACANTE (DONDE VIVE SU BITÁCORA DIARIA).
// SE BUSCA POR EL ID DE LA VACANTE, QUE ES ÚNICO. LAS OBRAS VIEJAS NO TIENEN ESE ID: PARA ELLAS SE USA EL TÍTULO EXACTO.
// (ANTES TAMBIÉN SE TOMABA "CUALQUIER OBRA EN PROCESO", Y SE MOSTRABA LA BITÁCORA DE OTRA OBRA)
export const buscarObraDeVacante = (portafolio: any[] | undefined, idVacante: string | undefined, tituloVacante: string | undefined) => {
  const obras = (portafolio || []).filter(o => o && typeof o === 'object');
  return obras.find(o => idVacante && o.id_vacante === idVacante)
    || obras.find(o => !o.id_vacante && tituloVacante && o.titulo === tituloVacante);
};
