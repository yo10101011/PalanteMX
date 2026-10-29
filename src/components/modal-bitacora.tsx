// BITÁCORA DIARIA DE UNA OBRA. LA VEN EL TRABAJADOR Y EL CONTRATISTA (LA MISMA, PORQUE VIVE DENTRO DEL CONTRATO).
// - EL TRABAJADOR AGREGA UN AVANCE POR DÍA, SOLO MIENTRAS LA OBRA ESTÁ ACTIVA (LO REVISAN TAMBIÉN LAS REGLAS).
// - EL CONTRATISTA REVISA CADA DÍA: "SÍ LO HIZO" (SE CONFIRMA) O "NO ES CIERTO" (SE LEVANTA UN REPORTE Y EL ADMIN
//   DECIDE SI EL DÍA CUENTA O SE DESCUENTA). EL RESUMEN DE ARRIBA CUENTA LOS DÍAS DE CADA TIPO.
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarioBitacora } from '@/components/calendario-bitacora';
import { VisorFoto } from '@/components/visor-foto';
import { subirFotoACloudinary } from '@/lib/cloudinary';
import { accionContrato, agregarABitacora, claveDia, ESTADOS, estiloDia, leerBitacora, REVISION } from '@/lib/contratos';
import { distanciaKm, textoDistancia } from '@/lib/ubicacion';

// MÁS LEJOS QUE ESTO DE LA OBRA, EL REGISTRO SE MARCA COMO "LEJOS" (EL GPS DEL TELÉFONO PUEDE FALLAR UNOS METROS)
const DISTANCIA_MAXIMA_KM = 0.5;

