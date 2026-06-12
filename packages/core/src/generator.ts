/**
 * Password & passphrase generation. All randomness is CSPRNG-backed and
 * uniform (rejection sampling via @pw0d/crypto's randomInt).
 */

import { randomInt } from "@pw0d/crypto";
import { EFF_WORDLIST } from "./wordlist";

const CHARSETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  // Excludes quotes/backslash/backtick — the usual breakage in poorly-built forms.
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?",
} as const;

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
};

export function generatePassword(options: Partial<PasswordOptions> = {}): string {
  const opts = { ...DEFAULT_PASSWORD_OPTIONS, ...options };
  const sets = (Object.keys(CHARSETS) as (keyof typeof CHARSETS)[])
    .filter((name) => opts[name])
    .map((name) => CHARSETS[name]);

  if (sets.length === 0) {
    throw new Error("at least one character set must be enabled");
  }
  if (!Number.isInteger(opts.length) || opts.length < Math.max(4, sets.length) || opts.length > 128) {
    throw new Error("length must be an integer between 4 and 128 (and >= enabled sets)");
  }

  // One char from each enabled set guarantees class coverage…
  const chars = sets.map((set) => set[randomInt(set.length)]!);
  // …the rest drawn uniformly from the union…
  const all = sets.join("");
  while (chars.length < opts.length) {
    chars.push(all[randomInt(all.length)]!);
  }
  // …then a Fisher–Yates shuffle so the guaranteed chars aren't positional.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: 5,
  separator: "-",
  capitalize: false,
  includeNumber: false,
};

/** EFF large wordlist: ~12.9 bits of entropy per word; 5 words ≈ 64 bits. */
export function generatePassphrase(options: Partial<PassphraseOptions> = {}): string {
  const opts = { ...DEFAULT_PASSPHRASE_OPTIONS, ...options };
  if (!Number.isInteger(opts.words) || opts.words < 3 || opts.words > 15) {
    throw new Error("words must be an integer between 3 and 15");
  }
  const words = Array.from({ length: opts.words }, () => {
    let word = EFF_WORDLIST[randomInt(EFF_WORDLIST.length)]!;
    if (opts.capitalize) word = word[0]!.toUpperCase() + word.slice(1);
    return word;
  });
  if (opts.includeNumber) {
    const target = randomInt(words.length);
    words[target] = `${words[target]}${randomInt(10)}`;
  }
  return words.join(opts.separator);
}
