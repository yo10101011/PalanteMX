// CALENDARIO DE PAGOS DE UNA OBRA: QUÉ PAGOS TOCAN Y CUÁLES YA ESTÁN CUBIERTOS. SIGUE CADA CUÁNTO SE ACORDÓ PAGAR:
//   POR DÍA     -> UN PAGO POR CADA DÍA TRABAJADO EN LA BITÁCORA (LOS DÍAS DESCONTADOS POR EL ADMIN NO CUENTAN)
//   POR SEMANA  -> UN PAGO POR CADA SEMANA; TOCA AL CUMPLIRSE LA SEMANA (O AL TERMINAR LA OBRA)
//   POR OBRA    -> UN PAGO AL TERMINAR (O LA MITAD AL INICIO Y LA MITAD AL FINAL, SI ASÍ SE ACORDÓ)
// MÁS LOS PAGOS EXTRA QUE ORDENÓ EL ADMIN. LOS DESCUENTOS DEL ADMIN SE RESTAN DEL TOTAL.
// EL SERVIDOR HACE LA MISMA CUENTA (deudaHastaHoy) PARA MANDAR EL RECORDATORIO "YA TE TOCA PAGAR".
import { ajustesDePago, ESTADO_PAGO, ESTADOS, REVISION } from '@/lib/contratos';

export type EstadoPeriodo = 'cubierto' | 'por_confirmar' | 'toca_pagar' | 'proximo';
export type Periodo = { etiqueta: string; monto: number; tocaPagar: boolean; estado: EstadoPeriodo };

const DIA_MS = 24 * 60 * 60 * 1000;
const fecha = (ms: number) => new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

// MONTO Y PERIODO DEL CONTRATO (LOS CONTRATOS VIEJOS SOLO TRAEN EL TEXTO "$3,000 por semana")
export const condicionesDePago = (contrato: any) => {
  const texto = String(contrato?.vacante?.pago || '').toLowerCase();
  const monto = contrato?.vacante?.pago_monto || Number(texto.replace(/[^0-9]/g, '')) || 0;
  const periodo = contrato?.vacante?.pago_periodo || (texto.includes('día') || texto.includes('dia') ? 'por día' : texto.includes('semana') ? 'por semana' : 'por obra');
  return { monto, periodo: periodo as string };
};

export const calcularPlanDePagos = (contrato: any, bitacora: any[]) => {
  const { monto, periodo } = condicionesDePago(contrato);
  const inicio = contrato?.timestamp_inicio || 0;
  const terminada = [ESTADOS.FINALIZADA, ESTADOS.POR_CONFIRMAR_FIN].includes(contrato?.estado);
  const fin = contrato?.timestamp_fin || Date.now();
  const periodos: Omit<Periodo, 'estado'>[] = [];

  if (monto > 0 && inicio) {
    if (periodo === 'por día') {
      bitacora.filter(d => d.asistio && d.revision !== REVISION.DESCONTADA)
        .forEach(d => periodos.push({ etiqueta: `Día ${d.fecha}`, monto, tocaPagar: true }));
    } else if (periodo === 'por semana') {
      for (let k = 0; inicio + k * 7 * DIA_MS <= fin; k++) {
        const desde = inicio + k * 7 * DIA_MS;
        const hasta = desde + 6 * DIA_MS;
        periodos.push({ etiqueta: `Semana ${k + 1} (${fecha(desde)} al ${fecha(hasta)})`, monto, tocaPagar: Date.now() >= desde + 7 * DIA_MS || terminada });
      }
    } else if (contrato?.vacante?.condiciones?.cuando_pago === 'Mitad al inicio y mitad al final') {
      periodos.push({ etiqueta: 'Mitad al inicio', monto: monto / 2, tocaPagar: true });
      periodos.push({ etiqueta: 'Mitad al terminar', monto: monto / 2, tocaPagar: terminada });
    } else {
      periodos.push({ etiqueta: 'Pago de la obra completa (al terminar)', monto, tocaPagar: terminada });
    }
  }
  ajustesDePago(contrato).filter(a => a.tipo === 'extra')
    .forEach(a => periodos.push({ etiqueta: `Extra ordenado por el admin (${a.motivo})`, monto: a.monto, tocaPagar: true }));

  // SE VAN "LLENANDO" LOS PERIODOS EN ORDEN CON LO QUE YA SE PAGÓ: PRIMERO LO CONFIRMADO, LUEGO LO QUE FALTA CONFIRMAR
  const pagos = contrato?.pagos || [];
  const confirmado = pagos.filter((p: any) => p.estado === ESTADO_PAGO.RECIBIDO).reduce((s: number, p: any) => s + p.monto, 0);
  const porConfirmar = pagos.filter((p: any) => p.estado === ESTADO_PAGO.POR_CONFIRMAR).reduce((s: number, p: any) => s + p.monto, 0);
  const descuentos = ajustesDePago(contrato).filter(a => a.tipo === 'descuento').reduce((s, a) => s + a.monto, 0);
  let acumulado = descuentos; // LO DESCONTADO YA NO SE TIENE QUE PAGAR
  const plan: Periodo[] = periodos.map(p => {
    acumulado += p.monto;
    const estado: EstadoPeriodo = acumulado <= confirmado ? 'cubierto' : acumulado <= confirmado + porConfirmar ? 'por_confirmar' : p.tocaPagar ? 'toca_pagar' : 'proximo';
    return { ...p, estado };
  });

  const debidoHoy = periodos.filter(p => p.tocaPagar).reduce((s, p) => s + p.monto, 0) - descuentos;
  return {
    monto, periodo, plan, confirmado, porConfirmar, descuentos,
    pendienteHoy: Math.max(0, debidoHoy - confirmado - porConfirmar), // LO QUE YA TOCA PAGAR Y NI SIQUIERA SE HA REGISTRADO
    siguiente: plan.find(p => p.estado === 'toca_pagar'),
  };
};

export const ESTILO_PERIODO: Record<EstadoPeriodo, { texto: string; color: string }> = {
  cubierto: { texto: 'PAGADO', color: '#059669' },
  por_confirmar: { texto: 'FALTA QUE EL TRABAJADOR CONFIRME', color: '#F59E0B' },
  toca_pagar: { texto: 'YA TOCA PAGAR', color: '#DC2626' },
  proximo: { texto: 'TODAVÍA NO TOCA', color: '#9CA3AF' },
};
