/**
 * Password / passphrase generator — same `@pw0d/core` engine (CSPRNG-backed,
 * EFF wordlist) as the web vault, with native controls.
 */

import {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  generatePassphrase,
  generatePassword,
  scorePassword,
} from "@pw0d/core";
import Slider from "@react-native-community/slider";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { StrengthMeter } from "@/components/strength-meter";
import { Button, Chip, haptic } from "@/components/ui";
import { colors, radius } from "@/lib/theme";

type Mode = "password" | "passphrase";

export function GeneratorPanel({ onUse, onCopied }: { onUse?: (value: string) => void; onCopied?: () => void }) {
  const [mode, setMode] = useState<Mode>("password");
  const [length, setLength] = useState(DEFAULT_PASSWORD_OPTIONS.length);
  const [uppercase, setUppercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [words, setWords] = useState(DEFAULT_PASSPHRASE_OPTIONS.words);
  const [capitalize, setCapitalize] = useState(false);
  const [includeNumber, setIncludeNumber] = useState(false);
  const [value, setValue] = useState("");

  const regenerate = useCallback(() => {
    try {
      setValue(
        mode === "password"
          ? generatePassword({ length, uppercase, digits, symbols })
          : generatePassphrase({ words, capitalize, includeNumber }),
      );
    } catch {
      // e.g. all character classes disabled — keep the last good value.
    }
  }, [mode, length, uppercase, digits, symbols, words, capitalize, includeNumber]);

  useEffect(() => regenerate(), [regenerate]);

  const strength = value ? scorePassword(value) : null;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="characters" active={mode === "password"} onPress={() => setMode("password")} />
        <Chip label="words" active={mode === "passphrase"} onPress={() => setMode("passphrase")} />
      </View>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, borderCurve: "continuous", padding: 14 }}>
        <Text selectable style={{ color: colors.foreground, fontSize: 16, fontVariant: ["tabular-nums"], lineHeight: 24 }}>
          {value}
        </Text>
        {strength ? <StrengthMeter score={strength.score} /> : null}
      </View>

      {mode === "password" ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, width: 70 }}>
              length <Text style={{ color: colors.foreground, fontVariant: ["tabular-nums"] }}>{length}</Text>
            </Text>
            <Slider
              style={{ flex: 1 }}
              minimumValue={8}
              maximumValue={64}
              step={1}
              value={length}
              onValueChange={(next) => setLength(Math.round(next))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
          </View>
          <ToggleRow label="A–Z" value={uppercase} onChange={setUppercase} />
          <ToggleRow label="0–9" value={digits} onChange={setDigits} />
          <ToggleRow label="!@#$" value={symbols} onChange={setSymbols} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, width: 70 }}>
              words <Text style={{ color: colors.foreground, fontVariant: ["tabular-nums"] }}>{words}</Text>
            </Text>
            <Slider
              style={{ flex: 1 }}
              minimumValue={3}
              maximumValue={10}
              step={1}
              value={words}
              onValueChange={(next) => setWords(Math.round(next))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
          </View>
          <ToggleRow label="Capitalize" value={capitalize} onChange={setCapitalize} />
          <ToggleRow label="Include digit" value={includeNumber} onChange={setIncludeNumber} />
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Regenerate" variant="secondary" onPress={regenerate} style={{ flex: 1 }} />
        <Button
          label="Copy"
          variant="secondary"
          onPress={() => {
            void Clipboard.setStringAsync(value);
            haptic("success");
            onCopied?.();
          }}
          style={{ flex: 1 }}
        />
        {onUse ? <Button label="Use" onPress={() => onUse(value)} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, fontVariant: ["tabular-nums"] }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.foreground} />
    </View>
  );
}