// TEXTO Y COLOR DEL CHECK DE UBICACIÓN DE UN DÍA
const checkUbicacion = (dia: any, obraConMapa: boolean) => {
  if (!dia.asistio) return null;
  if (!dia.ubicacion_registro) return { texto: 'Sin ubicación registrada (registro anterior al check GPS)', color: '#9CA3AF', icono: 'location-outline' as const };
  if (dia.ubicacion_registro.simulada) return { texto: 'Ubicación FALSA detectada (app de GPS falso)', color: '#DC2626', icono: 'warning' as const };
  if (dia.distancia_obra_km === null || dia.distancia_obra_km === undefined || !obraConMapa) return { texto: 'Ubicación registrada (la obra no tiene lugar marcado en el mapa)', color: '#3B82F6', icono: 'location' as const };
  return dia.distancia_obra_km <= DISTANCIA_MAXIMA_KM
    ? { texto: `En la obra (${textoDistancia(dia.distancia_obra_km)})`, color: '#059669', icono: 'checkmark-circle' as const }
    : { texto: `Lejos de la obra: ${textoDistancia(dia.distancia_obra_km)}`, color: '#EA580C', icono: 'warning' as const };
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

  // CHECK DE UBICACIÓN: DÓNDE ESTÁ EL TELÉFONO AHORA MISMO. SIN ESTO NO SE PUEDE REGISTRAR ASISTENCIA,
  // PORQUE UNA FOTO SE PUEDE TOMAR EN CUALQUIER LADO.
  const ubicacionActual = async () => {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (!permiso.granted) throw new Error("Para registrar tu asistencia necesitamos tu ubicación: así el contratista comprueba que sí estuviste en la obra. Activa el permiso de ubicación.");
    const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitud: posicion.coords.latitude,
      longitud: posicion.coords.longitude,
      precision: posicion.coords.accuracy ?? null,
      simulada: posicion.mocked === true, // ANDROID AVISA SI ES UNA UBICACIÓN FALSA (APPS DE "FAKE GPS")
    };
  };

  const enviar = async (ubicacion: Awaited<ReturnType<typeof ubicacionActual>> | null, distancia: number | null) => {
    setGuardando(true);
    try {
      const urlEvidencia = evidencia ? await subirFotoACloudinary(evidencia) : null;
      await agregarABitacora(contrato.id, {
        asistio, nota: nota.trim(), evidencia: urlEvidencia,
        ubicacion_registro: ubicacion, distancia_obra_km: distancia === null ? null : Math.round(distancia * 100) / 100,
      });
      setNota(''); setEvidencia(null); setAsistio(true);
      await cargar();
      Alert.alert("Bitácora actualizada", "Tu avance y tu ubicación de hoy quedaron registrados. El contratista los revisará.");
    } catch (error: any) { Alert.alert("No se pudo guardar", error?.message || "Intenta de nuevo."); }
    setGuardando(false);
  };

  const guardar = async () => {
    if (!nota.trim()) { Alert.alert("Aviso", "Describe brevemente qué hiciste o por qué faltaste hoy."); return; }
    if (asistio && !evidencia) { Alert.alert("Evidencia requerida", "Para comprobar tu asistencia, toma una foto de tu avance de hoy."); return; }
    if (!asistio) { enviar(null, null); return; }

    setGuardando(true);
    let ubicacion;
    try { ubicacion = await ubicacionActual(); }
    catch (error: any) { setGuardando(false); Alert.alert("Ubicación necesaria", error?.message || "No se pudo obtener tu ubicación. Intenta de nuevo."); return; }
    setGuardando(false);

    const distancia = distanciaKm(ubicacion, contrato?.vacante?.coordenadas);
    if (distancia !== null && distancia > DISTANCIA_MAXIMA_KM) {
      Alert.alert("Estás lejos de la obra", `Tu ubicación está ${textoDistancia(distancia)} de la obra. El contratista verá esa distancia. ¿Registrar de todos modos?`, [
        { text: "Volver", style: "cancel" },
        { text: "Registrar", onPress: () => enviar(ubicacion, distancia) },
      ]);
      return;
    }
    enviar(ubicacion, distancia);
  };

  const revisar = async (dia: any, veredicto: 'confirmar' | 'rechazar') => {
    if (veredicto === 'rechazar' && !motivoRechazo.trim()) { Alert.alert("Aviso", "Explica qué no es cierto de lo que escribió el trabajador. El administrador lo va a revisar."); return; }
    setGuardando(true);
    try {
      await accionContrato('revisar_bitacora', { id_contrato: contrato.id, id_entrada: dia.id, veredicto, motivo: veredicto === 'rechazar' ? motivoRechazo.trim() : undefined });
      setRechazandoId(null); setMotivoRechazo('');
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
  const puedeRevisar = !esTrabajador && [ESTADOS.ACTIVA, ESTADOS.POR_CONFIRMAR_FIN, ESTADOS.SUSPENDIDA, ESTADOS.FINALIZADA].includes(contrato?.estado);

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
                        <Text style={styles.asistencia}>{dia.asistio ? '✅ Asistió y trabajó' : '❌ No asistió'}</Text>
                        <Text style={styles.nota}>{dia.nota}</Text>
                        {dia.evidencia ? (
                          <TouchableOpacity onPress={() => setFotoGrande(dia.evidencia)}>
                            <Image source={{ uri: dia.evidencia }} style={styles.evidencia} />
                          </TouchableOpacity>
                        ) : null}
                        {(() => {
                          const check = checkUbicacion(dia, !!contrato?.vacante?.coordenadas);
                          if (!check) return null;
                          const { latitud, longitud } = dia.ubicacion_registro || {};
                          return (
                            <View style={styles.check}>
                              <Ionicons name={check.icono} size={15} color={check.color} />
                              <Text style={[styles.checkTexto, { color: check.color }]}>{check.texto}</Text>
                              {latitud ? (
                                <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`)}>
                                  <Text style={styles.verMapa}>Ver en mapa</Text>
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

                  {escribirPermitido && yaRegistroHoy && (
                    <Text style={styles.avisoHoy}>✅ Ya registraste tu avance de hoy. Mañana podrás agregar el siguiente.</Text>
                  )}
                  {escribirPermitido && !yaRegistroHoy && (
                    <View style={styles.formulario}>
                      <Text style={styles.formTitulo}>Reportar avance de hoy ({new Date().toLocaleDateString('es-MX')})</Text>
                      <Text style={styles.etiquetaForm}>¿Asististe a la obra hoy?</Text>
                      <View style={styles.pickerCaja}>
                        <Picker selectedValue={asistio} onValueChange={(v) => setAsistio(v)}>
                          <Picker.Item label="✅ Sí asistí y trabajé" value={true} />
                          <Picker.Item label="❌ No pude asistir" value={false} />
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
                      {asistio && <Text style={styles.avisoGps}>📍 Al guardar se registrará tu ubicación actual como comprobante de que estás en la obra.</Text>}
                      <TouchableOpacity style={styles.botonGuardar} onPress={guardar} disabled={guardando}>
                        {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonGuardarTexto}>Guardar y enviar al contratista</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                  {esTrabajador && contrato?.estado === ESTADOS.SUSPENDIDA && (
                    <Text style={styles.avisoSuspendida}>La obra está suspendida mientras el administrador revisa la cancelación. No se pueden agregar avances.</Text>
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
  encabezadoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 16, flex: 1, marginRight: 10 },
  resumen: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  resumenCaja: { flex: 1, alignItems: 'center' },
  resumenNumero: { fontSize: 18, fontWeight: 'bold' },
  resumenTexto: { fontSize: 10, color: '#6B7280', fontWeight: 'bold', textAlign: 'center' },
  avisoRevisar: { fontSize: 12, color: '#B45309', fontWeight: 'bold', marginBottom: 10 },
  verTodos: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  verTodosTexto: { color: '#3B82F6', fontWeight: 'bold', marginLeft: 5 },
  vacio: { alignItems: 'center', marginVertical: 20 },
  vacioTexto: { color: '#6B7280', textAlign: 'center', marginTop: 10 },
  tarjetaDia: { backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 12, borderLeftWidth: 5 },
  filaDia: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fecha: { fontSize: 14, fontWeight: 'bold', color: '#0D2340' },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 1, marginLeft: 8 },
  etiquetaTexto: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  asistencia: { fontSize: 12, color: '#374151', marginTop: 4, fontWeight: '600' },
  nota: { fontSize: 13, color: '#4B5563', marginTop: 3 },
  evidencia: { width: 110, height: 110, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  rechazo: { fontSize: 12, color: '#EA580C', marginTop: 6, fontStyle: 'italic' },
  check: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 6 },
  checkTexto: { fontSize: 12, fontWeight: 'bold', marginLeft: 5, flex: 1 },
  verMapa: { fontSize: 12, color: '#2563EB', fontWeight: 'bold', marginLeft: 6 },
  avisoGps: { fontSize: 12, color: '#2563EB', marginBottom: 10 },
  notaAdmin: { fontSize: 12, color: '#0D2340', marginTop: 4, fontStyle: 'italic', fontWeight: '600' },
  botonesRevision: { flexDirection: 'row', marginTop: 10, marginHorizontal: -4 },
  botonRevision: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 9, marginHorizontal: 4 },
  botonRevisionTexto: { fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  avisoHoy: { color: '#059669', fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  formulario: { backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 10 },
  formTitulo: { fontSize: 15, fontWeight: 'bold', color: '#0D2340', marginBottom: 10 },
  etiquetaForm: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginBottom: 5, marginTop: 5 },
  pickerCaja: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, color: '#1F2937' },
  subirFoto: { borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12, padding: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', minHeight: 100, marginBottom: 10 },
  subirTexto: { color: '#9CA3AF', fontSize: 12, marginTop: 5 },
  vistaPrevia: { width: '100%', height: 150, borderRadius: 10 },
  botonGuardar: { backgroundColor: '#00D06C', borderRadius: 12, padding: 14, alignItems: 'center' },
  botonGuardarTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  avisoSuspendida: { color: '#DC2626', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
});
