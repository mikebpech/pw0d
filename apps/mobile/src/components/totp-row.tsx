/**
 * Live TOTP code for a login item. Re-derives every second from the stored
 * otpauth/secret using the shared `@pw0d/core` generator — same codes as the
 * web vault and any authenticator app.
 */

import { totpCodeFor } from "@pw0d/core";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, radius } from "@/lib/theme";
import { haptic } from "@/components/ui";

export function TotpRow({ stored, onCopied }: { stored: string; onCopied?: (label: string) => void }) {
  const [code, setCode] = useState("------");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [period, setPeriod] = useState(30);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const result = await totpCodeFor(stored, Date.now());
        if (!active) return;
        setCode(result.code);
        setSecondsLeft(result.secondsLeft);
        setPeriod(result.period);
        setError(false);
      } catch {
        if (active) setError(true);
      }
    }
    void tick();
    const timer = setInterval(tick, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [stored]);

  if (error) return null;

  const spaced = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: 14,
        gap: 8,
      }}
    >
      <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" }}>
        one-time code
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text
          selectable
          style={{ flex: 1, color: colors.primary, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: 2 }}
        >
          {spaced}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"], width: 28, textAlign: "right" }}>
          {secondsLeft}s
        </Text>
        <Pressable
          hitSlop={10}
          onPress={async () => {
            await Clipboard.setStringAsync(code);
            haptic("success");
            onCopied?.("2FA code");
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>Copy</Text>
        </Pressable>
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.primary, width: `${(secondsLeft / period) * 100}%` }} />
      </View>
    </View>
  );
}
