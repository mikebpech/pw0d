/**
 * App entry / auth gate. Renders the right surface for the current vault state:
 * login (no session) → unlock (locked) → the vault list (unlocked). The vault
 * gets a compact custom top bar with the brand and quick actions, mirroring the
 * web sidebar's footer controls.
 */

import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoginScreen } from "@/components/login-screen";
import { UnlockScreen } from "@/components/unlock-screen";
import { VaultScreen } from "@/components/vault-screen";
import { haptic } from "@/components/ui";
import { useVault } from "@/lib/store";
import { colors } from "@/lib/theme";

export default function Index() {
  const status = useVault((state) => state.status);
  const lock = useVault((state) => state.lock);

  if (status === "logged-out") return <LoginScreen />;
  if (status === "locked") return <UnlockScreen />;
  if (status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontWeight: "700" }}>
          pw<Text style={{ color: colors.primary }}>0</Text>d
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.sidebar }}>
        <View
          style={{
            height: 52,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            borderBottomColor: colors.border,
            borderBottomWidth: 1,
          }}
        >
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 20, fontWeight: "800" }}>
            pw<Text style={{ color: colors.primary }}>0</Text>d
          </Text>
          <HeaderButton label="Generate" onPress={() => router.push("/generator")} />
          <HeaderButton label="Settings" onPress={() => router.push("/settings")} />
          <HeaderButton
            label="Lock"
            onPress={() => {
              haptic();
              lock();
            }}
          />
        </View>
      </SafeAreaView>
      <VaultScreen />
    </View>
  );
}

function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
