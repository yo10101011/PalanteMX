// REPORTES DE UNA OBRA, VISTOS POR SUS DOS PARTES: LA VERSIÓN DE QUIEN REPORTÓ, LA DE QUIEN FUE REPORTADO
// Y LA DECISIÓN DEL ADMINISTRADOR (QUÉ PASA CON LA OBRA, CON EL DINERO Y SU NOTA).
// LA PERSONA REPORTADA DA AQUÍ SU VERSIÓN (UNA VEZ, CON FOTOS) Y DICE SI ESTÁ DE ACUERDO: ASÍ EL ADMIN DECIDE CON LAS DOS.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { auth } from '../../firebaseConfig';
import { SelectorFotos, subirFotos } from '@/components/selector-fotos';
import { VisorFoto } from '@/components/visor-foto';
import { accionContrato, leerReportesDeObra, TIPO_REPORTE_TEXTO } from '@/lib/contratos';

type Props = {
  contrato: any | null; // null = MODAL CERRADO
  onClose: () => void;
};

const conRol = (nombre?: string, rol?: string) => `${nombre || 'Sin nombre'} (${(rol || 'usuario').toLowerCase()})`;

export function ModalReportesObra({ contrato, onClose }: Props) {
  const [reportes, setReportes] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  // MI VERSIÓN (SOLO SI ME REPORTARON Y AÚN NO RESPONDO)
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [deAcuerdo, setDeAcuerdo] = useState<boolean | null>(null);
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const uid = auth.currentUser?.uid;

  const cargar = async () => {
    if (!contrato?.id) return;
    setCargando(true);
    try { setReportes(await leerReportesDeObra(contrato.id)); }
    catch (error) { console.log('Error leyendo reportes de la obra', error); }
    setCargando(false);
  };

  useEffect(() => { setRespondiendo(null); setReportes([]); if (contrato?.id) cargar(); }, [contrato?.id]);

  const empezarRespuesta = (id: string) => { setRespondiendo(id); setDeAcuerdo(null); setTexto(''); setFotos([]); };

  const enviarVersion = async (queja: any) => {
    if (deAcuerdo === null) { Alert.alert("Aviso", "Di si estás de acuerdo o no con lo que dice."); return; }
    if (!texto.trim()) { Alert.alert("Aviso", "Escribe tu versión de lo que pasó."); return; }
    setEnviando(true);
    try {
      const urls = await subirFotos(fotos);
      await accionContrato('dar_version', { id_contrato: contrato.id, id_queja: queja.id, motivo: texto.trim(), fotos: urls, de_acuerdo: deAcuerdo });
      setRespondiendo(null);
      Alert.alert("Versión enviada", "El administrador decidirá con las dos versiones. Les avisaremos a los dos su decisión.");
      await cargar();
    } catch (error: any) { Alert.alert("No se pudo enviar", error?.message || "Intenta de nuevo."); }
    setEnviando(false);
  };

  const Fotos = ({ lista }: { lista: string[] }) => lista.length === 0 ? null : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
      {lista.map((f, i) => <TouchableOpacity key={i} onPress={() => setFotoGrande(f)}><Image source={{ uri: f }} style={styles.miniatura} /></TouchableOpacity>)}
    </ScrollView>
  );

  return (
    <Modal visible={!!contrato} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fondo} behavior="padding">
        <View style={styles.panel}>
          <View style={styles.encabezado}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>Reportes de la obra</Text>
              <Text style={styles.subtitulo} numberOfLines={1}>{contrato?.titulo_vacante}</Text>
            </View>
            <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={30} color="#FFF" /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
            {cargando ? <ActivityIndicator color="#0D2340" style={{ marginTop: 30 }} />
              : reportes.length === 0 ? <Text style={styles.vacio}>Esta obra no tiene reportes.</Text>
              : reportes.map(q => {
                const resuelta = q.estado === 'Resuelta';
                const meReportaron = q.id_acusado === uid;
                const version = q.version_acusado;
                const fotosReportante = [...new Set([q.foto_evidencia, ...(q.fotos_evidencia || [])].filter(Boolean))] as string[];
                return (
                  <View key={q.id} style={styles.tarjeta}>
                    <View style={styles.filaEntre}>
                      <Text style={styles.tipo}>{TIPO_REPORTE_TEXTO[q.tipo] || 'Reporte'}</Text>
                      <View style={[styles.etiqueta, { backgroundColor: resuelta ? '#059669' : '#F59E0B' }]}>
                        <Text style={styles.etiquetaTexto}>{resuelta ? 'RESUELTO' : 'EN REVISIÓN'}</Text>
                      </View>
                    </View>
                    <Text style={styles.motivo}>{q.motivo}</Text>
                    <Text style={styles.fecha}>{new Date(q.fecha_reporte).toLocaleString('es-MX')}</Text>

                    {/* VERSIÓN DE QUIEN REPORTÓ */}
                    <View style={styles.version}>
                      <Text style={styles.versionTitulo}>Versión de {q.id_reportante === uid ? 'ti' : conRol(q.nombre_reportante, q.rol_reportante)} (quien reportó)</Text>
                      <Text style={styles.versionTexto}>{q.descripcion}</Text>
                      <Fotos lista={fotosReportante} />
                    </View>

                    {/* VERSIÓN DE QUIEN FUE REPORTADO */}
                    <View style={[styles.version, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                      <Text style={styles.versionTitulo}>Versión de {meReportaron ? 'ti' : conRol(q.acusado, q.rol_acusado)} (a quien reportaron)</Text>
                      {version ? (
                        <>
                          <Text style={[styles.acuerdo, { color: version.de_acuerdo ? '#047857' : '#B91C1C' }]}>{version.de_acuerdo ? 'Está de acuerdo con lo que se pide' : 'No está de acuerdo'}</Text>
                          <Text style={styles.versionTexto}>{version.texto}</Text>
                          <Fotos lista={version.fotos || []} />
                        </>
                      ) : (
                        <Text style={[styles.versionTexto, { fontStyle: 'italic' }]}>
                          {resuelta ? 'No dio su versión.' : meReportaron ? 'Todavía no das tu versión. El administrador la tomará en cuenta antes de decidir.' : 'Todavía no da su versión.'}
                        </Text>
                      )}
                    </View>

                    {/* MI VERSIÓN: SOLO SI ME REPORTARON, NO HE RESPONDIDO Y NO SE HA RESUELTO */}
                    {meReportaron && !version && !resuelta && (respondiendo !== q.id ? (
                      <TouchableOpacity style={styles.botonResponder} onPress={() => empezarRespuesta(q.id)}>
                        <Ionicons name="create-outline" size={16} color="#FFF" /><Text style={styles.botonTexto}>Dar mi versión</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.formulario}>
                        <Text style={styles.etiquetaForm}>¿Estás de acuerdo con lo que dice?</Text>
                        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                          <TouchableOpacity style={[styles.opcion, { marginRight: 6 }, deAcuerdo === true && { borderColor: '#047857', backgroundColor: '#ECFDF5' }]} onPress={() => setDeAcuerdo(true)}>
                            <Text style={styles.opcionTexto}>Sí, estoy de acuerdo</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.opcion, deAcuerdo === false && { borderColor: '#B91C1C', backgroundColor: '#FEF2F2' }]} onPress={() => setDeAcuerdo(false)}>
                            <Text style={styles.opcionTexto}>No estoy de acuerdo</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.etiquetaForm}>Tu versión (obligatoria)</Text>
                        <TextInput style={styles.input} multiline value={texto} onChangeText={setTexto}
                          placeholder={deAcuerdo ? 'Ej. Sí cancelé, tuve una emergencia familiar. Devuelvo el adelanto...' : 'Ej. Sí me presenté ese día, aquí están las fotos...'} />
                        <SelectorFotos fotos={fotos} onCambio={setFotos} texto="Fotos que lo prueben (opcional)" />
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                          <TouchableOpacity style={{ padding: 12, marginRight: 6 }} onPress={() => setRespondiendo(null)} disabled={enviando}><Text style={styles.volver}>Volver</Text></TouchableOpacity>
                          <TouchableOpacity style={[styles.botonResponder, { marginTop: 0, paddingHorizontal: 18 }]} onPress={() => enviarVersion(q)} disabled={enviando}>
                            {enviando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonTexto}>Enviar mi versión</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    {/* DECISIÓN DEL ADMINISTRADOR */}
                    {resuelta ? (
                      <View style={styles.decision}>
                        <Text style={styles.decisionTitulo}>Decisión del administrador</Text>
                        {q.resolucion ? <Text style={styles.decisionTexto}>{q.resolucion}</Text> : null}
                        {q.nota_admin ? <Text style={styles.decisionNota}>Nota: "{q.nota_admin}"</Text> : null}
                        {q.fecha_resolucion ? <Text style={styles.fecha}>{new Date(q.fecha_resolucion).toLocaleDateString('es-MX')}{q.atendida_por ? ` · ${q.atendida_por}` : ''}</Text> : null}
                      </View>
                    ) : (
                      <Text style={styles.pendiente}>El administrador está revisando el caso. Les avisaremos a los dos su decisión.</Text>
                    )}
                  </View>
                );
              })}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', paddingTop: 40 },
  panel: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  encabezado: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D2340', padding: 16 },
  titulo: { color: '#FFF', fontSize: 19, fontWeight: 'bold' },
  subtitulo: { color: '#9CA3AF', fontSize: 14 },
  vacio: { color: '#9CA3AF', textAlign: 'center', marginTop: 30 },
  tarjeta: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipo: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', flex: 1 },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  etiquetaTexto: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  motivo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340', marginTop: 4 },
  fecha: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  version: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, marginTop: 10 },
  versionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 4 },
  versionTexto: { fontSize: 15, color: '#4B5563', lineHeight: 21 },
  acuerdo: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  miniatura: { width: 64, height: 64, borderRadius: 8, marginRight: 8, backgroundColor: '#E5E7EB' },
  botonResponder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  botonTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 6 },
  formulario: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 },
  etiquetaForm: { fontSize: 14, fontWeight: 'bold', color: '#6B7280', marginBottom: 6 },
  opcion: { flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, alignItems: 'center' },
  opcionTexto: { fontWeight: 'bold', color: '#1F2937', fontSize: 14, textAlign: 'center' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, height: 100, textAlignVertical: 'top', fontSize: 16, color: '#1F2937', marginBottom: 10 },
  volver: { color: '#6B7280', fontWeight: 'bold' },
  decision: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 10, padding: 10, marginTop: 10 },
  decisionTitulo: { fontSize: 13, fontWeight: 'bold', color: '#065F46', marginBottom: 4 },
  decisionTexto: { fontSize: 15, color: '#065F46', fontWeight: '600', lineHeight: 21 },
  decisionNota: { fontSize: 14, color: '#047857', marginTop: 4 },
  pendiente: { fontSize: 14, color: '#B45309', fontWeight: '600', marginTop: 10 },
});
