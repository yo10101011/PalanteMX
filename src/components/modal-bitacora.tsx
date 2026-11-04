// BITÁCORA DIARIA DE UNA OBRA. LA VEN EL TRABAJADOR Y EL CONTRATISTA (LA MISMA, PORQUE VIVE DENTRO DEL CONTRATO).
// - EL TRABAJADOR AGREGA UN AVANCE POR DÍA, SOLO MIENTRAS LA OBRA ESTÁ ACTIVA (LO REVISAN TAMBIÉN LAS REGLAS).
// - EL CONTRATISTA REVISA CADA DÍA: "SÍ LO HIZO" (SE CONFIRMA) O "NO ES CIERTO" (SE LEVANTA UN REPORTE Y EL ADMIN
//   DECIDE SI EL DÍA CUENTA O SE DESCUENTA). EL RESUMEN DE ARRIBA CUENTA LOS DÍAS DE CADA TIPO.
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarioBitacora } from '@/components/calendario-bitacora';
import { SelectorFotos, subirFotos } from '@/components/selector-fotos';
import { VisorFoto } from '@/components/visor-foto';
import { subirFotoACloudinary } from '@/lib/cloudinary';
import { accionContrato, agregarABitacora, claveDia, ESTADOS, estiloDia, leerBitacora, REVISION, motivoSinBitacora } from '@/lib/contratos';
import { distanciaKm, evaluarUbicacion, mensajeUbicacion, NivelUbicacion, nombreDeLugar, ubicacionPrecisa } from '@/lib/ubicacion';

const ICONO_NIVEL: Record<NivelUbicacion, keyof typeof Ionicons.glyphMap> = {
  en_obra: 'checkmark-circle', imprecisa: 'cellular-outline', cerca: 'warning', lejos: 'close-circle', falsa: 'alert-circle', sin_obra: 'location',
};

// CHECK DE UBICACIÓN DE UN DÍA, CON EL MENSAJE PARA QUIEN LO ESTÁ VIENDO (EL ALGORITMO VIVE EN lib/ubicacion)
const checkUbicacion = (dia: any, contrato: any, para: 'trabajador' | 'contratista') => {
  if (!dia.asistio) return null;
  if (!dia.ubicacion_registro) return { texto: 'Sin ubicación registrada (día anterior al check GPS)', color: '#9CA3AF', icono: 'location-outline' as const };
  const distancia = contrato?.vacante?.coordenadas ? dia.distancia_obra_km : null;
  const nivel = evaluarUbicacion(distancia, dia.ubicacion_registro.precision, dia.ubicacion_registro.simulada);
  const { texto, color } = mensajeUbicacion(nivel, distancia, dia.ubicacion_registro.precision, para);
  const aviso = nivel !== 'sin_obra' && contrato?.vacante?.lugar_exacto === false ? ' (La obra no tiene su lugar exacto marcado: la distancia es aproximada.)' : '';
  return { texto: texto + aviso, color, icono: ICONO_NIVEL[nivel] };
};

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  rol: 'trabajador' | 'contratista';
  onClose: () => void;
};

