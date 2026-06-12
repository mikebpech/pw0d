/**
 * Server-side TOTP verification for account 2FA. Allows ±1 step (90s window)
 * for clock skew. This is a second factor for API LOGIN — it never touches
 * vault crypto, which is gated solely by the master password.
 */

import { generateTotp, parseTotpInput } from "@pw0d/core";
import { randomBytes } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let secret = "";
  for (const byte of bytes) secret += BASE32[byte % 32];
  return secret;
}

export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`pw0d:${email}`);
  const params = new URLSearchParams({ secret, issuer: "pw0d", period: "30", digits: "6" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const config = parseTotpInput(secret);
  const now = Date.now();
  for (const offset of [-1, 0, 1]) {
    const candidate = await generateTotp(config, now + offset * config.period * 1000);
    // Constant-time-ish: compare full strings, no early return on mismatch.
    if (candidate.length === cleaned.length) {
      let diff = 0;
      for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ cleaned.charCodeAt(i);
      if (diff === 0) return true;
    }
  }
  return false;
}
