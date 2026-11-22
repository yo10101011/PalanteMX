// TARJETA DE UN CONTRATO (OBRA): QUIÉN ES LA OTRA PARTE, LA VACANTE, SU ESTADO Y LOS BOTONES QUE TOQUEN.
// LA USAN LOS PANELES DEL TRABAJADOR Y DEL CONTRATISTA, CADA UNO CON SUS PROPIOS BOTONES.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VisorFoto } from '@/components/visor-foto';
import { VistaCondiciones } from '@/components/condiciones-obra';
import { abrirWhatsApp, llamar, telefonoValido } from '@/components/botones-contacto';

const COLOR_PELIGRO = '#DC2626'; // CANCELAR / RECHAZAR
import { ajustesDePago, estiloEstado, hayTrato, pagosPorConfirmar, textoDiasObra, tieneReporteAbierto } from '@/lib/contratos';

export type BotonContrato = {
  texto: string;
  icono: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  relleno?: boolean; // true = botón de color sólido; false = solo borde
};

type Props = {
  contrato: any;
  otraParte: { nombre: string; foto?: string; detalle?: string; telefono?: string };
  aviso?: string; // TEXTO DESTACADO (P. EJ. "ESPERANDO A QUE EL TRABAJADOR ACEPTE")
  botones: BotonContrato[];
  deshabilitado?: boolean;
};

