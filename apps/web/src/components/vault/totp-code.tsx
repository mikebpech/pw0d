"use client";

import { totpCodeFor } from "@pw0d/core";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface TotpState {
  code: string;
  secondsLeft: number;
  period: number;
}

export function useTotp(stored: string | undefined): TotpState | null {
  const [state, setState] = useState<TotpState | null>(null);
  useEffect(() => {
    if (!stored) {
      setState(null);
      return;
    }
    let active = true;
    const tick = async () => {
      try {
        const result = await totpCodeFor(stored, Date.now());
        if (active) setState(result);
      } catch {
        if (active) setState(null);
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [stored]);
  return state;
}

/** Countdown ring: full at period start, empties as the code ages. */
function CountdownRing({ secondsLeft, period }: { secondsLeft: number; period: number }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const fraction = secondsLeft / period;
  const urgent = secondsLeft <= 5;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90">
      <circle cx="11" cy="11" r={radius} fill="none" strokeWidth="2.5" className="stroke-muted" />
      <circle
        cx="11"
        cy="11"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        className={cn(
          "transition-[stroke-dashoffset] duration-1000 ease-linear",
          urgent ? "stroke-destructive" : "stroke-primary",
        )}
      />
    </svg>
  );
}

export function TotpRow({ stored }: { stored: string }) {
  const totp = useTotp(stored);
  if (!totp) {
    return (
      <div className="px-4 py-3">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
          one-time code
        </div>
        <div className="text-sm text-destructive">invalid TOTP secret</div>
      </div>
    );
  }
  const grouped = totp.code.replace(/(\d{3})(?=\d)/g, "$1 ");
  return (
    <div className="group flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
          one-time code
        </div>
        <div
          className={cn(
            "font-mono text-xl font-semibold tracking-[0.18em] tabular-nums",
            totp.secondsLeft <= 5 && "text-destructive",
          )}
        >
          {grouped}
        </div>
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {totp.secondsLeft}s
      </span>
      <CountdownRing secondsLeft={totp.secondsLeft} period={totp.period} />
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton value={totp.code} label="code" />
      </div>
    </div>
  );
}
