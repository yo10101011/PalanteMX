import { Stack } from 'expo-router';
import { Alert, Platform } from 'react-native';

// EN LA VERSIÓN WEB, Alert.alert DE REACT NATIVE NO HACE NADA (NO SALE NINGUNA VENTANA), ASÍ QUE BOTONES COMO
// "CERRAR SESIÓN" O "¿SEGURO QUE...?" PARECÍAN NO FUNCIONAR. AQUÍ SE CAMBIA UNA SOLA VEZ PARA TODA LA APP POR LAS
// VENTANAS DEL NAVEGADOR: CON DOS O MÁS BOTONES SE USA confirm() (ACEPTAR = EL BOTÓN QUE NO ES "CANCELAR"),
// CON UNO O NINGUNO, alert(). EN EL CELULAR NO CAMBIA NADA.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (titulo, mensaje, botones) => {
    const texto = [titulo, mensaje].filter(Boolean).join('\n\n');
    if (!botones || botones.length <= 1) {
      window.alert(texto);
      botones?.[0]?.onPress?.();
      return;
    }
    const cancelar = botones.find(b => b.style === 'cancel') || botones[0];
    const aceptar = [...botones].reverse().find(b => b !== cancelar) || botones[botones.length - 1];
    if (window.confirm(`${texto}\n\n(Aceptar = ${aceptar.text || 'Sí'})`)) aceptar.onPress?.();
    else cancelar.onPress?.();
  };
}

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Declaramos que existen estas dos pantallas en tu app */}
      <Stack.Screen name="index" />
      <Stack.Screen name="registro" />
    </Stack>
  );
}
