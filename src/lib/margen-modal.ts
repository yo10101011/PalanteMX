import { useSafeAreaInsets } from 'react-native-safe-area-context';

// EN ANDROID LAS VENTANAS (Modal) SE DIBUJAN DE BORDE A BORDE: SIN ESTE MARGEN
// LOS BOTONES DE ABAJO QUEDAN DEBAJO DE LA BARRA DE NAVEGACIÓN DEL CELULAR.
export function useMargenModal(extra = 15) {
  const insets = useSafeAreaInsets();
  return { paddingTop: insets.top + extra, paddingBottom: insets.bottom + extra };
}