export function TarjetaContrato({ contrato, otraParte, aviso, botones, deshabilitado }: Props) {
  const estado = estiloEstado(contrato.estado);
  const vacante = contrato.vacante || {};
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const insets = useSafeAreaInsets();

  // LOS BOTONES SE ACOMODAN EN TRES GRUPOS PARA QUE NO SE VEAN AMONTONADOS:
  //   principales = LOS DE COLOR SÓLIDO (SI NO HAY, EL PRIMERO); contacto = CHAT + WHATSAPP + LLAMAR; resto = "MÁS OPCIONES"
  const esChat = (b: BotonContrato) => b.texto === 'Chatear';
  const conRelleno = botones.filter(b => b.relleno);
  const principales = conRelleno.length ? conRelleno : botones.filter(b => !esChat(b)).slice(0, 1);
  const contacto: BotonContrato[] = [
    ...botones.filter(b => esChat(b) && !principales.includes(b)).map(b => ({ ...b, texto: 'Chat' })),
    ...(hayTrato(contrato) && telefonoValido(otraParte.telefono) ? [
      { texto: 'WhatsApp', icono: 'logo-whatsapp' as const, color: '#16A34A', onPress: () => abrirWhatsApp(otraParte.telefono!, `Hola ${otraParte.nombre.split(' ')[0]}, te escribo por la obra "${contrato.titulo_vacante || vacante.titulo || ''}" de PalanteMX.`) },
      { texto: 'Llamar', icono: 'call-outline' as const, color: '#0D2340', onPress: () => llamar(otraParte.telefono!) },
    ] : []),
  ];
  // LOS DE PELIGRO (CANCELAR, RECHAZAR) VAN AL FINAL DE LA LISTA
  const resto = botones.filter(b => !principales.includes(b) && !esChat(b))
    .sort((a, b) => Number(a.color === COLOR_PELIGRO) - Number(b.color === COLOR_PELIGRO));

  return (
    <View style={[styles.tarjeta, { borderLeftColor: estado.color }]}>
      <View style={styles.encabezado}>
        <TouchableOpacity onPress={() => otraParte.foto && setFotoGrande(otraParte.foto)}>
          <Image source={{ uri: otraParte.foto || undefined }} style={styles.foto} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={2}>{contrato.titulo_vacante || vacante.titulo}</Text>
          <Text style={styles.subtitulo} numberOfLines={1}>{otraParte.nombre}{otraParte.detalle ? ` • ${otraParte.detalle}` : ''}</Text>
        </View>
      </View>

      <View style={[styles.etiqueta, { backgroundColor: estado.color }]}>
        <Text style={styles.etiquetaTexto}>{estado.texto}</Text>
      </View>

      {/* FOTO DE LA OBRA: SE TOCA PARA VERLA COMPLETA */}
      {vacante.foto_trabajo ? (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setFotoGrande(vacante.foto_trabajo)}>
          <Image source={{ uri: vacante.foto_trabajo }} style={styles.fotoObra} />
          <View style={styles.fotoAviso}><Ionicons name="expand-outline" size={12} color="#FFF" /><Text style={styles.fotoAvisoTexto}>Toca para ver completa</Text></View>
        </TouchableOpacity>
      ) : null}

      {(vacante.ubicacion || vacante.pago || vacante.horario || vacante.descripcion || contrato.inicio_obra) ? (
        <View style={styles.detalles}>
          {vacante.ubicacion ? <View style={styles.fila}><Ionicons name="location-outline" size={14} color="#6B7280" /><Text style={styles.detalleTexto}>{vacante.ubicacion}</Text></View> : null}
          {vacante.pago ? <View style={styles.fila}><Ionicons name="cash-outline" size={14} color="#00D06C" /><Text style={[styles.detalleTexto, { color: '#00D06C', fontWeight: 'bold' }]}>{vacante.pago}</Text></View> : null}
          {vacante.horario ? <View style={styles.fila}><Ionicons name="time-outline" size={14} color="#B45309" /><Text style={styles.detalleTexto}>{vacante.horario}</Text></View> : null}
          {contrato.inicio_obra ? <View style={styles.fila}><Ionicons name="calendar-outline" size={14} color="#1D4ED8" /><Text style={[styles.detalleTexto, { color: '#1D4ED8', fontWeight: 'bold' }]}>{textoDiasObra(contrato)}</Text></View> : null}
          {contrato.fecha_inicio ? <View style={styles.fila}><Ionicons name="calendar-outline" size={14} color="#6B7280" /><Text style={styles.detalleTexto}>Trato cerrado: {contrato.fecha_inicio}{contrato.fecha_fin ? ` • Terminó: ${contrato.fecha_fin}` : ''}</Text></View> : null}
          {vacante.lugar_texto ? <View style={styles.fila}><Ionicons name="pin-outline" size={14} color="#DC2626" /><Text style={styles.detalleTexto}>Lugar de la obra: {vacante.lugar_texto}</Text></View> : null}
          {vacante.descripcion ? <Text style={styles.descripcion}>{vacante.descripcion}</Text> : null}
        </View>
      ) : null}
      <VistaCondiciones condiciones={vacante.condiciones} titulo="Lo que prometió el contratista al publicar" />

      {aviso ? <Text style={[styles.aviso, { color: estado.color }]}>{aviso}</Text> : null}

      {/* MIENTRAS EL ADMIN REVISA UN REPORTE DE ESTA OBRA, NO SE PUEDE TERMINAR */}
      {tieneReporteAbierto(contrato) ? (
        <View style={[styles.franja, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
          <Ionicons name="hourglass-outline" size={16} color="#B45309" />
          <Text style={[styles.franjaTexto, { color: '#92400E' }]}>Hay un reporte en revisión por el administrador. La obra no se puede terminar hasta que lo resuelva; les avisaremos a los dos.</Text>
        </View>
      ) : null}
      {/* AJUSTES DE DINERO QUE ORDENÓ EL ADMIN Y PAGOS QUE FALTA CONFIRMAR */}
      {ajustesDePago(contrato).map((a: any, i: number) => (
        <View key={i} style={[styles.franja, a.tipo === 'extra' ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' } : { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
          <Ionicons name={a.tipo === 'extra' ? 'add-circle-outline' : 'remove-circle-outline'} size={16} color={a.tipo === 'extra' ? '#047857' : '#B91C1C'} />
          <Text style={[styles.franjaTexto, { color: a.tipo === 'extra' ? '#065F46' : '#991B1B' }]}>Admin: {a.texto}</Text>
        </View>
      ))}
      {pagosPorConfirmar(contrato).length > 0 ? (
        <View style={[styles.franja, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <Ionicons name="cash-outline" size={16} color="#B45309" />
          <Text style={[styles.franjaTexto, { color: '#92400E' }]}>{pagosPorConfirmar(contrato).length} pago(s) esperando que el trabajador confirme que los recibió.</Text>
        </View>
      ) : null}

      {/* 1. LO PRINCIPAL (BOTÓN DE COLOR) A TODO LO ANCHO */}
      {principales.map((boton, i) => (
        <TouchableOpacity key={i} style={[styles.botonPrincipal, { backgroundColor: boton.color }, deshabilitado && { opacity: 0.5 }]} onPress={boton.onPress} disabled={deshabilitado}>
          <Ionicons name={boton.icono} size={18} color="#FFF" />
          <Text style={styles.botonPrincipalTexto}>{boton.texto}</Text>
        </TouchableOpacity>
      ))}

      {/* 2. CONTACTO EN UNA SOLA FILA: CHAT, Y WHATSAPP / LLAMAR SOLO CUANDO YA HAY TRATO ACEPTADO POR LOS DOS */}
      {contacto.length > 0 && (
        <View style={styles.filaContacto}>
          {contacto.map((c, i) => (
            <TouchableOpacity key={i} style={[styles.botonContacto, { borderColor: c.color }, deshabilitado && { opacity: 0.5 }]} onPress={c.onPress} disabled={deshabilitado}>
              <Ionicons name={c.icono} size={18} color={c.color} />
              <Text style={[styles.botonContactoTexto, { color: c.color }]}>{c.texto}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 3. TODO LO DEMÁS, EN "MÁS OPCIONES" (SE ABRE UNA LISTA DESDE ABAJO). SI SOLO QUEDA UNO, SE MUESTRA DIRECTO */}
      {resto.length === 1 ? (
        <TouchableOpacity style={[styles.botonMas, { borderColor: resto[0].color }, deshabilitado && { opacity: 0.5 }]} onPress={resto[0].onPress} disabled={deshabilitado}>
          <Ionicons name={resto[0].icono} size={17} color={resto[0].color} />
          <Text style={[styles.botonMasTexto, { color: resto[0].color }]}>{resto[0].texto}</Text>
        </TouchableOpacity>
      ) : resto.length > 1 ? (
        <TouchableOpacity style={[styles.botonMas, deshabilitado && { opacity: 0.5 }]} onPress={() => setMenuAbierto(true)} disabled={deshabilitado}>
          <Ionicons name="ellipsis-horizontal-circle-outline" size={18} color="#0D2340" />
          <Text style={styles.botonMasTexto}>Más opciones ({resto.length})</Text>
          <Ionicons name="chevron-down" size={16} color="#0D2340" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={menuAbierto} transparent animationType="slide" onRequestClose={() => setMenuAbierto(false)}>
        <TouchableOpacity style={styles.menuFondo} activeOpacity={1} onPress={() => setMenuAbierto(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.menu, { paddingBottom: 28 + insets.bottom }]}>
            <View style={styles.menuAsa} />
            <Text style={styles.menuTitulo} numberOfLines={2}>{contrato.titulo_vacante || vacante.titulo}</Text>
            <Text style={styles.menuSubtitulo}>{otraParte.nombre}</Text>
            {resto.map((boton, i) => {
              const peligro = boton.color === COLOR_PELIGRO;
              return (
                <TouchableOpacity key={i} style={[styles.menuFila, peligro && styles.menuFilaPeligro]} onPress={() => { setMenuAbierto(false); setTimeout(boton.onPress, 250); }}>
                  <View style={[styles.menuIcono, { backgroundColor: `${boton.color}1A` }]}><Ionicons name={boton.icono} size={20} color={boton.color} /></View>
                  <Text style={[styles.menuTexto, peligro && { color: COLOR_PELIGRO }]}>{boton.texto}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.menuCerrar} onPress={() => setMenuAbierto(false)}><Text style={styles.menuCerrarTexto}>Cerrar</Text></TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <VisorFoto uri={fotoGrande} onClose={() => setFotoGrande(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, borderLeftWidth: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  encabezado: { flexDirection: 'row', alignItems: 'center' },
  foto: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#E5E7EB' },
  titulo: { fontSize: 17, fontWeight: 'bold', color: '#0D2340' },
  subtitulo: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  etiqueta: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 10 },
  etiquetaTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  detalles: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detalleTexto: { fontSize: 14, color: '#4B5563', marginLeft: 6, flexShrink: 1 },
  descripcion: { fontSize: 14, color: '#4B5563', marginTop: 4, lineHeight: 20 },
  fotoObra: { width: '100%', height: 170, borderRadius: 12, marginTop: 10, backgroundColor: '#E5E7EB' },
  fotoAviso: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fotoAvisoTexto: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  aviso: { fontSize: 14, fontWeight: 'bold', marginTop: 10 },
  franja: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 10 },
  franjaTexto: { fontSize: 14, fontWeight: '600', marginLeft: 6, flex: 1 },
  botonPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12, marginTop: 12 },
  botonPrincipalTexto: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  filaContacto: { flexDirection: 'row', marginTop: 10, marginHorizontal: -4 },
  botonContacto: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 9, marginHorizontal: 4 },
  botonContactoTexto: { fontSize: 14, fontWeight: 'bold', marginLeft: 5 },
  botonMas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10, marginTop: 10 },
  botonMasTexto: { fontSize: 15, fontWeight: 'bold', color: '#0D2340', marginHorizontal: 6 },
  menuFondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menu: { backgroundColor: '#FFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingBottom: 28, paddingTop: 10 },
  menuAsa: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB', marginBottom: 12 },
  menuTitulo: { fontSize: 18, fontWeight: 'bold', color: '#0D2340' },
  menuSubtitulo: { fontSize: 14, color: '#6B7280', marginTop: 2, marginBottom: 10 },
  menuFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderColor: '#F1F5F9' },
  menuFilaPeligro: { marginTop: 6, borderColor: '#FEE2E2' },
  menuIcono: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuTexto: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1F2937' },
  menuCerrar: { marginTop: 12, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  menuCerrarTexto: { fontSize: 16, fontWeight: 'bold', color: '#374151' },
});
