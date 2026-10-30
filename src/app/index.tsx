import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// FIREBASE
// @ts-ignore
import { onAuthStateChanged, sendPasswordResetEmail, signInWithCustomToken, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

// ERROR CON UN MENSAJE QUE SÍ SE LE PUEDE MOSTRAR AL USUARIO TAL CUAL (VIENE DE NUESTRO SERVIDOR)
class ErrorParaUsuario extends Error {}

// LOGIN CON USUARIO O TELÉFONO: EL SERVIDOR (backend/kyc-worker) BUSCA EL CORREO POR DENTRO, REVISA LA CONTRASEÑA
// Y DEVUELVE UN "PASE" DE FIREBASE. NUNCA NOS DICE EL CORREO, ASÍ NADIE PUEDE SACAR CORREOS PROBANDO TELÉFONOS.
const iniciarSesionConUsuario = async (identificador: string, password: string) => {
  const KYC_API_URL = process.env.EXPO_PUBLIC_KYC_API_URL;
  if (!KYC_API_URL) throw new Error("Falta configurar EXPO_PUBLIC_KYC_API_URL en el archivo .env");

  const response = await fetch(`${KYC_API_URL}/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador, password }),
  });
  const resultado = await response.json();
  if (!response.ok) throw new ErrorParaUsuario(resultado.error || "El servidor no respondió.");
  return signInWithCustomToken(auth, resultado.token);
};

// DECIDE A DÓNDE VA CADA QUIEN DESPUÉS DE INICIAR SESIÓN (ADMIN, CONTRATISTA O TRABAJADOR)
const redirigirSegunRol = async (uid: string) => {
  const adminDoc = await getDoc(doc(db, 'Administradores', uid));
  if (adminDoc.exists()) { router.replace('/admin' as any); return; }

  const contratistaDoc = await getDoc(doc(db, 'Contratistas', uid));
  const perfilDoc = contratistaDoc.exists() ? contratistaDoc : await getDoc(doc(db, 'Usuarios', uid));

  if (!perfilDoc.exists()) {
    await signOut(auth);
    Alert.alert("Registro incompleto", "Tu cuenta no tiene un perfil verificado. Vuelve a registrarte.");
    return;
  }
  if (perfilDoc.data().estado_cuenta === 'Bloqueada') {
    await signOut(auth);
    Alert.alert("Cuenta bloqueada", "Tu cuenta fue bloqueada por el equipo de PalanteMX. Contacta a soporte.");
    return;
  }

  router.replace((contratistaDoc.exists() ? '/dashboard-contratista' : '/dashboard-trabajador') as any);
};

export default function LoginScreen() {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);

  // ESTADOS PARA RECUPERAR CONTRASEÑA
  const [modalRecuperarVisible, setModalRecuperarVisible] = useState(false);
  const [correoRecuperar, setCorreoRecuperar] = useState('');

  // 1. INICIO DE SESIÓN MANUAL (CON REDIRECCIÓN INTELIGENTE)
  const handleLoginReal = async () => {
    if (!identificador || !password) {
      Alert.alert("Aviso", "Ingresa tus datos para continuar."); return;
    }

    setCargando(true);
    const identificadorLimpio = identificador.trim();

    try {
      // CON CORREO SE ENTRA DIRECTO A FIREBASE; CON USUARIO O TELÉFONO, A TRAVÉS DEL SERVIDOR
      const userCredential = identificadorLimpio.includes('@')
        ? await signInWithEmailAndPassword(auth, identificadorLimpio, password)
        : await iniciarSesionConUsuario(identificadorLimpio, password);
      const uid = userCredential.user.uid; // Tomamos el ID del usuario que acaba de entrar

      /* --- CÓDIGO APAGADO TEMPORALMENTE (VERIFICACIÓN DE CORREO Y BIOMETRÍA) ---
      if (!userCredential.user.emailVerified) {
        setCargando(false);
        Alert.alert("Cuenta No Verificada", "Te enviamos un enlace de seguridad...");
        return;
      }
      
      Alert.alert("¡Acceso Concedido!", "¿Deseas habilitar tu Huella / FaceID...?", [ ... ]);
      --------------------------------------------------------------------------- */

      // LÓGICA DE REDIRECCIÓN AUTOMÁTICA
      await redirigirSegunRol(uid);
      setCargando(false);

    } catch (error: any) {
      setCargando(false);
      // LOS MENSAJES DE NUESTRO SERVIDOR (P. EJ. "DEMASIADOS INTENTOS") SE MUESTRAN TAL CUAL; LOS DE FIREBASE, GENÉRICOS
      Alert.alert("Error de acceso", error instanceof ErrorParaUsuario ? error.message : "Contraseña incorrecta o usuario no válido.");
    }
  };

  // 2. SESIÓN GUARDADA + HUELLA
  // FIREBASE YA GUARDA LA SESIÓN EN EL TELÉFONO DE FORMA SEGURA (firebaseConfig.js), ASÍ QUE NO SE GUARDA NINGUNA CONTRASEÑA:
  // SI HAY SESIÓN, LA HUELLA (O LA CARA) SOLO CONFIRMA QUE QUIEN TIENE EL TELÉFONO ES EL DUEÑO.
  const [usuarioGuardado, setUsuarioGuardado] = useState<User | null>(null);
  const [revisandoSesion, setRevisandoSesion] = useState(true);

  const entrarConSesionGuardada = async (usuario: User) => {
    try {
      const hayHuella = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (hayHuella) {
        const resultado = await LocalAuthentication.authenticateAsync({ promptMessage: 'Acceso seguro a PalanteMX', cancelLabel: 'Usar contraseña' });
        if (!resultado.success) return; // SI CANCELA, SE QUEDA EN EL LOGIN Y PUEDE ENTRAR CON CONTRASEÑA
      }
      setCargando(true);
      await redirigirSegunRol(usuario.uid);
    } catch (error) {
      Alert.alert("Error", "No se pudo abrir tu sesión. Entra con tu contraseña.");
    }
    setCargando(false);
  };

  // AL ABRIR LA APP: SI YA HABÍA SESIÓN, SE PIDE LA HUELLA Y SE ENTRA DIRECTO
  useEffect(() => {
    const dejarDeEscuchar = onAuthStateChanged(auth, (usuario) => {
      dejarDeEscuchar(); // SOLO IMPORTA EL ESTADO AL ABRIR LA PANTALLA
      setUsuarioGuardado(usuario);
      setRevisandoSesion(false);
      if (usuario) entrarConSesionGuardada(usuario);
    });
    return dejarDeEscuchar;
  }, []);

  const handleBiometria = async () => {
    const usuario = auth.currentUser || usuarioGuardado;
    if (!usuario) {
      Alert.alert("Primero inicia sesión", "Entra una vez con tu contraseña. Después podrás entrar con tu huella sin escribirla.");
      return;
    }
    const hayHuella = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!hayHuella) { Alert.alert("Aviso", "Tu celular no tiene huella o reconocimiento facial configurado."); return; }
    await entrarConSesionGuardada(usuario);
  };

  // RECUPERACIÓN DE CONTRASEÑA REAL
  const enviarCorreoRecuperacion = async () => {
    if (!correoRecuperar || !correoRecuperar.includes('@')) {
      Alert.alert("Error", "Ingresa un correo electrónico válido."); return;
    }
    try {
      await sendPasswordResetEmail(auth, correoRecuperar.trim());
      Alert.alert("Correo Enviado", "Revisa tu bandeja de entrada o spam. Te hemos enviado un enlace para crear una nueva contraseña.");
      setModalRecuperarVisible(false);
      setCorreoRecuperar('');
    } catch (error: any) {
      if(error.code === 'auth/user-not-found') {
        Alert.alert("Usuario no encontrado", "No existe ninguna cuenta registrada con este correo.");
      } else {
        Alert.alert("Error", "Hubo un problema. Verifica tu conexión.");
      }
    }
  };

  if (revisandoSesion) {
    return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color="#00D06C" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          <View style={styles.topSection}>
            <View style={styles.header}>
              <Text style={styles.trabajoSeguro}>SISTEMA DE ACCESO</Text>
              <Text style={styles.subtitle}>BIENVENIDO A</Text>
              <Text style={styles.title}>Palante<Text style={styles.titleAccent}>MX</Text></Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Inicia sesión</Text>
              <Text style={styles.cardSubtitle}>Ingresa tus datos operativos</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="person" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Correo, Teléfono o Usuario" value={identificador} onChangeText={setIdentificador} autoCapitalize="none" />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Contraseña de seguridad" value={password} onChangeText={setPassword} secureTextEntry={!mostrarPassword} />
                <TouchableOpacity onPress={() => setMostrarPassword(!mostrarPassword)} style={{padding: 5}}>
                  <Ionicons name={mostrarPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setModalRecuperarVisible(true)}>
                <Text style={styles.forgotPassword}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.mainButton} onPress={handleLoginReal} disabled={cargando}>
                {cargando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.mainButtonText}>ENTRAR</Text>}
              </TouchableOpacity>

              <View style={styles.separatorContainer}>
                <View style={styles.line} /><Text style={styles.separatorText}>ACCESO BIOMÉTRICO</Text><View style={styles.line} />
              </View>

              <TouchableOpacity style={styles.biometricButton} onPress={handleBiometria}>
                <Text style={styles.biometricText}>Ingresar con Huella / FaceID</Text>
                <Text style={styles.biometricSub}>Rápido, privado y protegido</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>¿Eres nuevo en la plataforma? </Text>
            <TouchableOpacity onPress={() => router.push('/registro' as any)} style={{padding: 5}}>
              <Text style={styles.registerText}>Regístrate aquí</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL RECUPERAR CONTRASEÑA */}
      <Modal visible={modalRecuperarVisible} transparent animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Recuperar Contraseña</Text>
            <Text style={styles.modalSubtitle}>Ingresa tu correo oficial de registro para enviarte un enlace de recuperación.</Text>
            <TextInput style={[styles.modalInput, { letterSpacing: 1, textAlign: 'left' }]} placeholder="tu-correo@ejemplo.com" value={correoRecuperar} onChangeText={setCorreoRecuperar} keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalRecuperarVisible(false)}>
                <Text style={styles.modalBtnTextCancel}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSubmit} onPress={enviarCorreoRecuperacion}>
                <Text style={styles.modalBtnTextSubmit}>ENVIAR</Text>
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
  content: { flexGrow: 1, justifyContent: 'space-between', padding: 20 },
  topSection: { flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 30, marginTop: 20 },
  trabajoSeguro: { color: '#00D06C', fontWeight: 'bold', fontSize: 14, marginBottom: 10, letterSpacing: 1 },
  subtitle: { color: '#00D06C', fontWeight: 'bold', fontSize: 14, letterSpacing: 2, marginBottom: 5 },
  title: { fontSize: 45, fontWeight: 'bold', color: '#FFFFFF' },
  titleAccent: { color: '#00D06C' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 25, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  cardTitle: { fontSize: 24, fontWeight: 'bold', color: '#0D2340', textAlign: 'center' },
  cardSubtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 25, marginTop: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15, marginBottom: 15 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 16, fontSize: 17, color: '#1F2937' },
  forgotPassword: { color: '#0D2340', textAlign: 'right', fontWeight: 'bold', marginBottom: 20, fontSize: 15 },
  mainButton: { backgroundColor: '#0D2340', borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  mainButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold', letterSpacing: 1 },
  separatorContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  separatorText: { marginHorizontal: 10, color: '#9CA3AF', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  biometricButton: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBEFD3', borderRadius: 12, padding: 16, alignItems: 'center' },
  biometricText: { color: '#005530', fontWeight: 'bold', fontSize: 17 },
  biometricSub: { color: '#6B7280', fontSize: 13, marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, marginBottom: 15 },
  footerText: { color: '#D1D5DB', fontSize: 17 },
  registerText: { color: '#00D06C', fontSize: 17, fontWeight: 'bold' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' },
  modalTitle: { fontSize: 21, fontWeight: 'bold', color: '#0D2340', textAlign: 'center', marginTop: 20 },
  modalSubtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', paddingHorizontal: 20, marginTop: 8, marginBottom: 20 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 15, marginHorizontal: 20, fontSize: 19, textAlign: 'center', letterSpacing: 5, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#E5E7EB' },
  modalBtnCancel: { flex: 1, padding: 15, alignItems: 'center', borderRightWidth: 1, borderColor: '#E5E7EB' },
  modalBtnSubmit: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: '#0D2340' },
  modalBtnTextCancel: { color: '#6B7280', fontWeight: 'bold' },
  modalBtnTextSubmit: { color: '#FFFFFF', fontWeight: 'bold' }
});