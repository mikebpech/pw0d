/**
 * First-run login: point the app at a self-hosted pw0d server, then run the
 * full key ceremony (the same one the web vault uses). On success the Account
 * Key is enrolled behind biometrics so subsequent opens skip the master
 * password.
 */

import { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { Button, TextField } from "@/components/ui";
import { TwoFactorRequired, useVault } from "@/lib/store";
import { colors } from "@/lib/theme";

export function LoginScreen() {
  const login = useVault((state) => state.login);
  const [serverUrl, setServerUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!serverUrl.trim() || !email.trim() || !password) return;
    setBusy(true);
    try {
      await login(serverUrl.trim(), email.trim(), password, needsTotp ? totp.trim() : undefined);
    } catch (error) {
      if (error instanceof TwoFactorRequired) {
        setNeedsTotp(true);
        setBusy(false);
        return;
      }
      Alert.alert("Couldn't sign in", error instanceof Error ? error.message : "Check your server URL and credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 22, gap: 16, flexGrow: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: 6, marginBottom: 12 }}>
          <Text style={{ color: colors.foreground, fontSize: 34, fontWeight: "800" }}>
            pw<Text style={{ color: colors.primary }}>0</Text>d
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>zero-knowledge · self-hosted</Text>
        </View>

        <View style={{ gap: 10 }}>
          <TextField
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://vault.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            textContentType="URL"
          />
          <TextField
            value={email}
            onChangeText={setEmail}
            placeholder="email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
          />
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder="master password"
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            onSubmitEditing={() => void submit()}
          />
          {needsTotp ? (
            <TextField
              value={totp}
              onChangeText={setTotp}
              placeholder="2FA code"
              keyboardType="number-pad"
              autoFocus
              onSubmitEditing={() => void submit()}
            />
          ) : null}
        </View>

        <Button label={busy ? "Deriving keys…" : "Unlock vault"} onPress={() => void submit()} busy={busy} disabled={!serverUrl || !email || !password} />
        <Text style={{ color: colors.subtle, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
          Your master password never leaves this device. It derives the keys that decrypt your vault locally.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
