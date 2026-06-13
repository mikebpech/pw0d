// IMPORTANT: install the crypto runtime polyfills before anything imports
// `@pw0d/crypto` (which the store does). Keep this as the first import.
import "@/lib/crypto-setup";

import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useVault } from "@/lib/store";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  const init = useVault((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.sidebar },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: "", headerBackTitle: "Vault" }} />
        <Stack.Screen name="generator" options={{ title: "Generator", presentation: "modal" }} />
        <Stack.Screen name="settings" options={{ title: "Settings", presentation: "modal" }} />
      </Stack>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
