/**
 * Lock screen for a device that's already logged in. Primary path is biometric
 * (Face ID / Touch ID releases the Account Key from the Keychain); the master
 * password is the always-available fallback.
 */

import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, Text, View } from "react-native";
import { Button, TextField } from "@/components/ui";
import { useVault } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

export function UnlockScreen() {
  const email = useVault((state) => state.email);
  const unlockWithBiometrics = useVault((state) => state.unlockWithBiometrics);
  const unlockWithPassword = useVault((state) => state.unlockWithPassword);
  const logout = useVault((state) => state.logout);

  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function biometric() {
    setBusy(true);
    try {
      await unlockWithBiometrics();
    } catch {
      // User cancelled or biometrics unavailable — offer the password path.
      setUsePassword(true);
    } finally {
      setBusy(false);
    }
  }

  // Auto-prompt biometrics once on mount if the device supports it.
  useEffect(() => {
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && enrolled) void biometric();
      else setUsePassword(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function passwordUnlock() {
    if (!password) return;
    setBusy(true);
    try {
      await unlockWithPassword(password);
    } catch (error) {
      setPassword("");
      Alert.alert("Unlock failed", error instanceof Error ? error.message : "Wrong master password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, padding: 22, gap: 16, justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: 6, marginBottom: 16 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.xl,
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 26 }}>⚿</Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "800" }}>
            pw<Text style={{ color: colors.primary }}>0</Text>d
          </Text>
          {email ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{email}</Text> : null}
        </View>

        {usePassword ? (
          <View style={{ gap: 10 }}>
            <TextField
              value={password}
              onChangeText={setPassword}
              placeholder="master password"
              secureTextEntry
              autoCapitalize="none"
              autoFocus
              textContentType="password"
              style={{ textAlign: "center" }}
              onSubmitEditing={() => void passwordUnlock()}
            />
            <Button label={busy ? "Deriving keys…" : "Unlock vault"} onPress={() => void passwordUnlock()} busy={busy} disabled={!password} />
            <Button label="Use Face ID instead" variant="ghost" onPress={() => void biometric()} />
          </View>
        ) : (
          <Button label="Unlock with biometrics" onPress={() => void biometric()} busy={busy} />
        )}

        <Pressable onPress={() => void logout()} style={{ alignSelf: "center", marginTop: 8 }} hitSlop={10}>
          <Text style={{ color: colors.subtle, fontSize: 13 }}>Log out instead</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
