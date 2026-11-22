// REPORTE FINANCIERO DEL PANEL DEL ADMIN (ESTADO DE RESULTADOS DE PALANTEMX).
//
// PALANTEMX SOLO GANA DINERO CON COMERCIALES (PUBLICIDAD DENTRO DE LA APP). EL DINERO DE LAS OBRAS LO PAGA EL
// CONTRATISTA AL TRABAJADOR POR FUERA DE LA APP Y PALANTEMX NO SE QUEDA CON NADA; EN LA APP SOLO QUEDA REGISTRADO
// CADA PAGO (CON SU COMPROBANTE) EN EL CAMPO pagos DE CADA CONTRATO. POR ESO EL REPORTE TIENE TRES PARTES:
//   1. ESTADO DE RESULTADOS: VENTAS = INGRESOS POR COMERCIALES QUE EL ADMIN PRINCIPAL REGISTRA CADA MES.
//   2. DINERO DE LOS USUARIOS: CUÁNTO SE MOVIÓ ENTRE CONTRATISTAS Y TRABAJADORES (NO ES DE PALANTEMX).
//   3. IMPLEMENTACIONES A FUTURO: CUÁNTO SE GANARÍA SI ALGÚN DÍA SE COBRARA UNA COMISIÓN POR PAGO. ES SOLO UNA
//      PROYECCIÓN: NO SE SUMA A NINGÚN NÚMERO REAL.
// TODO SE CONFIGURA EN Sistema/Finanzas (SOLO EL ADMIN PRINCIPAL LO CAMBIA; LAS REGLAS LO EXIGEN).
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMargenModal } from '@/lib/margen-modal';

import { db } from '../../firebaseConfig';
import { BarrasHorizontales, Indicador } from '@/components/graficas';
import { ESTADO_PAGO } from '@/lib/contratos';

type Gasto = { concepto: string; monto: number };
type Comercial = { monto: number; detalle?: string };
type ConfigFinanzas = {
  comerciales: Record<string, Comercial>; // INGRESOS POR COMERCIALES DE CADA MES ('AAAA-MM' -> PESOS Y ANUNCIANTES)
  costo_verificacion: number;  // PESOS POR CADA USUARIO NUEVO VERIFICADO CON INE (OCR + ROSTRO). HOY EN PLAN GRATIS: 0
  gastos: Gasto[];             // GASTOS DE OPERACIÓN FIJOS, EN PESOS AL MES
  gastos_financieros: number;  // INTERESES Y COMISIONES BANCARIAS, EN PESOS AL MES
  isr_pct: number;             // ISR DE PERSONAS MORALES EN MÉXICO: 30 %
  dividendos_pct: number;      // % DE LA UTILIDAD NETA QUE SE REPARTE A LOS SOCIOS
  // IMPLEMENTACIONES A FUTURO (SOLO PROYECCIÓN)
  comision_pct: number;        // % QUE SE COBRARÍA SOBRE CADA PAGO CONFIRMADO
  costo_cobro_pct: number;     // % QUE COBRARÍA EL PROCESADOR DE PAGOS (P. EJ. MERCADO PAGO)
};

const CONFIG_INICIAL: ConfigFinanzas = {
  comerciales: {},
  costo_verificacion: 0,
  gastos: [
    { concepto: 'Servidores (Cloudflare y Firebase)', monto: 0 },
    { concepto: 'Almacenamiento de fotos (Cloudinary)', monto: 0 },
    { concepto: 'Personal de soporte', monto: 0 },
    { concepto: 'Promoción de la app', monto: 0 },
  ],
  gastos_financieros: 0,
  isr_pct: 30,
  dividendos_pct: 0,
  comision_pct: 10,
  costo_cobro_pct: 3.5,
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pesos = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-MX')}`;
const porcentaje = (parte: number, total: number) => total ? `${((parte / total) * 100).toFixed(1)}%` : '—';
const claveMes = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
const numeroDe = (t: string) => Number(t.replace(/[^0-9.]/g, '')) || 0;

// LAS FECHAS LLEGAN COMO MILISEGUNDOS, TIMESTAMP DE FIRESTORE, TEXTO ISO O TEXTO "DD/MM/AAAA" (es-MX)
const aFecha = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v === 'string') {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  const f = new Date(v);
  return isNaN(f.getTime()) ? null : f;
};

