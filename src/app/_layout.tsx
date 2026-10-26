import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Declaramos que existen estas dos pantallas en tu app */}
      <Stack.Screen name="index" />
      <Stack.Screen name="registro" />
    </Stack>
  );
}