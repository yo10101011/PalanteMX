import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// "CERRAR SESIÓN" NO BORRA LA SESIÓN DE FIREBASE DEL TELÉFONO: SI LA BORRARA, LA HUELLA YA NO TENDRÍA
// A QUÉ CUENTA ENTRAR Y HABRÍA QUE ESCRIBIR LA CONTRASEÑA OTRA VEZ. SOLO SE MARCA COMO "BLOQUEADA":
// EL LOGIN NO PIDE LA HUELLA SOLO, PERO EL BOTÓN DE HUELLA SÍ ENTRA. NO SE GUARDA NINGUNA CONTRASEÑA.
// ENTRAR CON CONTRASEÑA A OTRA CUENTA REEMPLAZA LA SESIÓN GUARDADA.
const CLAVE_BLOQUEO = 'palantemx_sesion_bloqueada';

export async function salirDeLaCuenta() {
  await AsyncStorage.setItem(CLAVE_BLOQUEO, '1').catch(() => {});
  router.replace('/' as any);
}

export const sesionBloqueada = async () => (await AsyncStorage.getItem(CLAVE_BLOQUEO).catch(() => null)) === '1';
export const desbloquearSesion = () => AsyncStorage.removeItem(CLAVE_BLOQUEO).catch(() => {});
