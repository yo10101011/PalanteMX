// PAGOS DE UNA OBRA. EL DINERO SE PAGA POR FUERA (EFECTIVO O TRANSFERENCIA) Y AQUÍ QUEDA LA EVIDENCIA:
// - EL CONTRATISTA REGISTRA CADA PAGO CON LA FOTO DEL COMPROBANTE (TICKET, CAPTURA DE TRANSFERENCIA, RECIBO FIRMADO).
// - EL TRABAJADOR CONFIRMA "SÍ LO RECIBÍ" O "NO ME LLEGÓ" (ESTO LEVANTA UN REPORTE AUTOMÁTICO AL ADMIN).
// - ARRIBA SE VEN LOS AJUSTES QUE ORDENÓ EL ADMIN (DINERO EXTRA PARA EL TRABAJADOR, O DESCUENTOS).
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectorFotos, subirFotos } from '@/components/selector-fotos';
import { VisorFoto } from '@/components/visor-foto';
import { accionContrato, ajustesDePago, COLOR_PAGO, CONCEPTOS_PAGO, ESTADO_PAGO, ESTADOS, leerBitacora, totalRecibido } from '@/lib/contratos';
import { calcularPlanDePagos, ESTILO_PERIODO } from '@/lib/pagos';

type Props = {
  contrato: any | null; // null = CERRADO
  rol: 'trabajador' | 'contratista';
  onClose: () => void;
  onCambio: () => void; // PARA QUE LA PANTALLA RECARGUE EL CONTRATO
};

const pesos = (n: number) => `$${(n || 0).toLocaleString('es-MX')}`;