type Periodo = { tipo: 'mes' | 'anio' | 'todo'; anio: number; mes: number };

type Props = { trabajadores: any[]; contratistas: any[]; contratos: any[]; esPrincipal: boolean };

export function ReporteFinanciero({ trabajadores, contratistas, contratos, esPrincipal }: Props) {
  const margenModal = useMargenModal();
  const hoy = new Date();
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [config, setConfig] = useState<ConfigFinanzas>(CONFIG_INICIAL);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [editando, setEditando] = useState<ConfigFinanzas | null>(null);
  const [comercialMes, setComercialMes] = useState<{ clave: string; monto: string; detalle: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'Sistema', 'Finanzas'))
      // es_prueba LO PONE EL SCRIPT DE DATOS DE PRUEBA: SE QUITA PARA QUE, SI EL ADMIN LO EDITA, YA CUENTE COMO REAL
      .then(snap => { if (snap.exists()) { const { es_prueba, ...datos } = snap.data(); setConfig({ ...CONFIG_INICIAL, ...(datos as Partial<ConfigFinanzas>) }); } })
      .catch(error => console.log('Error cargando la configuración de finanzas:', error))
      .finally(() => setCargandoConfig(false));
  }, []);

  // ---------------------------------------------------------------- RANGO DEL PERIODO
  const todosLosPagos = contratos.flatMap(c => (c.pagos || []).map((p: any) => ({ ...p, contrato: c, fechaPago: aFecha(p.timestamp) || aFecha(p.fecha) })));
  // "TODO" EMPIEZA EN EL PRIMER MES CON ALGÚN PAGO O INGRESO POR COMERCIALES
  const fechasInicio = [
    ...todosLosPagos.map(p => p.fechaPago).filter(Boolean) as Date[],
    ...Object.keys(config.comerciales || {}).map(k => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1)),
  ];
  const primeraFecha = fechasInicio.length ? new Date(Math.min(...fechasInicio.map(f => f.getTime()))) : hoy;
  const desde = periodo.tipo === 'mes' ? new Date(periodo.anio, periodo.mes, 1)
    : periodo.tipo === 'anio' ? new Date(periodo.anio, 0, 1)
    : new Date(primeraFecha.getFullYear(), primeraFecha.getMonth(), 1);
  const hasta = periodo.tipo === 'mes' ? new Date(periodo.anio, periodo.mes + 1, 1)
    : periodo.tipo === 'anio' ? new Date(periodo.anio + 1, 0, 1)
    : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  // LOS GASTOS FIJOS SON MENSUALES: SE MULTIPLICAN POR LOS MESES DEL PERIODO QUE YA EMPEZARON (UN AÑO EN CURSO NO CUENTA 12)
  const finReal = hasta > hoy ? new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1) : hasta;
  const meses = Math.max(1, (finReal.getFullYear() - desde.getFullYear()) * 12 + finReal.getMonth() - desde.getMonth());
  const clavesMeses = Array.from({ length: meses }, (_, i) => claveMes(new Date(desde.getFullYear(), desde.getMonth() + i, 1)));
  const enPeriodo = (f: Date | null) => !!f && f >= desde && f < hasta;
  const nombrePeriodo = periodo.tipo === 'mes' ? `${MESES[periodo.mes]} ${periodo.anio}` : periodo.tipo === 'anio' ? `Año ${periodo.anio}` : 'Desde el inicio';

  const mover = (paso: number) => setPeriodo(p => {
    if (p.tipo === 'anio') return { ...p, anio: p.anio + paso };
    const fecha = new Date(p.anio, p.mes + paso, 1);
    return { ...p, anio: fecha.getFullYear(), mes: fecha.getMonth() };
  });
  const esFuturo = periodo.tipo === 'mes' ? new Date(periodo.anio, periodo.mes + 1, 1) > hoy : periodo.anio >= hoy.getFullYear();

  // ---------------------------------------------------------------- DINERO DE LOS USUARIOS
  const pagos = todosLosPagos.filter(p => enPeriodo(p.fechaPago));
  const suma = (lista: any[]) => lista.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const confirmados = pagos.filter(p => p.estado === ESTADO_PAGO.RECIBIDO);
  const porConfirmar = pagos.filter(p => p.estado === ESTADO_PAGO.POR_CONFIRMAR);
  const noRecibidos = pagos.filter(p => p.estado === ESTADO_PAGO.NO_RECIBIDO);
  const montoConfirmado = suma(confirmados);
  const montoPorConfirmar = suma(porConfirmar);
  const obrasConPago = new Set(confirmados.map(p => p.contrato.id)).size;
  const ajustes = contratos.flatMap(c => c.ajustes_pago || []).filter((a: any) => enPeriodo(aFecha(a.fecha)));
  const ajustesDe = (tipo: string) => suma(ajustes.filter((a: any) => a.tipo === tipo));

  // ---------------------------------------------------------------- ESTADO DE RESULTADOS (SOLO COMERCIALES)
  const comercialesDelPeriodo = clavesMeses.map(k => ({ clave: k, ...(config.comerciales?.[k] || { monto: 0 }) })).filter(c => c.monto > 0);
  const ventas = comercialesDelPeriodo.reduce((s, c) => s + c.monto, 0);
  const usuariosNuevos = [...trabajadores, ...contratistas].filter(u => enPeriodo(aFecha(u.fecha_registro))).length;
  const costoVentas = usuariosNuevos * config.costo_verificacion;
  const utilidadBruta = ventas - costoVentas;
  const gastosOperacion = config.gastos.map(g => ({ ...g, total: (Number(g.monto) || 0) * meses }));
  const totalGastos = gastosOperacion.reduce((s, g) => s + g.total, 0);
  const utilidadOperacion = utilidadBruta - totalGastos;
  const gastosFinancieros = config.gastos_financieros * meses;
  const utilidadAntesImpuestos = utilidadOperacion - gastosFinancieros;
  // SOLO SE PAGA ISR SI HUBO GANANCIA; SOLO SE REPARTEN DIVIDENDOS SI QUEDÓ UTILIDAD
  const impuestos = Math.max(utilidadAntesImpuestos, 0) * config.isr_pct / 100;
  const utilidadNeta = utilidadAntesImpuestos - impuestos;
  const dividendos = Math.max(utilidadNeta, 0) * config.dividendos_pct / 100;
  const utilidadesRetenidas = utilidadNeta - dividendos;

  // ---------------------------------------------------------------- IMPLEMENTACIÓN A FUTURO: COMISIÓN POR PAGO
  const comisionFutura = montoConfirmado * config.comision_pct / 100;
  const costoCobroFuturo = montoConfirmado * config.costo_cobro_pct / 100;
  const porOficio: Record<string, number> = {};
  confirmados.forEach(p => {
    const oficio = p.contrato.vacante?.oficio || 'Sin oficio';
    porOficio[oficio] = (porOficio[oficio] || 0) + (Number(p.monto) || 0) * config.comision_pct / 100;
  });
  const filasOficio = Object.entries(porOficio).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([etiqueta, v]) => ({ etiqueta, valores: [Math.round(v)] }));

  // RENGLONES DEL ESTADO DE RESULTADOS (TAMBIÉN SE USAN PARA COMPARTIR EL REPORTE COMO TEXTO)
  type Renglon = { texto: string; monto: number; tipo: 'resta' | 'total' | 'detalle' | 'final'; sangria?: boolean };
  const renglones: Renglon[] = [
    { texto: 'Ventas (ingresos por comerciales)', monto: ventas, tipo: 'detalle' },
    ...(periodo.tipo !== 'mes' ? comercialesDelPeriodo.map(c => ({ texto: `${MESES[Number(c.clave.slice(5, 7)) - 1]} ${c.clave.slice(0, 4)}`, monto: c.monto, tipo: 'detalle' as const, sangria: true })) : []),
    { texto: `(-) Costo de ventas (verificación de ${usuariosNuevos} usuario(s) nuevo(s))`, monto: costoVentas, tipo: 'resta' },
    { texto: 'Utilidad bruta', monto: utilidadBruta, tipo: 'total' },
    { texto: `(-) Gastos de operación (${meses} mes${meses === 1 ? '' : 'es'})`, monto: totalGastos, tipo: 'resta' },
    ...gastosOperacion.filter(g => g.total).map(g => ({ texto: g.concepto, monto: g.total, tipo: 'detalle' as const, sangria: true })),
    { texto: 'Utilidad de operación', monto: utilidadOperacion, tipo: 'total' },
    { texto: '(-) Gastos financieros', monto: gastosFinancieros, tipo: 'resta' },
    { texto: 'Utilidad antes de impuestos', monto: utilidadAntesImpuestos, tipo: 'total' },
    { texto: `(-) Impuestos (ISR ${config.isr_pct}%)`, monto: impuestos, tipo: 'resta' },
    { texto: 'Utilidad neta', monto: utilidadNeta, tipo: 'total' },
    { texto: `(-) Pago de dividendos (${config.dividendos_pct}%)`, monto: dividendos, tipo: 'resta' },
    { texto: 'Utilidades retenidas', monto: utilidadesRetenidas, tipo: 'final' },
  ];

  const compartir = () => {
    const lineas = [
      'PALANTEMX - REPORTE FINANCIERO',
      `Periodo: ${nombrePeriodo}`,
      `Generado: ${hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      'PalanteMX obtiene sus ingresos únicamente de comerciales (publicidad dentro de la app).',
      '',
      'ESTADO DE RESULTADOS',
      ...renglones.map(r => `${r.sangria ? '    ' : ''}${r.texto}: ${r.tipo === 'resta' ? `(${pesos(r.monto)})` : pesos(r.monto)}`),
      '',
      `Margen bruto: ${porcentaje(utilidadBruta, ventas)} | Margen de operación: ${porcentaje(utilidadOperacion, ventas)} | Margen neto: ${porcentaje(utilidadNeta, ventas)}`,
      ...comercialesDelPeriodo.filter(c => c.detalle).map(c => `Anunciantes ${c.clave}: ${c.detalle}`),
      '',
      'DINERO DE LOS USUARIOS (PAGOS ENTRE CONTRATISTAS Y TRABAJADORES; NO ES DE PALANTEMX)',
      `Pagos confirmados: ${pesos(montoConfirmado)} (${confirmados.length} pagos, ${obrasConPago} obras)`,
      `Pagos por confirmar: ${pesos(montoPorConfirmar)} (${porConfirmar.length})`,
      `Pagos marcados como no recibidos: ${pesos(suma(noRecibidos))} (${noRecibidos.length})`,
      `Pagos extra ordenados por el administrador: ${pesos(ajustesDe('extra'))}`,
      `Descuentos ordenados por el administrador: ${pesos(ajustesDe('descuento'))}`,
      `Devoluciones ordenadas por el administrador: ${pesos(ajustesDe('devolucion'))}`,
      '',
      'IMPLEMENTACIONES A FUTURO (PROYECCIÓN, NO SE COBRA HOY)',
      `Si PalanteMX cobrara ${config.comision_pct}% de comisión sobre los pagos confirmados, en este periodo habría obtenido ${pesos(comisionFutura)}, menos ${pesos(costoCobroFuturo)} de costo de cobro (${config.costo_cobro_pct}%) = ${pesos(comisionFutura - costoCobroFuturo)}.`,
    ];
    Share.share({ title: `Reporte financiero ${nombrePeriodo}`, message: lineas.join('\n') }).catch(() => {});
  };

  const guardarConfig = async () => {
    if (!editando) return;
    const limpio: ConfigFinanzas = {
      ...editando,
      gastos: editando.gastos.filter(g => g.concepto.trim()).map(g => ({ concepto: g.concepto.trim(), monto: Math.max(0, Number(g.monto) || 0) })),
    };
    if ([limpio.comision_pct, limpio.costo_cobro_pct, limpio.isr_pct, limpio.dividendos_pct].some(n => n < 0 || n > 100)) {
      Alert.alert('Revisa los porcentajes', 'Los porcentajes deben estar entre 0 y 100.');
      return;
    }
    setGuardando(true);
    try {
      await setDoc(doc(db, 'Sistema', 'Finanzas'), limpio);
      setConfig(limpio);
      setEditando(null);
    } catch (error: any) {
      Alert.alert('No se pudo guardar', error?.message || 'Intenta de nuevo.');
    }
    setGuardando(false);
  };

  const guardarComercial = async () => {
    if (!comercialMes) return;
    const monto = numeroDe(comercialMes.monto);
    const comerciales = { ...(config.comerciales || {}), [comercialMes.clave]: { monto, detalle: comercialMes.detalle.trim() } };
    setGuardando(true);
    try {
      await setDoc(doc(db, 'Sistema', 'Finanzas'), { ...config, comerciales });
      setConfig({ ...config, comerciales });
      setComercialMes(null);
    } catch (error: any) {
      Alert.alert('No se pudo guardar', error?.message || 'Intenta de nuevo.');
    }
    setGuardando(false);
  };

  // CAMPO NUMÉRICO DE LA VENTANA DE CONFIGURACIÓN
  const campoNumero = (etiqueta: string, ayuda: string, valor: number, cambiar: (n: number) => void) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.etiquetaCampo}>{etiqueta}</Text>
      <Text style={styles.ayuda}>{ayuda}</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={String(valor)} onChangeText={t => cambiar(numeroDe(t))} />
    </View>
  );

  if (cargandoConfig) return <ActivityIndicator size="large" color="#0D2340" style={{ marginTop: 30 }} />;

  const claveDelMes = claveMes(new Date(periodo.anio, periodo.mes, 1));
  const comercialDelMes = config.comerciales?.[claveDelMes];

  return (
    <View>
      {/* PERIODO */}
      <View style={styles.selector}>
        {([['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Todo']] as const).map(([tipo, texto]) => (
          <TouchableOpacity key={tipo} style={[styles.selectorBoton, periodo.tipo === tipo && styles.selectorActivo]} onPress={() => setPeriodo(p => ({ ...p, tipo }))}>
            <Text style={[styles.selectorTexto, periodo.tipo === tipo && { color: '#FFF' }]}>{texto}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.navegador}>
        {periodo.tipo !== 'todo' ? (
          <TouchableOpacity onPress={() => mover(-1)} style={styles.flecha}><Ionicons name="chevron-back" size={22} color="#0D2340" /></TouchableOpacity>
        ) : <View style={styles.flecha} />}
        <Text style={styles.nombrePeriodo}>{nombrePeriodo}</Text>
        {periodo.tipo !== 'todo' && !esFuturo ? (
          <TouchableOpacity onPress={() => mover(1)} style={styles.flecha}><Ionicons name="chevron-forward" size={22} color="#0D2340" /></TouchableOpacity>
        ) : <View style={styles.flecha} />}
      </View>

      <View style={styles.indicadores}>
        <Indicador valor={pesos(ventas)} etiqueta="Ventas" detalle="Ingresos por comerciales" />
        <Indicador valor={pesos(utilidadNeta)} etiqueta="Utilidad neta" detalle={`Margen neto ${porcentaje(utilidadNeta, ventas)}`} />
        <Indicador valor={pesos(totalGastos + gastosFinancieros + costoVentas)} etiqueta="Costos y gastos" detalle={`${meses} mes${meses === 1 ? '' : 'es'}`} />
        <Indicador valor={pesos(montoConfirmado)} etiqueta="Dinero de los usuarios" detalle={`${obrasConPago} obra(s) con pago confirmado`} />
      </View>

      {/* INGRESOS POR COMERCIALES DEL MES (LOS REGISTRA EL ADMIN PRINCIPAL) */}
      {periodo.tipo === 'mes' && (
        <View style={styles.tabla}>
          <Text style={styles.tablaTitulo}>Ingresos por comerciales de {MESES[periodo.mes].toLowerCase()}</Text>
          <Text style={styles.montoGrande}>{pesos(comercialDelMes?.monto || 0)}</Text>
          {!!comercialDelMes?.detalle && <Text style={styles.explicacion}>Anunciantes: {comercialDelMes.detalle}</Text>}
          {esPrincipal ? (
            <TouchableOpacity style={[styles.boton, styles.botonSecundario, { marginTop: 6 }]}
              onPress={() => setComercialMes({ clave: claveDelMes, monto: comercialDelMes?.monto ? String(comercialDelMes.monto) : '', detalle: comercialDelMes?.detalle || '' })}>
              <Ionicons name="megaphone-outline" size={18} color="#0D2340" />
              <Text style={[styles.botonTexto, { color: '#0D2340' }]}>{comercialDelMes ? 'Corregir ingresos del mes' : 'Registrar ingresos del mes'}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.ayuda}>Solo el administrador principal registra los ingresos por comerciales.</Text>
          )}
        </View>
      )}

      {/* ESTADO DE RESULTADOS */}
      <Text style={styles.seccion}>Estado de resultados</Text>
      <View style={styles.tabla}>
        <Text style={styles.tablaTitulo}>PalanteMX · {nombrePeriodo}</Text>
        {renglones.map((r, i) => {
          const esTotal = r.tipo === 'total' || r.tipo === 'final';
          return (
            <View key={i} style={[styles.renglon, esTotal && styles.renglonTotal, r.tipo === 'final' && styles.renglonFinal]}>
              <Text style={[styles.renglonTexto, r.sangria && styles.renglonDetalle, esTotal && styles.textoTotal, r.tipo === 'final' && { color: '#FFF' }]}>{r.texto}</Text>
              <Text style={[styles.renglonMonto, r.tipo === 'resta' && { color: '#B91C1C' }, esTotal && styles.textoTotal, r.monto < 0 && { color: '#B91C1C' }, r.tipo === 'final' && { color: r.monto < 0 ? '#FCA5A5' : '#FFF' }]}>
                {r.tipo === 'resta' ? `(${pesos(r.monto)})` : pesos(r.monto)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.margenes}>
        <Text style={styles.margen}>Margen bruto <Text style={styles.margenValor}>{porcentaje(utilidadBruta, ventas)}</Text></Text>
        <Text style={styles.margen}>Margen de operación <Text style={styles.margenValor}>{porcentaje(utilidadOperacion, ventas)}</Text></Text>
        <Text style={styles.margen}>Margen neto <Text style={styles.margenValor}>{porcentaje(utilidadNeta, ventas)}</Text></Text>
      </View>
      <Text style={styles.nota}>PalanteMX obtiene sus ingresos únicamente de comerciales. Los gastos fijos son mensuales y se multiplican por los meses del periodo. El ISR solo se calcula cuando hay utilidad.</Text>

      {/* DINERO DE LOS USUARIOS */}
      <Text style={styles.seccion}>Dinero de los usuarios</Text>
      <View style={styles.tabla}>
        <Text style={styles.explicacion}>Pagos entre contratistas y trabajadores registrados en la app con su comprobante. Este dinero es de los usuarios: PalanteMX no cobra nada sobre él.</Text>
        {[
          ['Pagos confirmados', montoConfirmado, `${confirmados.length} pago(s)`],
          ['Pagos por confirmar', montoPorConfirmar, `${porConfirmar.length} pago(s)`],
          ['No recibidos (en reporte)', suma(noRecibidos), `${noRecibidos.length} pago(s)`],
          ['Pagos extra ordenados por el admin', ajustesDe('extra'), ''],
          ['Descuentos ordenados por el admin', ajustesDe('descuento'), ''],
          ['Devoluciones ordenadas por el admin', ajustesDe('devolucion'), ''],
        ].map(([texto, monto, detalle]) => (
          <View key={texto as string} style={styles.renglon}>
            <View style={{ flex: 1 }}>
              <Text style={styles.renglonTexto}>{texto}</Text>
              {!!detalle && <Text style={styles.ayuda}>{detalle}</Text>}
            </View>
            <Text style={styles.renglonMonto}>{pesos(monto as number)}</Text>
          </View>
        ))}
      </View>

      {/* IMPLEMENTACIONES A FUTURO: APARTE, SOLO PROYECCIÓN */}
      <Text style={styles.seccion}>Implementaciones a futuro</Text>
      <View style={styles.futuro}>
        <View style={styles.futuroEtiqueta}><Text style={styles.futuroEtiquetaTexto}>PROYECCIÓN · NO SE COBRA HOY</Text></View>
        <Text style={styles.tablaTitulo}>Comisión por pago dentro de la app</Text>
        <Text style={styles.explicacion}>
          Más adelante, el contratista podría pagar dentro de la app (pago en garantía con Mercado Pago) y PalanteMX cobraría una comisión. Estos números no se suman al estado de resultados.
        </Text>
        <View style={styles.renglon}><Text style={styles.renglonTexto}>Pagos confirmados del periodo</Text><Text style={styles.renglonMonto}>{pesos(montoConfirmado)}</Text></View>
        <View style={styles.renglon}><Text style={styles.renglonTexto}>Comisión ({config.comision_pct}%)</Text><Text style={styles.renglonMonto}>{pesos(comisionFutura)}</Text></View>
        <View style={styles.renglon}><Text style={styles.renglonTexto}>(-) Costo de cobro ({config.costo_cobro_pct}%)</Text><Text style={[styles.renglonMonto, { color: '#B91C1C' }]}>({pesos(costoCobroFuturo)})</Text></View>
        <View style={[styles.renglon, styles.renglonTotal]}><Text style={[styles.renglonTexto, styles.textoTotal]}>Ingreso extra posible</Text><Text style={[styles.renglonMonto, styles.textoTotal]}>{pesos(comisionFutura - costoCobroFuturo)}</Text></View>
        {filasOficio.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <BarrasHorizontales titulo="Comisión posible por oficio" subtitulo="En pesos, con los pagos confirmados del periodo." filas={filasOficio} series={['Comisión posible']} />
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.boton} onPress={compartir}>
        <Ionicons name="share-outline" size={18} color="#FFF" />
        <Text style={styles.botonTexto}>Compartir reporte</Text>
      </TouchableOpacity>
      {esPrincipal ? (
        <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={() => setEditando(JSON.parse(JSON.stringify(config)))}>
          <Ionicons name="settings-outline" size={18} color="#0D2340" />
          <Text style={[styles.botonTexto, { color: '#0D2340' }]}>Gastos, impuestos y proyección</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.nota}>Solo el administrador principal puede cambiar los ingresos, los gastos y los impuestos.</Text>
      )}

      {/* INGRESOS POR COMERCIALES DE UN MES */}
      <Modal visible={!!comercialMes} animationType="slide" transparent onRequestClose={() => setComercialMes(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.fondo, margenModal]}>
          <View style={styles.ventana}>
            <View style={styles.ventanaEncabezado}>
              <Text style={styles.ventanaTitulo}>Ingresos por comerciales</Text>
              <TouchableOpacity onPress={() => setComercialMes(null)}><Ionicons name="close" size={26} color="#6B7280" /></TouchableOpacity>
            </View>
            {comercialMes && (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.explicacion}>{MESES[Number(comercialMes.clave.slice(5, 7)) - 1]} {comercialMes.clave.slice(0, 4)}</Text>
                <Text style={styles.etiquetaCampo}>Total cobrado por comerciales ($)</Text>
                <TextInput style={[styles.input, { marginBottom: 12 }]} keyboardType="numeric" placeholder="0" value={comercialMes.monto} onChangeText={t => setComercialMes({ ...comercialMes, monto: t.replace(/[^0-9.]/g, '') })} />
                <Text style={styles.etiquetaCampo}>Anunciantes (opcional)</Text>
                <TextInput style={[styles.input, { marginBottom: 16, minHeight: 70, textAlignVertical: 'top' }]} multiline placeholder="Ej. Ferretería López $1,500; Materiales García $800" value={comercialMes.detalle} onChangeText={t => setComercialMes({ ...comercialMes, detalle: t })} />
                <TouchableOpacity style={[styles.boton, { marginBottom: 30 }]} onPress={guardarComercial} disabled={guardando}>
                  {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonTexto}>Guardar</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CONFIGURACIÓN (SOLO EL PRINCIPAL) */}
      <Modal visible={!!editando} animationType="slide" transparent onRequestClose={() => setEditando(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.fondo, margenModal]}>
          <View style={styles.ventana}>
            <View style={styles.ventanaEncabezado}>
              <Text style={styles.ventanaTitulo}>Gastos, impuestos y proyección</Text>
              <TouchableOpacity onPress={() => setEditando(null)}><Ionicons name="close" size={26} color="#6B7280" /></TouchableOpacity>
            </View>
            {editando && (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.subtitulo}>Costo de ventas</Text>
                {campoNumero('Costo por verificación de usuario ($)', 'Lectura de INE y comparación de rostro por cada usuario nuevo. Hoy en plan gratis: 0.', editando.costo_verificacion, n => setEditando({ ...editando, costo_verificacion: n }))}

                <Text style={styles.subtitulo}>Gastos de operación (pesos al mes)</Text>
                {editando.gastos.map((g, i) => (
                  <View key={i} style={styles.filaGasto}>
                    <TextInput style={[styles.input, { flex: 1 }]} value={g.concepto} placeholder="Concepto" onChangeText={t => setEditando({ ...editando, gastos: editando.gastos.map((x, j) => j === i ? { ...x, concepto: t } : x) })} />
                    <TextInput style={[styles.input, { width: 100, marginLeft: 8 }]} keyboardType="numeric" value={String(g.monto)} onChangeText={t => setEditando({ ...editando, gastos: editando.gastos.map((x, j) => j === i ? { ...x, monto: numeroDe(t) } : x) })} />
                    <TouchableOpacity onPress={() => setEditando({ ...editando, gastos: editando.gastos.filter((_, j) => j !== i) })} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setEditando({ ...editando, gastos: [...editando.gastos, { concepto: '', monto: 0 }] })} style={styles.agregar}>
                  <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                  <Text style={styles.agregarTexto}>Agregar gasto</Text>
                </TouchableOpacity>

                <Text style={styles.subtitulo}>Gastos financieros, impuestos y dividendos</Text>
                {campoNumero('Gastos financieros ($ al mes)', 'Intereses de préstamos y comisiones del banco.', editando.gastos_financieros, n => setEditando({ ...editando, gastos_financieros: n }))}
                {campoNumero('ISR (%)', 'Impuesto sobre la renta de personas morales en México: 30%.', editando.isr_pct, n => setEditando({ ...editando, isr_pct: n }))}
                {campoNumero('Dividendos (%)', 'Parte de la utilidad neta que se reparte a los socios. Lo demás queda como utilidades retenidas.', editando.dividendos_pct, n => setEditando({ ...editando, dividendos_pct: n }))}

                <Text style={styles.subtitulo}>Implementaciones a futuro (solo proyección)</Text>
                {campoNumero('Comisión por pago (%)', 'Lo que PalanteMX cobraría sobre cada pago si algún día se paga dentro de la app.', editando.comision_pct, n => setEditando({ ...editando, comision_pct: n }))}
                {campoNumero('Costo de cobro (%)', 'Lo que cobraría el procesador de pagos (p. ej. Mercado Pago).', editando.costo_cobro_pct, n => setEditando({ ...editando, costo_cobro_pct: n }))}

                <TouchableOpacity style={[styles.boton, { marginBottom: 30 }]} onPress={guardarConfig} disabled={guardando}>
                  {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonTexto}>Guardar</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 3, marginBottom: 10 },
  selectorBoton: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  selectorActivo: { backgroundColor: '#0D2340' },
  selectorTexto: { fontSize: 14, fontWeight: 'bold', color: '#374151' },
  navegador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  flecha: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  nombrePeriodo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  indicadores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 6 },
  seccion: { fontSize: 13, fontWeight: 'bold', color: '#6B7280', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  tabla: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  tablaTitulo: { fontSize: 15, fontWeight: 'bold', color: '#0D2340', marginBottom: 8 },
  montoGrande: { fontSize: 26, fontWeight: 'bold', color: '#0D2340', marginBottom: 4 },
  explicacion: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  renglon: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  renglonTotal: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 6, borderBottomWidth: 0, marginVertical: 2 },
  renglonFinal: { backgroundColor: '#0D2340' },
  renglonTexto: { flex: 1, fontSize: 14, color: '#374151', paddingRight: 8 },
  renglonDetalle: { fontSize: 13, color: '#6B7280', paddingLeft: 14 },
  renglonMonto: { fontSize: 14, color: '#111827', fontVariant: ['tabular-nums'] },
  textoTotal: { fontWeight: 'bold', color: '#0D2340' },
  margenes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 6 },
  margen: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  margenValor: { fontWeight: 'bold', color: '#0D2340' },
  nota: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginVertical: 8 },
  futuro: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#9CA3AF', borderStyle: 'dashed' },
  futuroEtiqueta: { alignSelf: 'flex-start', backgroundColor: '#E5E7EB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  futuroEtiquetaTexto: { fontSize: 11, fontWeight: 'bold', color: '#4B5563', letterSpacing: 0.5 },
  boton: { flexDirection: 'row', backgroundColor: '#0D2340', borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  botonSecundario: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#0D2340' },
  botonTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 8 },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  ventana: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '90%' },
  ventanaEncabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  ventanaTitulo: { fontSize: 18, fontWeight: 'bold', color: '#0D2340' },
  subtitulo: { fontSize: 13, fontWeight: 'bold', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  etiquetaCampo: { fontSize: 14, fontWeight: 'bold', color: '#374151' },
  ayuda: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  filaGasto: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  agregar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  agregarTexto: { color: '#2563EB', fontWeight: 'bold', marginLeft: 6 },
});
