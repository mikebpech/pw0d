/**
 * Small UI kit shared across the mobile screens. Mirrors the web vault's
 * primitives (button variants, copyable value rows, reveal-able secret rows)
 * with the same dark-graphite / chartreuse palette.
 */

import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, radius } from "@/lib/theme";

function haptic(type: "select" | "success" = "select") {
  if (process.env.EXPO_OS !== "ios") return;
  if (type === "success") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else void Haptics.selectionAsync();
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  style?: object;
}) {
  const bg =
    variant === "primary" ? colors.primary : variant === "destructive" ? colors.destructive : variant === "ghost" ? "transparent" : colors.secondary;
  const fg =
    variant === "primary" ? colors.primaryForeground : variant === "destructive" ? "#fff" : variant === "ghost" ? colors.mutedForeground : colors.foreground;
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.82 : 1,
        backgroundColor: bg,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        minHeight: 48,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        borderWidth: variant === "ghost" ? 1 : 0,
        borderColor: colors.border,
        ...style,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: "800" }}>{label}</Text>}
    </Pressable>
  );
}

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.subtle}
      {...props}
      style={[
        {
          minHeight: 48,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          color: colors.foreground,
          paddingHorizontal: 14,
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      style={{
        paddingHorizontal: 14,
        minHeight: 36,
        borderRadius: radius.md,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? "#30331f" : colors.card,
        borderColor: active ? colors.primary : colors.border,
        borderWidth: 1,
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** Square avatar with the item's initial — the web vault's ItemIcon fallback. */
export function ItemAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.secondary,
        borderColor: colors.borderStrong,
        borderWidth: 1,
      }}
    >
      <Text style={{ color: colors.primary, fontSize: size * 0.42, fontWeight: "800" }}>{(name.slice(0, 1) || "?").toUpperCase()}</Text>
    </View>
  );
}

async function copy(value: string, label: string, onCopied?: (label: string) => void) {
  await Clipboard.setStringAsync(value);
  haptic("success");
  onCopied?.(label);
}

const cardStyle = {
  backgroundColor: colors.card,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radius.lg,
  borderCurve: "continuous" as const,
  padding: 14,
  gap: 8,
};

const fieldLabel = {
  color: colors.subtle,
  fontSize: 11,
  fontWeight: "800" as const,
  letterSpacing: 0.6,
  textTransform: "uppercase" as const,
};

const actionText = { color: colors.primary, fontSize: 13, fontWeight: "800" as const };

/** A labelled, copyable value (username, url, notes, totp…). */
export function ValueRow({
  label,
  value,
  accent,
  onCopied,
}: {
  label: string;
  value: string;
  accent?: boolean;
  onCopied?: (label: string) => void;
}) {
  if (!value) return null;
  return (
    <View style={cardStyle}>
      <Text style={fieldLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text selectable style={{ flex: 1, color: accent ? colors.primary : colors.foreground, fontSize: 15 }}>
          {value}
        </Text>
        <Pressable onPress={() => void copy(value, label, onCopied)} hitSlop={10}>
          <Text style={actionText}>Copy</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Hidden-by-default secret with reveal + copy. */
export function SecretRow({
  label,
  value,
  onCopied,
}: {
  label: string;
  value: string;
  onCopied?: (label: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;
  return (
    <View style={cardStyle}>
      <Text style={fieldLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          selectable={revealed}
          style={{ flex: 1, color: colors.foreground, fontSize: 15, fontVariant: ["tabular-nums"] }}
        >
          {revealed ? value : "•".repeat(Math.min(value.length, 20))}
        </Text>
        <Pressable onPress={() => setRevealed((v) => !v)} hitSlop={10}>
          <Text style={actionText}>{revealed ? "Hide" : "Reveal"}</Text>
        </Pressable>
        <Pressable onPress={() => void copy(value, label, onCopied)} hitSlop={10}>
          <Text style={actionText}>Copy</Text>
        </Pressable>
      </View>
    </View>
  );
}

export { haptic };