export function ModalPagos({ contrato, rol, onClose, onCambio }: Props) {
  const [pagos, setPagos] = useState<any[]>([]);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState(CONCEPTOS_PAGO[0]);
  const [comprobante, setComprobante] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const [bitacora, setBitacora] = useState<any[]>([]);

  useEffect(() => { setPagos(contrato?.pagos || []); setMonto(''); setComprobante([]); setRechazandoId(null); }, [contrato?.id, contrato?.pagos?.length]);

  // LA BITÁCORA HACE FALTA PARA LOS PAGOS "POR DÍA" (SE PAGA CADA DÍA TRABAJADO)
  useEffect(() => {
    if (!contrato?.id) { setBitacora([]); return; }
    leerBitacora(contrato.id).then(setBitacora).catch(() => setBitacora([]));
  }, [contrato?.id]);

  const resumenPlan = contrato ? calcularPlanDePagos(contrato, bitacora) : null;

  // AL ABRIR, EL FORMULARIO YA TRAE EL PAGO QUE TOCA (P. EJ. "SEMANA 2" POR $3,000)
  useEffect(() => {
    if (resumenPlan?.siguiente) { setConcepto(resumenPlan.siguiente.etiqueta); setMonto(String(Math.round(resumenPlan.siguiente.monto))); }
  }, [resumenPlan?.siguiente?.etiqueta]);

  const ajustes = ajustesDePago(contrato);
  const extras = ajustes.filter(a => a.tipo === 'extra').reduce((s, a) => s + a.monto, 0);
  const descuentos = ajustes.filter(a => a.tipo === 'descuento').reduce((s, a) => s + a.monto, 0);
  const devoluciones = ajustes.filter(a => a.tipo === 'devolucion').reduce((s, a) => s + a.monto, 0);
  const puedeRegistrar = rol === 'contratista' && [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.FINALIZADA, ESTADOS.SUSPENDIDA, ESTADOS.CANCELADA].includes(contrato?.estado);

  const registrar = async () => {
    const cantidad = parseInt(monto);
    if (!cantidad) { Alert.alert("Aviso", "Escribe cuánto pagaste."); return; }
    if (comprobante.length === 0) { Alert.alert("Comprobante necesario", "Toma o sube la foto del comprobante: ticket, captura de la transferencia o un recibo firmado por el trabajador."); return; }
    setEnviando(true);
    try {
      const [url] = await subirFotos(comprobante);
      await accionContrato('registrar_pago', { id_contrato: contrato.id, monto: cantidad, concepto, comprobante: url });
      setMonto(''); setComprobante([]);
      Alert.alert("Pago registrado", "El trabajador recibirá un aviso para confirmar que le llegó.");
      onCambio();
    } catch (error: any) { Alert.alert("No se pudo registrar", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  const confirmar = async (pago: any, recibido: boolean) => {
    if (!recibido && !motivo.trim()) { Alert.alert("Aviso", "Explica qué pasó con el pago."); return; }
    setEnviando(true);
    try {
      await accionContrato('confirmar_pago', { id_contrato: contrato.id, id_pago: pago.id, recibido, motivo: recibido ? undefined : motivo.trim() });
      setRechazandoId(null); setMotivo('');
      Alert.alert(recibido ? "¡Listo!" : "Reporte enviado", recibido ? "Confirmaste que recibiste el pago." : "El administrador revisará el comprobante y les avisará a los dos.");
      onCambio();
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  return (
    <Modal visible={!!contrato} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.fondo}>
        <SafeAreaView style={styles.panel}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <View style={styles.encabezado}>
              <Text style={styles.titulo} numberOfLines={1}>Pagos: {contrato?.titulo_vacante}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <View style={styles.resumen}>
                <View style={styles.resumenCaja}><Text style={styles.resumenTexto}>Pago acordado</Text><Text style={styles.resumenNumero}>{contrato?.vacante?.pago || 'A convenir'}</Text></View>
                <View style={styles.resumenCaja}><Text style={styles.resumenTexto}>Recibido (confirmado)</Text><Text style={[styles.resumenNumero, { color: '#059669' }]}>{pesos(totalRecibido(contrato))}</Text></View>
              </View>

              {ajustes.length > 0 && (
                <View style={styles.ajustes}>
                  <Text style={styles.seccion}>Ajustes ordenados por el administrador</Text>
                  {ajustes.map((a, i) => (
                    <Text key={i} style={[styles.ajuste, { color: a.tipo === 'extra' ? '#047857' : '#B91C1C' }]}>{a.tipo === 'extra' ? '+' : '−'} {a.texto} ({a.motivo}, {a.fecha})</Text>
                  ))}
                  {extras > 0 && <Text style={styles.ajusteTotal}>El contratista debe pagar {pesos(extras)} extra.</Text>}
                  {descuentos > 0 && <Text style={styles.ajusteTotal}>Se descuentan {pesos(descuentos)} del pago al trabajador.</Text>}
                  {devoluciones > 0 && <Text style={styles.ajusteTotal}>El trabajador debe devolver {pesos(devoluciones)} al contratista.</Text>}
                </View>
              )}

              {/* CALENDARIO DE PAGOS SEGÚN CADA CUÁNTO SE ACORDÓ (POR DÍA, POR SEMANA O POR OBRA) */}
              {resumenPlan && resumenPlan.monto > 0 && (
                <View style={styles.calendario}>
                  <Text style={styles.seccion}>¿Qué pagos tocan? ({resumenPlan.periodo})</Text>
                  {resumenPlan.pendienteHoy > 0 ? (
                    <Text style={styles.alerta}>{rol === 'contratista' ? `Ya te toca pagar ${pesos(resumenPlan.pendienteHoy)}.` : `El contratista ya debería haberte pagado ${pesos(resumenPlan.pendienteHoy)}.`}</Text>
                  ) : (
                    <Text style={styles.alDia}>Los pagos van al día.</Text>
                  )}
                  {resumenPlan.plan.length === 0 && <Text style={styles.vacio}>{resumenPlan.periodo === 'por día' ? 'Todavía no hay días trabajados en la bitácora.' : 'Todavía no toca ningún pago.'}</Text>}
                  {resumenPlan.plan.map((p, i) => (
                    <View key={i} style={styles.periodo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.periodoTexto}>{p.etiqueta}</Text>
                        <Text style={styles.periodoMonto}>{pesos(Math.round(p.monto))}</Text>
                      </View>
                      <View style={[styles.etiqueta, { backgroundColor: ESTILO_PERIODO[p.estado].color, maxWidth: 140 }]}><Text style={styles.etiquetaTexto}>{ESTILO_PERIODO[p.estado].texto}</Text></View>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.seccion}>Pagos registrados ({pagos.length})</Text>
              {pagos.length === 0 ? <Text style={styles.vacio}>{rol === 'contratista' ? 'Cuando pagues, regístralo aquí con la foto del comprobante.' : 'Cuando el contratista registre un pago, te llegará un aviso para confirmarlo.'}</Text>
                : [...pagos].reverse().map(p => (
                  <View key={p.id} style={[styles.pago, { borderLeftColor: COLOR_PAGO[p.estado] || '#9CA3AF' }]}>
                    <View style={styles.filaEntre}>
                      <Text style={styles.pagoMonto}>{pesos(p.monto)}</Text>
                      <View style={[styles.etiqueta, { backgroundColor: COLOR_PAGO[p.estado] || '#9CA3AF' }]}><Text style={styles.etiquetaTexto}>{p.estado.toUpperCase()}</Text></View>
                    </View>
                    <Text style={styles.pagoDato}>{p.concepto} · {p.fecha}</Text>
                    {p.motivo ? <Text style={[styles.pagoDato, { color: '#B91C1C' }]}>Trabajador: "{p.motivo}"</Text> : null}
                    <TouchableOpacity onPress={() => setFotoGrande(p.comprobante)}><Image source={{ uri: p.comprobante }} style={styles.comprobante} /></TouchableOpacity>

                    {rol === 'trabajador' && p.estado === ESTADO_PAGO.POR_CONFIRMAR && rechazandoId !== p.id && (
                      <View style={{ flexDirection: 'row', marginTop: 8 }}>
                        <TouchableOpacity style={[styles.boton, { backgroundColor: '#059669', flex: 1, marginRight: 6 }]} disabled={enviando} onPress={() => confirmar(p, true)}><Text style={styles.botonTexto}>Sí lo recibí</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.boton, { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DC2626', flex: 1, marginLeft: 6 }]} disabled={enviando} onPress={() => { setRechazandoId(p.id); setMotivo(''); }}><Text style={[styles.botonTexto, { color: '#DC2626' }]}>No me llegó</Text></TouchableOpacity>
                      </View>
                    )}
                    {rechazandoId === p.id && (
                      <View style={{ marginTop: 8 }}>
                        <TextInput style={styles.input} multiline placeholder="¿Qué pasó? Ej. Me dio $1,500, no $2,000..." value={motivo} onChangeText={setMotivo} />
                        <View style={{ flexDirection: 'row' }}>
                          <TouchableOpacity style={[styles.boton, { backgroundColor: '#E5E7EB', flex: 1, marginRight: 6 }]} onPress={() => setRechazandoId(null)}><Text style={[styles.botonTexto, { color: '#374151' }]}>Volver</Text></TouchableOpacity>
                          <TouchableOpacity style={[styles.boton, { backgroundColor: '#DC2626', flex: 1, marginLeft: 6 }]} disabled={enviando} onPress={() => confirmar(p, false)}>{enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonTexto}>Reportar</Text>}</TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ))}

              {puedeRegistrar && (
                <View style={styles.formulario}>
                  <Text style={styles.seccion}>Registrar un pago</Text>
                  <Text style={styles.etiquetaForm}>¿Cuánto pagaste? (pesos)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" placeholder="Ej. 3000" value={monto} onChangeText={t => setMonto(t.replace(/[^0-9]/g, ''))} />
                  <Text style={styles.etiquetaForm}>¿De qué es el pago?</Text>
                  <View style={styles.pickerCaja}>
                    <Picker selectedValue={concepto} onValueChange={setConcepto}>
                      {/* PRIMERO LOS PAGOS QUE YA TOCAN SEGÚN EL CALENDARIO, LUEGO LOS GENERALES */}
                      {[...(resumenPlan?.plan || []).filter(p => p.estado === 'toca_pagar').map(p => p.etiqueta), ...CONCEPTOS_PAGO].map(c => <Picker.Item key={c} label={c} value={c} />)}
                    </Picker>
                  </View>
                  <SelectorFotos fotos={comprobante} onCambio={setComprobante} maximo={1} texto="Foto del comprobante (obligatoria)" />
                  <TouchableOpacity style={[styles.boton, { backgroundColor: '#0D2340' }]} disabled={enviando} onPress={registrar}>
                    {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonTexto}>Registrar pago</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', paddingTop: 30 },
  panel: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#065F46', padding: 15 },
  titulo: { color: '#FFF', fontWeight: 'bold', fontSize: 17, flex: 1, marginRight: 10 },
  resumen: { flexDirection: 'row', marginBottom: 12 },
  resumenCaja: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginHorizontal: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  resumenTexto: { fontSize: 13, color: '#6B7280', fontWeight: 'bold' },
  resumenNumero: { fontSize: 17, color: '#0D2340', fontWeight: 'bold', marginTop: 4 },
  ajustes: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12 },
  ajuste: { fontSize: 14, marginTop: 4, fontWeight: '600' },
  ajusteTotal: { fontSize: 15, fontWeight: 'bold', color: '#92400E', marginTop: 8 },
  calendario: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  alerta: { fontSize: 16, fontWeight: 'bold', color: '#B91C1C', backgroundColor: '#FEE2E2', borderRadius: 8, padding: 8, marginBottom: 8 },
  alDia: { fontSize: 16, fontWeight: 'bold', color: '#047857', marginBottom: 8 },
  periodo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderColor: '#F3F4F6' },
  periodoTexto: { fontSize: 15, color: '#1F2937', fontWeight: '600' },
  periodoMonto: { fontSize: 15, color: '#059669', fontWeight: 'bold' },
  seccion: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginBottom: 8 },
  vacio: { color: '#6B7280', textAlign: 'center', marginBottom: 12 },
  pago: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 5 },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pagoMonto: { fontSize: 19, fontWeight: 'bold', color: '#0D2340' },
  pagoDato: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  etiquetaTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  comprobante: { width: 110, height: 110, borderRadius: 8, marginTop: 8, backgroundColor: '#E5E7EB' },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 11 },
  botonTexto: { color: '#FFF', fontWeight: 'bold' },
  formulario: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginTop: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  etiquetaForm: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 16, color: '#1F2937' },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
});
