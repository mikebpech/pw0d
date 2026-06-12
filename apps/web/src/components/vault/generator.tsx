"use client";

import {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  generatePassphrase,
  generatePassword,
  scorePassword,
} from "@pw0d/core";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StrengthMeter } from "@/components/vault/strength-meter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "password" | "passphrase";

export function GeneratorPanel({ onUse }: { onUse?: (value: string) => void }) {
  const [mode, setMode] = useState<Mode>("password");
  const [length, setLength] = useState(DEFAULT_PASSWORD_OPTIONS.length);
  const [symbols, setSymbols] = useState(true);
  const [digits, setDigits] = useState(true);
  const [uppercase, setUppercase] = useState(true);
  const [words, setWords] = useState(DEFAULT_PASSPHRASE_OPTIONS.words);
  const [capitalize, setCapitalize] = useState(false);
  const [includeNumber, setIncludeNumber] = useState(false);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const regenerate = useCallback(() => {
    setValue(
      mode === "password"
        ? generatePassword({ length, symbols, digits, uppercase })
        : generatePassphrase({ words, capitalize, includeNumber }),
    );
  }, [mode, length, symbols, digits, uppercase, words, capitalize, includeNumber]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1400);
  }

  const strength = value ? scorePassword(value) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Tabs value={mode} onValueChange={(next) => setMode(next as Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            characters
          </TabsTrigger>
          <TabsTrigger value="passphrase" className="flex-1">
            words
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border bg-background px-3 py-2.5">
        <div className="break-all font-mono text-sm leading-relaxed">{value}</div>
        {strength && <StrengthMeter score={strength.score} />}
      </div>

      {mode === "password" ? (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0">
              length <span className="font-mono text-muted-foreground">{length}</span>
            </Label>
            <Slider
              value={[length]}
              min={8}
              max={64}
              step={1}
              onValueChange={(next) => setLength(Array.isArray(next) ? (next[0] ?? 20) : next)}
            />
          </div>
          <ToggleRow label="A–Z" checked={uppercase} onChange={setUppercase} />
          <ToggleRow label="0–9" checked={digits} onChange={setDigits} />
          <ToggleRow label="!@#$" checked={symbols} onChange={setSymbols} />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0">
              words <span className="font-mono text-muted-foreground">{words}</span>
            </Label>
            <Slider
              value={[words]}
              min={3}
              max={10}
              step={1}
              onValueChange={(next) => setWords(Array.isArray(next) ? (next[0] ?? 5) : next)}
            />
          </div>
          <ToggleRow label="Capitalize" checked={capitalize} onChange={setCapitalize} />
          <ToggleRow label="Include digit" checked={includeNumber} onChange={setIncludeNumber} />
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={regenerate} className="flex-1">
          <RefreshCw /> Regenerate
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void handleCopy()} className="flex-1">
          {copied ? <Check className="text-primary" /> : <Copy />} Copy
        </Button>
        {onUse && (
          <Button size="sm" onClick={() => onUse(value)} className="flex-1">
            Use
          </Button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="font-mono text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
