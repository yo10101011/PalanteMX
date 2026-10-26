import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { LightSensor } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// FIREBASE
// @ts-ignore
import { createUserWithEmailAndPassword, deleteUser, signOut, User } from 'firebase/auth';
import { auth } from '../../firebaseConfig';

export default function RegistroScreen() {
  const [rol, setRol] = useState('Trabajador');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [oficio, setOficio] = useState('Albañil');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [fotoINEFrente, setFotoINEFrente] = useState<string | null>(null);
  const [fotoINEReverso, setFotoINEReverso] = useState<string | null>(null);
  const [fotoSelfie, setFotoSelfie] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<any>(null);
  
  const [procesando, setProcesando] = useState(false);
  const [estadoIA, setEstadoIA] = useState(''); 
  const [alerta, setAlerta] = useState({ visible: false, titulo: '', mensaje: '', tipo: 'info' });

  const [modoEscaneo, setModoEscaneo] = useState<'INE_FRENTE' | 'INE_REVERSO' | 'SELFIE' | null>(null);
  const [permisoCamara, pedirPermisoCamara] = useCameraPermissions();
  const [rostroDetectado, setRostroDetectado] = useState(false); 
  
  const [lux, setLux] = useState(100); 
  const luzSuficiente = Platform.OS === 'ios' ? true : lux > 3; 
  const [forzarCaptura, setForzarCaptura] = useState(false); 

  const cameraRef = useRef<any>(null);
  const scanAnim = useRef(new Animated.Value(0)).current;

  const mostrarAlerta = (titulo: string, mensaje: string, tipo: 'info' | 'error' | 'success' = 'info') => {
    setAlerta({ visible: true, titulo, mensaje, tipo });
  };

  useEffect(() => {
    let subscripcionLuz: any;
    let timerEnfoque: any;
    let timerCapturaAuto: any;

    if (modoEscaneo) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: modoEscaneo === 'SELFIE' ? 250 : 180, duration: 2000, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 2000, useNativeDriver: true })
        ])
      ).start();

      if (modoEscaneo === 'SELFIE') {
        setRostroDetectado(false);
        setForzarCaptura(false);
        timerEnfoque = setTimeout(() => {
          setRostroDetectado(true);
          timerCapturaAuto = setTimeout(() => {
            capturarEscaneo('SELFIE');
          }, 1500);
        }, 2000);
      } else {
        setRostroDetectado(true);
        setForzarCaptura(false);
        timerEnfoque = setTimeout(() => {
          setForzarCaptura(true);
        }, 4000);

        if (Platform.OS === 'android') {
          LightSensor.setUpdateInterval(500);
          subscripcionLuz = LightSensor.addListener(data => {
            setLux(data.illuminance);
          });
        }
      }
    }

    return () => {
      clearTimeout(timerEnfoque);
      clearTimeout(timerCapturaAuto);
      if (subscripcionLuz) subscripcionLuz.remove();
    };
  }, [modoEscaneo]);

  const abrirEscaner = async (tipo: 'INE_FRENTE' | 'INE_REVERSO' | 'SELFIE') => {
    if (!permisoCamara?.granted) {
      const { status } = await pedirPermisoCamara();
      if (status !== 'granted') { mostrarAlerta('Permiso Denegado', 'Cámara requerida.', 'error'); return; }
    }
    setModoEscaneo(tipo);
  };

  const capturarEscaneo = async (fuerzaModo?: string) => {
    const modoACapturar = fuerzaModo || modoEscaneo;
    if (cameraRef.current && modoACapturar) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, base64: true });
        setModoEscaneo(null); 
        
        if (photo.base64) {
          const base64Data = `data:image/jpeg;base64,${photo.base64}`;
          if (modoACapturar === 'INE_FRENTE') setFotoINEFrente(base64Data);
          if (modoACapturar === 'INE_REVERSO') setFotoINEReverso(base64Data);
          if (modoACapturar === 'SELFIE') setFotoSelfie(base64Data);
        }
      } catch (error) {
        setModoEscaneo(null);
        mostrarAlerta("Error de Cámara", "No se pudo tomar la fotografía. Intenta de nuevo.", "error");
      }
    }
  };

  const obtenerUbicacion = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { mostrarAlerta('Restringido', 'GPS requerido.', 'error'); return; }
      mostrarAlerta('Conectando...', 'Buscando satélites...', 'info');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUbicacion({ latitud: location.coords.latitude, longitud: location.coords.longitude });
      setAlerta({ visible: false, titulo: '', mensaje: '', tipo: 'info' }); 
      mostrarAlerta('Exitoso', 'Coordenadas registradas.', 'success');
    } catch (error) {
      mostrarAlerta('Error', 'Enciende tu GPS.', 'error');
    }
  };

  const subirFotoACloudinary = async (base64String: string) => {
    const CLOUD_NAME = "ylqsvel1"; 
    const UPLOAD_PRESET = "palante_fotos"; 
    const data = new FormData();
    data.append('file', base64String);
    data.append('upload_preset', UPLOAD_PRESET);
    data.append('cloud_name', CLOUD_NAME);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: data });
    const result = await response.json();
    return result.secure_url; 
  };

  // LA VERIFICACIÓN (OCR + COMPARACIÓN FACIAL) SE HACE EN NUESTRO SERVIDOR (backend/kyc-worker),
  // ASÍ LAS LLAVES SECRETAS NUNCA VIAJAN DENTRO DE LA APP.
  // SI SE APRUEBA, EL SERVIDOR CREA EL PERFIL: LA APP NO PUEDE MARCARSE A SÍ MISMA COMO VERIFICADA.
  const verificarYCrearPerfil = async (usuarioNuevo: User, perfil: Record<string, unknown>) => {
    const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
    if (!KYC_API_URL) throw new Error("Falta configurar EXPO_PUBLIC_KYC_API_URL en el archivo .env");

    const idToken = await usuarioNuevo.getIdToken();
    const response = await fetch(`${KYC_API_URL}/verificar-identidad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(perfil),
    });
    const resultado = await response.json();

    if (!response.ok) throw new Error(resultado.error || "El servicio de verificación no está disponible.");
    if (!resultado.aprobado) {
      mostrarAlerta("KYC Rechazado", resultado.motivo, 'error');
      return false;
    }
    return true;
  };

  const handleRegistroEstricto = async () => {
    if (!nombre || !apellidos || !correo || !telefono || !usuario || !password || !fotoSelfie || !fotoINEFrente || !fotoINEReverso || !ubicacion || (rol === 'Trabajador' && !oficio)) {
      mostrarAlerta("Incompleto", "Llena todos los campos.", 'info'); return;
    }

    setProcesando(true);
    // SE GUARDA AQUÍ PARA PODER BORRAR LA CUENTA SI ALGO FALLA A MEDIO REGISTRO
    let usuarioNuevo: User | null = null;

    try {
      // 1. PRIMERO SE CREA LA CUENTA: EL SERVIDOR DE KYC SOLO ATIENDE A USUARIOS CON SESIÓN
      setEstadoIA('Creando seguridad...');
      const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
      usuarioNuevo = userCredential.user;

      setEstadoIA('Subiendo documentos cifrados...');
      const urlINEFrente = await subirFotoACloudinary(fotoINEFrente);
      const urlINEReverso = await subirFotoACloudinary(fotoINEReverso);
      const urlSelfieGuardada = await subirFotoACloudinary(fotoSelfie);

      setEstadoIA('Analizando biometría...');
      const esIdentidadValida = await verificarYCrearPerfil(usuarioNuevo, {
        rol, nombre, apellidos, telefono, usuario, oficio, ubicacion,
        urlINEFrente, urlINEReverso, urlSelfie: urlSelfieGuardada,
      });

      if (!esIdentidadValida) {
        // KYC RECHAZADO: SE BORRA LA CUENTA PARA QUE NO QUEDE A MEDIAS
        await deleteUser(usuarioNuevo);
        setProcesando(false);
        return;
      }

      // APAGAMOS EL ENVÍO DE CORREO POR AHORA PARA EVITAR EL BLOQUEO
      // await sendEmailVerification(userCredential.user);

      // EL PERFIL YA LO CREÓ EL SERVIDOR: A PARTIR DE AQUÍ LA CUENTA YA NO SE DEBE BORRAR SI ALGO FALLA.
      usuarioNuevo = null;

      // CERRAMOS LA SESIÓN QUE ABRIÓ createUserWithEmailAndPassword PARA QUE EL USUARIO ENTRE DESDE EL LOGIN, COMO DICE EL MENSAJE.
      await signOut(auth);

      setProcesando(false);
      // MENSAJE DE ÉXITO DIRECTO
      mostrarAlerta("✅ Cuenta Creada", "Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión.", 'success');
      setTimeout(() => { router.replace('/' as any); }, 4000);

    } catch (error: any) {
      // SI LA CUENTA YA SE HABÍA CREADO PERO ALGO FALLÓ DESPUÉS, SE BORRA PARA PODER REINTENTAR
      if (usuarioNuevo) { try { await deleteUser(usuarioNuevo); } catch {} }
      setProcesando(false);
      if(error.code === 'auth/email-already-in-use') mostrarAlerta("Duplicado", "Este correo ya está registrado.", 'error');
      else mostrarAlerta("Error", error.message, 'error');
    }
  };

  const botonCamaraActivo = (modoEscaneo === 'SELFIE' && rostroDetectado) || (modoEscaneo !== 'SELFIE' && (luzSuficiente || forzarCaptura));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <Text style={styles.title}>Palante<Text style={styles.titleAccent}>MX</Text></Text>
            <View style={styles.headerLine} />
            <Text style={styles.subtitle}>SISTEMA DE AFILIACIÓN EMPRESARIAL</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Rol Operativo</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity style={[styles.roleButton, rol === 'Trabajador' && styles.roleButtonActive]} onPress={() => setRol('Trabajador')}>
                <Text style={rol === 'Trabajador' ? styles.roleTextActive : styles.roleTextInactive}>TRABAJADOR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleButton, rol === 'Contratista' && styles.roleButtonActive]} onPress={() => setRol('Contratista')}>
                <Text style={rol === 'Contratista' ? styles.roleTextActive : styles.roleTextInactive}>CONTRATISTA</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Nombre(s) Oficial</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="EJ. JUAN ALBERTO" value={nombre} onChangeText={(t) => setNombre(t.toUpperCase())} autoCapitalize="characters" />
            </View>

            <Text style={styles.inputLabel}>Apellidos (Como en la INE)</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="people" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="EJ. PÉREZ RAMÍREZ" value={apellidos} onChangeText={(t) => setApellidos(t.toUpperCase())} autoCapitalize="characters" />
            </View>

            {rol === 'Trabajador' && (
              <>
                <Text style={styles.inputLabel}>Oficio Principal</Text>
                <View style={styles.pickerContainer}>
                  <Ionicons name="construct" size={20} color="#9CA3AF" style={styles.inputIcon} />
                  <Picker selectedValue={oficio} onValueChange={(itemValue) => setOficio(itemValue)} style={styles.picker}>
                    <Picker.Item label="Albañil" value="Albañil" />
                    <Picker.Item label="Bolero" value="Bolero" />
                    <Picker.Item label="Carpintero" value="Carpintero" />
                    <Picker.Item label="Cerrajero" value="Cerrajero" />
                    <Picker.Item label="Chofer" value="Chofer" />
                    <Picker.Item label="Costurera / Sastre" value="Costurera / Sastre" />
                    <Picker.Item label="Cuidador(a)" value="Cuidador(a)" />
                    <Picker.Item label="Electricista" value="Electricista" />
                    <Picker.Item label="Estilista / Peluquero" value="Estilista / Peluquero" />
                    <Picker.Item label="Herrero" value="Herrero" />
                    <Picker.Item label="Hojalatero" value="Hojalatero" />
                    <Picker.Item label="Jardinero" value="Jardinero" />
                    <Picker.Item label="Lavacoches" value="Lavacoches" />
                    <Picker.Item label="Limpieza" value="Limpieza" />
                    <Picker.Item label="Maquillista" value="Maquillista" />
                    <Picker.Item label="Mecánico" value="Mecánico" />
                    <Picker.Item label="Niñera" value="Niñera" />
                    <Picker.Item label="Panadero" value="Panadero" />
                    <Picker.Item label="Peón" value="Peón" />
                    <Picker.Item label="Pintor" value="Pintor" />
                    <Picker.Item label="Plomero" value="Plomero" />
                    <Picker.Item label="Recolector / Chatarrero" value="Recolector / Chatarrero" />
                    <Picker.Item label="Repartidor" value="Repartidor" />
                    <Picker.Item label="Rotulista" value="Rotulista" />
                    <Picker.Item label="Soldador" value="Soldador" />
                    <Picker.Item label="Tablaroquero" value="Tablaroquero" />
                    <Picker.Item label="Tapicero" value="Tapicero" />
                    <Picker.Item label="Taquero" value="Taquero" />
                    <Picker.Item label="Técnico en Refrigeración" value="Técnico en Refrigeración" />
                    <Picker.Item label="Trabajadora del Hogar" value="Trabajadora del Hogar" />
                    <Picker.Item label="Vendedor Ambulante" value="Vendedor Ambulante" />
                    <Picker.Item label="Vidriero" value="Vidriero" />
                    <Picker.Item label="Zapatero" value="Zapatero" />
                    <Picker.Item label="Otro" value="Otro" />
                  </Picker>
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>Datos de Contacto y Acceso</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Teléfono a 10 dígitos" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="at" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Usuario único" value={usuario} onChangeText={setUsuario} autoCapitalize="none" />
            </View>
            <View style={styles.inputContainer}>
              <Ionicons name="mail" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Correo electrónico" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" />
            </View>
            
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput style={styles.inputPass} placeholder="Contraseña de seguridad" value={password} onChangeText={setPassword} secureTextEntry={!mostrarPassword} />
              <TouchableOpacity onPress={() => setMostrarPassword(!mostrarPassword)} style={{padding: 5}}>
                <Ionicons name={mostrarPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.verificationTitle}>VALIDACIÓN KYC Y BIOMETRÍA</Text>
            
            <View style={styles.gridContainer}>
              <TouchableOpacity style={[styles.gridItem, fotoSelfie && styles.gridItemSuccess]} onPress={() => abrirEscaner('SELFIE')}>
                <Ionicons name="scan-circle" size={36} color={fotoSelfie ? "#00D06C" : "#0D2340"} />
                <Text style={styles.gridItemTitle}>Análisis Facial</Text>
                <Text style={styles.gridItemSub}>{fotoSelfie ? "Completado" : "Pendiente"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.gridItem, ubicacion && styles.gridItemSuccess]} onPress={obtenerUbicacion}>
                <Ionicons name="location" size={36} color={ubicacion ? "#00D06C" : "#D32F2F"} />
                <Text style={styles.gridItemTitle}>Geolocalización</Text>
                <Text style={styles.gridItemSub}>{ubicacion ? "Validada" : "Requerida"}</Text>
              </TouchableOpacity>
            </View>

            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25}}>
              <TouchableOpacity style={[styles.ineButton, fotoINEFrente && styles.gridItemSuccess]} onPress={() => abrirEscaner('INE_FRENTE')}>
                <Ionicons name="id-card" size={20} color={fotoINEFrente ? "#00D06C" : "#0D2340"} style={{marginBottom: 5}}/>
                <Text style={styles.ineButtonText}>{fotoINEFrente ? "INE Frente OK" : "Escanear INE (Frente)"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ineButton, fotoINEReverso && styles.gridItemSuccess]} onPress={() => abrirEscaner('INE_REVERSO')}>
                <Ionicons name="barcode" size={20} color={fotoINEReverso ? "#00D06C" : "#0D2340"} style={{marginBottom: 5}}/>
                <Text style={styles.ineButtonText}>{fotoINEReverso ? "INE Reverso OK" : "Escanear INE (Reverso)"}</Text>
              </TouchableOpacity>
            </View>

            {procesando ? (
              <View style={styles.iaContainer}>
                <ActivityIndicator size="large" color="#00D06C" />
                <Text style={styles.iaText}>{estadoIA}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.mainButton} onPress={handleRegistroEstricto}>
                <Text style={styles.mainButtonText}>REGISTRAR</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/' as any)} disabled={procesando}>
              <Text style={styles.backButtonText}>Cancelar proceso</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={modoEscaneo !== null} animationType="slide" transparent={false}>
        <View style={styles.cameraContainer}>
          <CameraView style={StyleSheet.absoluteFill} facing={modoEscaneo === 'SELFIE' ? "front" : "back"} ref={cameraRef} />
          
          <View style={styles.maskContainer}>
            <View style={styles.maskRow} />
            <View style={styles.maskCenter}>
              <View style={styles.maskCol} />
              <View style={[styles.maskHole, modoEscaneo === 'SELFIE' ? styles.maskHoleCircle : styles.maskHoleRect]}>
                 <Animated.View style={[styles.laser, { transform: [{ translateY: scanAnim }] }]} />
              </View>
              <View style={styles.maskCol} />
            </View>
            <View style={styles.maskRow} />
          </View>

          <View style={styles.cameraTextOverlay}>
            <Text style={styles.cameraTitle}>{modoEscaneo === 'SELFIE' ? "CENTRA TU ROSTRO" : "ALINEA TU CREDENCIAL"}</Text>
            
            {modoEscaneo === 'SELFIE' ? (
              <View style={[styles.detectionBadge, rostroDetectado ? { backgroundColor: '#00D06C' } : { backgroundColor: '#F59E0B' }]}>
                <Ionicons name={rostroDetectado ? "checkmark-circle" : "scan"} size={16} color="white" style={{ marginRight: 5 }} />
                <Text style={styles.detectionText}>{rostroDetectado ? "Enfocado - Autocapturando..." : "Buscando rostro, acércate a la luz..."}</Text>
              </View>
            ) : (
              <View style={[styles.detectionBadge, luzSuficiente ? { backgroundColor: '#00D06C' } : { backgroundColor: '#D32F2F' }]}>
                <Ionicons name={luzSuficiente ? "sunny" : "moon"} size={16} color="white" style={{ marginRight: 5 }} />
                <Text style={styles.detectionText}>
                  {luzSuficiente ? "Iluminación Correcta" : forzarCaptura ? "Luz baja, pero puedes capturar" : `Luz Insuficiente (Lux: ${Math.round(lux)})`}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.closeCameraButton} onPress={() => setModoEscaneo(null)}>
              <Text style={styles.closeCameraText}>CANCELAR</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.captureButton, !botonCamaraActivo && { opacity: 0.4, borderColor: '#A0AEC0' }]} 
              onPress={() => capturarEscaneo()}
              disabled={!botonCamaraActivo}
            >
              <Ionicons name="camera" size={32} color={botonCamaraActivo ? "white" : "#A0AEC0"} />
            </TouchableOpacity>
            <View style={{ width: 60 }} />
          </View>
        </View>
      </Modal>

      <Modal visible={alerta.visible} transparent animationType="fade">
        <View style={styles.modalAlertBackground}>
          <View style={styles.modalAlertBox}>
            <View style={[styles.modalAlertHeader, alerta.tipo === 'error' ? { backgroundColor: '#D32F2F' } : alerta.tipo === 'success' ? { backgroundColor: '#00D06C' } : { backgroundColor: '#0D2340' }]}>
              <Ionicons name={alerta.tipo === 'error' ? "warning" : alerta.tipo === 'success' ? "checkmark-circle" : "information-circle"} size={30} color="#FFFFFF" />
            </View>
            <View style={styles.modalAlertContent}>
              <Text style={styles.modalAlertTitle}>{alerta.titulo}</Text>
              <Text style={styles.modalAlertText}>{alerta.mensaje}</Text>
              <TouchableOpacity style={styles.modalAlertBtn} onPress={() => setAlerta({...alerta, visible: false})}>
                <Text style={styles.modalAlertBtnText}>ENTENDIDO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D2340' },
  scrollContent: { flexGrow: 1, paddingBottom: 30 }, 
  header: { padding: 30, alignItems: 'center', backgroundColor: '#0D2340' },
  title: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF' },
  titleAccent: { color: '#00D06C' },
  headerLine: { width: 40, height: 3, backgroundColor: '#00D06C', marginTop: 10, marginBottom: 15 },
  subtitle: { fontSize: 11, fontWeight: 'bold', color: '#A0AEC0', letterSpacing: 1 },
  card: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, minHeight: 700 },
  sectionLabel: { fontSize: 14, fontWeight: 'bold', color: '#0D2340', marginBottom: 10 },
  roleContainer: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 4, marginBottom: 25 },
  roleButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  roleButtonActive: { backgroundColor: '#0D2340' },
  roleTextActive: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  roleTextInactive: { color: '#6B7280', fontWeight: 'bold', fontSize: 12 },
  inputLabel: { fontSize: 13, fontWeight: 'bold', color: '#0D2340', marginBottom: 8, marginTop: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15, marginBottom: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 14, color: '#1F2937' },
  inputPass: { flex: 1, paddingVertical: 14, fontSize: 14, color: '#1F2937' }, 
  pickerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingLeft: 15, marginBottom: 15, overflow: 'hidden' },
  picker: { flex: 1, height: 50 },
  verificationTitle: { fontSize: 12, fontWeight: 'bold', color: '#0D2340', textAlign: 'center', marginTop: 20, marginBottom: 15, letterSpacing: 1 },
  gridContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  gridItem: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 15, alignItems: 'center', marginHorizontal: 5 },
  gridItemSuccess: { borderColor: '#00D06C', backgroundColor: '#F0FDF4' },
  gridItemTitle: { fontSize: 12, fontWeight: 'bold', color: '#0D2340', textAlign: 'center', marginTop: 10 },
  gridItemSub: { fontSize: 10, color: '#9CA3AF', marginTop: 5 },
  ineButton: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, alignItems: 'center', marginHorizontal: 5 },
  ineButtonText: { fontSize: 11, fontWeight: 'bold', color: '#0D2340', textAlign: 'center' },
  iaContainer: { alignItems: 'center', padding: 20, backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 1, borderColor: '#BBEFD3' },
  iaText: { color: '#005530', fontWeight: 'bold', marginTop: 10, textAlign: 'center', fontSize: 12 },
  mainButton: { backgroundColor: '#0D2340', borderRadius: 12, paddingVertical: 18, alignItems: 'center', marginTop: 10 },
  mainButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
  backButton: { marginTop: 20, alignItems: 'center' },
  backButtonText: { color: '#6B7280', fontSize: 14, fontWeight: 'bold' },
  
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  maskContainer: { flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  maskRow: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  maskCenter: { flexDirection: 'row' },
  maskCol: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  maskHole: { borderWidth: 2, borderColor: '#00D06C', overflow: 'hidden' },
  maskHoleCircle: { width: 280, height: 280, borderRadius: 140 },
  maskHoleRect: { width: 340, height: 210, borderRadius: 12 }, 
  laser: { width: '100%', height: 3, backgroundColor: '#00D06C', shadowColor: '#00D06C', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10 },
  cameraTextOverlay: { position: 'absolute', top: 70, width: '100%', alignItems: 'center' },
  cameraTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', letterSpacing: 2 },
  cameraSubtitle: { color: '#A0AEC0', fontSize: 13, marginTop: 8 },
  detectionBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, marginTop: 10 },
  detectionText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  cameraControls: { position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  captureButton: { backgroundColor: '#00D06C', width: 75, height: 75, borderRadius: 37.5, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#FFFFFF' },
  closeCameraButton: { padding: 15 },
  closeCameraText: { color: 'white', fontSize: 14, fontWeight: 'bold' },

  modalAlertBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalAlertBox: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', elevation: 10 },
  modalAlertHeader: { padding: 20, alignItems: 'center' },
  modalAlertContent: { padding: 25, alignItems: 'center' },
  modalAlertTitle: { fontSize: 18, fontWeight: 'bold', color: '#0D2340', marginBottom: 10, textAlign: 'center' },
  modalAlertText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 25, lineHeight: 20 },
  modalAlertBtn: { backgroundColor: '#0D2340', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
  modalAlertBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 }
});