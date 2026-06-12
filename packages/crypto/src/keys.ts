/**
 * Account Key generation, key wrapping, and recovery codes. See PLAN.md §2.1, §2.4.
 *
 * The Account Key (AK) is a random 256-bit key that encrypts all vault data.
 * It is wrapped by MK-enc — so a master-password change re-wraps one blob and
 * never touches item ciphertext. Per-item keys (also wrapped by AK) enable
 * sharing and re-keying later.
 */

import { CryptoError, decryptBytes, encryptBytes } from "./envelope";
import { hkdf } from "./kdf";
import { randomBytes, randomInt } from "./random";

const KEY_WRAP_AAD = "pw0d/v1/key-wrap";

export function generateAccountKey(): Uint8Array {
  return randomBytes(32);
}

export function generateItemKey(): Uint8Array {
  return randomBytes(32);
}

/** Encrypt one 256-bit key under another (AES-256-GCM, domain-bound AAD). */
export async function wrapKey(key: Uint8Array, wrappingKey: Uint8Array): Promise<string> {
  if (key.length !== 32) throw new CryptoError("can only wrap 32-byte keys");
  return encryptBytes(key, wrappingKey, KEY_WRAP_AAD);
}

export async function unwrapKey(envelope: string, wrappingKey: Uint8Array): Promise<Uint8Array> {
  const key = await decryptBytes(envelope, wrappingKey, KEY_WRAP_AAD);
  if (key.length !== 32) throw new CryptoError("unwrapped value is not a 32-byte key");
  return key;
}

/**
 * Recovery codes: 160 bits, Crockford base32, shown once at setup
 * (`XXXX-XXXX-…`, 8 groups). The derived key wraps a second copy of the
 * Account Key server-side; without the code that blob is useless.
 */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 8; g++) {
    let group = "";
    for (let c = 0; c < 4; c++) {
      group += CROCKFORD[randomInt(32)]!;
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Forgiving normalization: case, separators, and the usual look-alikes (O→0, I/L→1). */
export function normalizeRecoveryCode(code: string): string {
  const cleaned = code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== 32 || [...cleaned].some((ch) => !CROCKFORD.includes(ch))) {
    throw new CryptoError("invalid recovery code");
  }
  return cleaned;
}

export interface RecoveryKeys {
  /** Wraps a second copy of the Account Key. Never leaves the client. */
  encKey: Uint8Array;
  /**
   * Proves recovery-code knowledge to the server. The server stores
   * argon2id(authKey) and never sees encKey — and because HKDF branches are
   * independent, authKey can never be used to derive encKey. So even a
   * malicious operator who sees authKey during a reset cannot decrypt the
   * recovery blob. This is what keeps recovery zero-knowledge.
   */
  authKey: Uint8Array;
}

export async function deriveRecoveryKeys(code: string): Promise<RecoveryKeys> {
  const ikm = new TextEncoder().encode(normalizeRecoveryCode(code));
  const [encKey, authKey] = await Promise.all([
    hkdf(ikm, "pw0d/v1/recovery-enc"),
    hkdf(ikm, "pw0d/v1/recovery-auth"),
  ]);
  return { encKey, authKey };
}
