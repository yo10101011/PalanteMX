import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// ¿ESTÁ ABIERTO EL TECLADO? SIRVE PARA QUITAR EL ESPACIO DE LA BARRA DE NAVEGACIÓN DEL TELÉFONO MIENTRAS SE ESCRIBE.
// (EN iOS EXISTEN LOS EVENTOS "WILL", QUE LLEGAN ANTES Y SE VE MÁS SUAVE; EN ANDROID SOLO LOS "DID")
export const useTecladoVisible = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alAbrir = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const alCerrar = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { alAbrir.remove(); alCerrar.remove(); };
  }, []);

  return visible;
};
