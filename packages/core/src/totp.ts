/**
 * TOTP (RFC 6238) — pure WebCrypto, works in browser, extension, and Node.
 * Accepts otpauth:// URIs (what authenticator QR codes encode) or bare base32
 * secrets, the two things users actually paste.
 */

export interface TotpConfig {
  /** Raw key bytes (decoded from base32). */
  secret: Uint8Array;
  algorithm: "SHA-1" | "SHA-256" | "SHA-512";
  digits: number;
  period: number;
  issuer: string | null;
  account: string | null;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (cleaned.length === 0) throw new Error("empty secret");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Parse an otpauth:// URI or a bare base32 secret into a TotpConfig. */
export function parseTotpInput(input: string): TotpConfig {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith("otpauth://")) {
    // Bare secret with defaults (what Google Authenticator assumes).
    return {
      secret: base32Decode(trimmed),
      algorithm: "SHA-1",
      digits: 6,
      period: 30,
      issuer: null,
      account: null,
    };
  }
  const url = new URL(trimmed);
  if (url.host !== "totp") throw new Error("only TOTP otpauth URIs are supported");
  const secretParam = url.searchParams.get("secret");
  if (!secretParam) throw new Error("otpauth URI is missing the secret");
  const algorithmParam = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
  const algorithm =
    algorithmParam === "SHA256" ? "SHA-256" : algorithmParam === "SHA512" ? "SHA-512" : "SHA-1";
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const [labelIssuer, labelAccount] = label.includes(":")
    ? [label.slice(0, label.indexOf(":")), label.slice(label.indexOf(":") + 1)]
    : [null, label || null];
  return {
    secret: base32Decode(secretParam),
    algorithm,
    digits: Number(url.searchParams.get("digits") ?? 6),
    period: Number(url.searchParams.get("period") ?? 30),
    issuer: url.searchParams.get("issuer") ?? labelIssuer,
    account: labelAccount,
  };
}

/** Quick validity check for UI input fields. */
export function isValidTotpInput(input: string): boolean {
  try {
    parseTotpInput(input);
    return true;
  } catch {
    return false;
  }
}

export async function generateTotp(
  config: TotpConfig,
  timestampMs: number,
): Promise<string> {
  const counter = Math.floor(timestampMs / 1000 / config.period);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey(
    "raw",
    config.secret as BufferSource,
    { name: "HMAC", hash: config.algorithm },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message as BufferSource));
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** config.digits).padStart(config.digits, "0");
}

/** Convenience: parse stored totp string and produce the current code. */
export async function totpCodeFor(
  stored: string,
  timestampMs: number,
): Promise<{ code: string; secondsLeft: number; period: number }> {
  const config = parseTotpInput(stored);
  const code = await generateTotp(config, timestampMs);
  const elapsed = Math.floor(timestampMs / 1000) % config.period;
  return { code, secondsLeft: config.period - elapsed, period: config.period };
}