export function ModalBitacora({ contrato, rol, onClose }: Props) {
  const [entradas, setEntradas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [asistio, setAsistio] = useState(true);
  const [nota, setNota] = useState('');
  const [evidencia, setEvidencia] = useState<string | null>(null);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  // DÍA QUE EL CONTRATISTA ESTÁ RECHAZANDO (SE ABRE UNA CAJA PARA ESCRIBIR POR QUÉ)
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [fotosRechazo, setFotosRechazo] = useState<string[]>([]);

  const cargar = async () => {
    if (!contrato) return;
    setCargando(true);
    try { setEntradas(await leerBitacora(contrato.id)); }
    catch (error) { Alert.alert("Error", "No se pudo cargar la bitácora."); }
    setCargando(false);
  };

  useEffect(() => {
    setEntradas([]); setNota(''); setEvidencia(null); setAsistio(true); setDiaSeleccionado(null); setRechazandoId(null);
    cargar();
  }, [contrato?.id]);

  // FOTO DEL AVANCE: CON LA CÁMARA (RECOMENDADO, ES DEL MOMENTO) O DE LA GALERÍA. SIN PANTALLA DE RECORTE.
  const elegirFoto = async (origen: 'camara' | 'galeria') => {
    try {
      if (origen === 'camara') {
        const permiso = await ImagePicker.requestCameraPermissionsAsync();
        if (!permiso.granted) { Alert.alert("Sin permiso", "Activa el permiso de cámara para tomar la foto de tu avance."); return; }
      }
      const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
      const result = origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (!result.canceled && result.assets[0].base64) setEvidencia(`data:image/jpeg;base64,${result.assets[0].base64}`);
    } catch (error) { Alert.alert("Error", "No se pudo abrir la cámara o la galería."); }
  };

  // GUARDAR EL AVANCE DE HOY. SI ASISTIÓ, PRIMERO SE TOMA SU UBICACIÓN (HASTA 3 LECTURAS, LA MÁS PRECISA) Y SE
  // COMPARA CON EL LUGAR DE LA OBRA: SIN UBICACIÓN NO SE PUEDE REGISTRAR ASISTENCIA (UNA FOTO SE TOMA EN CUALQUIER LADO).
  // SE REGISTRA AUNQUE ESTÉ LEJOS, PERO SE LE DICE CLARO Y EL CONTRATISTA LO VE.
  const guardar = async () => {
    if (!nota.trim()) { Alert.alert("Aviso", "Describe brevemente qué hiciste o por qué faltaste hoy."); return; }
    if (asistio && !evidencia) { Alert.alert("Evidencia requerida", "Para comprobar tu asistencia, toma una foto de tu avance de hoy."); return; }
    setGuardando(true);
    try {
      let ubicacion = null;
      let distancia: number | null = null;
      let lugar = '';
      if (asistio) {
        try { ubicacion = await ubicacionPrecisa(); }
        catch (error: any) { throw new Error(`Para registrar tu asistencia necesitamos tu ubicación: así el contratista comprueba que sí estuviste en la obra. ${error?.message || ''}`); }
        distancia = distanciaKm(ubicacion, contrato?.vacante?.coordenadas);
        lugar = await nombreDeLugar(ubicacion);
      }
      const urlEvidencia = evidencia ? await subirFotoACloudinary(evidencia) : null;
      await agregarABitacora(contrato.id, {
        asistio, nota: nota.trim(), evidencia: urlEvidencia,
        ubicacion_registro: ubicacion, distancia_obra_km: distancia === null ? null : Math.round(distancia * 1000) / 1000, lugar_registro: lugar,
      });
      setNota(''); setEvidencia(null); setAsistio(true);
      await cargar();
      if (!ubicacion) { Alert.alert("Bitácora actualizada", "Tu falta de hoy quedó registrada."); }
      else {
        const nivel = evaluarUbicacion(distancia, ubicacion.precision, ubicacion.simulada);
        Alert.alert("Bitácora actualizada", `${mensajeUbicacion(nivel, distancia, ubicacion.precision, 'trabajador').texto}${lugar ? `\n\nLugar registrado: ${lugar}` : ''}`);
      }
    } catch (error: any) { Alert.alert("No se pudo guardar", error?.message || "Intenta de nuevo."); }
    setGuardando(false);
  };

  const revisar = async (dia: any, veredicto: 'confirmar' | 'rechazar') => {
    if (veredicto === 'rechazar' && !motivoRechazo.trim()) { Alert.alert("Aviso", "Explica qué no es cierto de lo que escribió el trabajador. El administrador lo va a revisar."); return; }
    setGuardando(true);
    try {
      const fotos = veredicto === 'rechazar' ? await subirFotos(fotosRechazo) : [];
      await accionContrato('revisar_bitacora', { id_contrato: contrato.id, id_entrada: dia.id, veredicto, motivo: veredicto === 'rechazar' ? motivoRechazo.trim() : undefined, fotos });
      setRechazandoId(null); setMotivoRechazo(''); setFotosRechazo([]);
      await cargar();
      if (veredicto === 'rechazar') Alert.alert("Reporte enviado", "El administrador revisará este día y decidirá si cuenta o se descuenta. Les avisaremos a los dos.");
    } catch (error: any) { Alert.alert("No se pudo", error?.message || "Intenta de nuevo."); }
    setGuardando(false);
  };

  const confirmarDia = (dia: any) => Alert.alert("Confirmar día", `¿Confirmas que el trabajador sí hizo lo que reportó el ${dia.fecha}?`, [
    { text: "Volver", style: "cancel" },
    { text: "Sí, lo hizo", onPress: () => revisar(dia, 'confirmar') },
  ]);

  const esTrabajador = rol === 'trabajador';
  const yaRegistroHoy = entradas.some(e => e.dia === claveDia(new Date()));
  const escribirPermitido = esTrabajador && contrato?.estado === ESTADOS.ACTIVA;
  // EL CONTRATISTA SOLO REVISA MIENTRAS LA OBRA SIGUE ABIERTA; TERMINADA, SUSPENDIDA O CANCELADA YA NO SE MODIFICA
  const puedeRevisar = !esTrabajador && [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN].includes(contrato?.estado);
  const cerrada = [ESTADOS.FINALIZADA, ESTADOS.CANCELADA].includes(contrato?.estado);

  // RESUMEN: LOS DÍAS DESCONTADOS Y LAS FALTAS NO CUENTAN COMO TRABAJADOS
  const trabajados = entradas.filter(e => e.asistio);
  const resumen = [
    { numero: trabajados.filter(e => e.revision === REVISION.CONFIRMADA).length, texto: 'Confirmados', color: '#00D06C' },
    { numero: trabajados.filter(e => !e.revision || e.revision === REVISION.PENDIENTE).length, texto: 'Por revisar', color: '#F59E0B' },
    { numero: trabajados.filter(e => e.revision === REVISION.EN_DISPUTA).length, texto: 'En disputa', color: '#EA580C' },
    { numero: trabajados.filter(e => e.revision === REVISION.DESCONTADA).length, texto: 'Descontados', color: '#DC2626' },
    { numero: entradas.filter(e => !e.asistio).length, texto: 'Faltas', color: '#9CA3AF' },
  ];

  // LO MÁS RECIENTE ARRIBA; SI SE TOCÓ UN DÍA EN EL CALENDARIO, SOLO ESE
  const visibles = [...entradas].reverse().filter(e => !diaSeleccionado || e.dia === diaSeleccionado);

  return (
    <Modal visible={!!contrato} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.fondo}>
        <SafeAreaView style={styles.contenedor}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <View style={styles.encabezado}>
              <Text style={styles.encabezadoTexto} numberOfLines={1}>Bitácora: {contrato?.titulo_vacante}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {cargando ? <ActivityIndicator size="large" color="#00D06C" style={{ marginTop: 30 }} /> : (
                <>
                  <View style={styles.resumen}>
                    {resumen.map(r => (
                      <View key={r.texto} style={styles.resumenCaja}>
                        <Text style={[styles.resumenNumero, { color: r.color }]}>{r.numero}</Text>
                        <Text style={styles.resumenTexto}>{r.texto}</Text>
                      </View>
                    ))}
                  </View>

                  <CalendarioBitacora entradas={entradas} seleccionado={diaSeleccionado} onSeleccionar={setDiaSeleccionado} />

                  {!esTrabajador && trabajados.some(e => !e.revision || e.revision === REVISION.PENDIENTE) && (
                    <Text style={styles.avisoRevisar}>Revisa cada día: confirma si el trabajador sí hizo lo que dice, o recházalo si no es cierto.</Text>
                  )}

                  {diaSeleccionado && (
                    <TouchableOpacity onPress={() => setDiaSeleccionado(null)} style={styles.verTodos}>
                      <Ionicons name="list-outline" size={16} color="#3B82F6" /><Text style={styles.verTodosTexto}>Ver todos los días</Text>
                    </TouchableOpacity>
                  )}

                  {entradas.length === 0 ? (
                    <View style={styles.vacio}>
                      <Ionicons name="reader-outline" size={44} color="#D1D5DB" />
                      <Text style={styles.vacioTexto}>Todavía no hay avances registrados en esta obra.</Text>
                    </View>
                  ) : visibles.map(dia => {
                    const estilo = estiloDia(dia);
                    const porRevisar = puedeRevisar && dia.asistio && (!dia.revision || dia.revision === REVISION.PENDIENTE);
                    return (
                      <View key={dia.id} style={[styles.tarjetaDia, { borderLeftColor: estilo.color }]}>
                        <View style={styles.filaDia}>
                          <Text style={styles.fecha}>{dia.fecha}</Text>
                          <View style={[styles.etiqueta, { backgroundColor: estilo.color }]}><Text style={styles.etiquetaTexto}>{estilo.texto}</Text></View>
                        </View>
                        <Text style={styles.asistencia}>{dia.automatica ? 'No llenó la bitácora (registrado automáticamente)' : dia.asistio ? 'Asistió y trabajó' : 'No asistió'}</Text>
                        <Text style={styles.nota}>{dia.nota}</Text>
                        {dia.evidencia ? (
                          <TouchableOpacity onPress={() => setFotoGrande(dia.evidencia)}>
                            <Image source={{ uri: dia.evidencia }} style={styles.evidencia} />
                          </TouchableOpacity>
                        ) : null}
                        {(() => {
                          const check = checkUbicacion(dia, contrato, esTrabajador ? 'trabajador' : 'contratista');
                          if (!check) return null;
                          const { latitud, longitud } = dia.ubicacion_registro || {};
                          return (
                            <View style={[styles.check, { borderColor: check.color }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <Ionicons name={check.icono} size={16} color={check.color} />
                                <Text style={[styles.checkTexto, { color: check.color }]}>{check.texto}</Text>
                              </View>
                              {dia.lugar_registro ? <Text style={styles.checkLugar}>Estaba en: {dia.lugar_registro}</Text> : null}
                              {latitud ? (
                                <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`)}>
                                  <Text style={styles.verMapa}>Ver en el mapa ›</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          );
                        })()}
                        {dia.motivo_rechazo ? <Text style={styles.rechazo}>Contratista: "{dia.motivo_rechazo}"</Text> : null}
                        {dia.nota_admin ? <Text style={styles.notaAdmin}>Administrador: "{dia.nota_admin}"</Text> : null}

                        {porRevisar && rechazandoId !== dia.id && (
                          <View style={styles.botonesRevision}>
                            <TouchableOpacity style={[styles.botonRevision, { backgroundColor: '#00D06C', borderColor: '#00D06C' }]} disabled={guardando} onPress={() => confirmarDia(dia)}>
                              <Ionicons name="checkmark-circle" size={16} color="#FFF" /><Text style={[styles.botonRevisionTexto, { color: '#FFF' }]}>Sí lo hizo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.botonRevision, { borderColor: '#DC2626' }]} disabled={guardando} onPress={() => { setRechazandoId(dia.id); setMotivoRechazo(''); }}>
                              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" /><Text style={[styles.botonRevisionTexto, { color: '#DC2626' }]}>No es cierto</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {porRevisar && rechazandoId === dia.id && (
                          <View style={{ marginTop: 10 }}>
                            <Text style={styles.etiquetaForm}>¿Qué no es cierto? (se enviará al administrador)</Text>
                            <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} multiline value={motivoRechazo} onChangeText={setMotivoRechazo} placeholder="Ej. Ese día no se presentó a la obra..." />
                            <SelectorFotos fotos={fotosRechazo} onCambio={setFotosRechazo} texto="Fotos de prueba (opcional)" />
                            <View style={styles.botonesRevision}>
                              <TouchableOpacity style={[styles.botonRevision, { borderColor: '#6B7280' }]} disabled={guardando} onPress={() => setRechazandoId(null)}>
                                <Text style={[styles.botonRevisionTexto, { color: '#6B7280' }]}>Volver</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.botonRevision, { backgroundColor: '#DC2626', borderColor: '#DC2626' }]} disabled={guardando} onPress={() => revisar(dia, 'rechazar')}>
                                {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.botonRevisionTexto, { color: '#FFF' }]}>Rechazar y reportar</Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* SOLO EN LOS DÍAS DE TRABAJO DE LA OBRA (NI ANTES DEL INICIO, NI DESPUÉS DEL FIN, NI LOS DÍAS QUE NO SE TRABAJA) */}
                  {escribirPermitido && !!motivoSinBitacora(contrato) && (
                    <Text style={styles.avisoHoy}>{motivoSinBitacora(contrato)}</Text>
                  )}
                  {escribirPermitido && !motivoSinBitacora(contrato) && yaRegistroHoy && (
                    <Text style={styles.avisoHoy}>Ya registraste tu avance de hoy. Mañana podrás agregar el siguiente.</Text>
                  )}
                  {escribirPermitido && !motivoSinBitacora(contrato) && !yaRegistroHoy && (
                    <View style={styles.formulario}>
                      <Text style={styles.formTitulo}>Reportar avance de hoy ({new Date().toLocaleDateString('es-MX')})</Text>
                      <Text style={styles.etiquetaForm}>¿Asististe a la obra hoy?</Text>
                      <View style={styles.pickerCaja}>
                        <Picker selectedValue={asistio} onValueChange={(v) => setAsistio(v)}>
                          <Picker.Item label="Sí asistí y trabajé" value={true} />
                          <Picker.Item label="No pude asistir" value={false} />
                        </Picker>
                      </View>
                      <Text style={styles.etiquetaForm}>Notas y avances (obligatorio)</Text>
                      <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline value={nota} onChangeText={setNota} />
                      <Text style={styles.etiquetaForm}>Foto de evidencia (para el contratista)</Text>
                      {evidencia ? <Image source={{ uri: evidencia }} style={[styles.vistaPrevia, { marginBottom: 8 }]} /> : null}
                      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                        <TouchableOpacity style={[styles.subirFoto, { flex: 1, marginRight: 5, minHeight: 0, marginBottom: 0 }]} onPress={() => elegirFoto('camara')}>
                          <Ionicons name="camera" size={24} color="#0D2340" /><Text style={[styles.subirTexto, { color: '#0D2340', fontWeight: 'bold' }]}>Tomar foto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.subirFoto, { flex: 1, marginLeft: 5, minHeight: 0, marginBottom: 0 }]} onPress={() => elegirFoto('galeria')}>
                          <Ionicons name="images-outline" size={24} color="#9CA3AF" /><Text style={styles.subirTexto}>De la galería</Text>
                        </TouchableOpacity>
                      </View>
                      {asistio && <Text style={styles.avisoGps}>Al guardar se registrará tu ubicación actual como comprobante de que estás en la obra.</Text>}
                      <TouchableOpacity style={styles.botonGuardar} onPress={guardar} disabled={guardando}>
                        {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonGuardarTexto}>Guardar y enviar al contratista</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                  {contrato?.estado === ESTADOS.SUSPENDIDA && (
                    <Text style={styles.avisoSuspendida}>La obra está suspendida mientras el administrador revisa la cancelación. La bitácora no se puede modificar.</Text>
                  )}
                  {cerrada && (
                    <Text style={[styles.avisoSuspendida, { color: '#6B7280' }]}>Esta obra ya está {contrato?.estado === ESTADOS.FINALIZADA ? 'terminada' : 'cancelada'}: la bitácora queda guardada como registro y ya no se puede modificar.</Text>
                  )}
                </>
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
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', paddingTop: 30 },
  contenedor: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D2340', padding: 15 },
  encabezadoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 17, flex: 1, marginRight: 10 },
  resumen: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  resumenCaja: { flex: 1, alignItems: 'center' },
  resumenNumero: { fontSize: 19, fontWeight: 'bold' },
  resumenTexto: { fontSize: 13, color: '#6B7280', fontWeight: 'bold', textAlign: 'center' },
  avisoRevisar: { fontSize: 14, color: '#B45309', fontWeight: 'bold', marginBottom: 10 },
  verTodos: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  verTodosTexto: { color: '#3B82F6', fontWeight: 'bold', marginLeft: 5 },
  vacio: { alignItems: 'center', marginVertical: 20 },
  vacioTexto: { color: '#6B7280', textAlign: 'center', marginTop: 10 },
  tarjetaDia: { backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 12, borderLeftWidth: 5 },
  filaDia: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fecha: { fontSize: 16, fontWeight: 'bold', color: '#0D2340' },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 1, marginLeft: 8 },
  etiquetaTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  asistencia: { fontSize: 14, color: '#374151', marginTop: 4, fontWeight: '600' },
  nota: { fontSize: 15, color: '#4B5563', marginTop: 3 },
  evidencia: { width: 110, height: 110, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  rechazo: { fontSize: 14, color: '#EA580C', marginTop: 6, fontStyle: 'italic' },
  check: { marginTop: 8, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 8, borderWidth: 1 },
  checkTexto: { fontSize: 14, fontWeight: 'bold', marginLeft: 6, flex: 1 },
  checkLugar: { fontSize: 14, color: '#374151', marginTop: 4 },
  verMapa: { fontSize: 14, color: '#2563EB', fontWeight: 'bold', marginTop: 4 },
  avisoGps: { fontSize: 14, color: '#2563EB', marginBottom: 10 },
  notaAdmin: { fontSize: 14, color: '#0D2340', marginTop: 4, fontStyle: 'italic', fontWeight: '600' },
  botonesRevision: { flexDirection: 'row', marginTop: 10, marginHorizontal: -4 },
  botonRevision: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 9, marginHorizontal: 4 },
  botonRevisionTexto: { fontSize: 14, fontWeight: 'bold', marginLeft: 5 },
  avisoHoy: { color: '#059669', fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  formulario: { backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 10 },
  formTitulo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginBottom: 10 },
  etiquetaForm: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 16, color: '#1F2937' },
  subirFoto: { borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12, padding: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', minHeight: 100, marginBottom: 10 },
  subirTexto: { color: '#9CA3AF', fontSize: 14, marginTop: 5 },
  vistaPrevia: { width: '100%', height: 150, borderRadius: 10 },
  botonGuardar: { backgroundColor: '#00D06C', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonGuardarTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  avisoSuspendida: { color: '#DC2626', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
});
