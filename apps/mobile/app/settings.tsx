import { router } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { autofillSupported } from "@/lib/autofill";
import { useVault } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

export default function SettingsScreen() {
  const email = useVault((state) => state.email);
  const serverUrl = useVault((state) => state.serverUrl);
  const itemCount = useVault((state) => state.items.length);
  const logout = useVault((state) => state.logout);

  function confirmLogout() {
    Alert.alert("Log out of pw0d?", "Your encrypted vault stays on the server. You'll need your master password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void logout();
          router.dismissAll();
        },
      },
    ]);
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 18, gap: 16 }}>
      <InfoCard label="Account" value={email ?? "—"} />
      <InfoCard label="Server" value={serverUrl ?? "—"} />
      <InfoCard label="Items in vault" value={String(itemCount)} />
      <InfoCard
        label="iPhone AutoFill"
        value={autofillSupported ? "Enabled — turn pw0d on in Settings ▸ Passwords ▸ Password Options" : "Not available in this build"}
      />

      <View style={{ gap: 10, marginTop: 4 }}>
        <Button label="Log out" variant="destructive" onPress={confirmLogout} />
      </View>

      <Text style={{ color: colors.subtle, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8 }}>
        pw0d is zero-knowledge: your vault is decrypted only on this device, behind your master password and biometrics.
      </Text>
    </ScrollView>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, borderCurve: "continuous", padding: 14, gap: 6 }}>
      <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      <Text selectable style={{ color: colors.foreground, fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}
