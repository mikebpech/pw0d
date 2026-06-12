/**
 * Versioned ciphertext envelope: `v1.<base64 iv>.<base64 ciphertext+tag>`.
 * v1 is AES-256-GCM (WebCrypto), 96-bit random IV, optional AAD for context
 * binding (e.g. item id, key-wrap domain). New algorithms get a new version
 * prefix; decrypt dispatches on it, so migrations are possible.
 */

import { fromBase64, randomBytes, toBase64, utf8, utf8Decode } from "./random";

const VERSION = "v1";
const IV_LENGTH = 12;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== 32) throw new CryptoError("key must be exactly 32 bytes");
  return crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function gcmParams(iv: Uint8Array, aad?: string): AesGcmParams {
  const params: AesGcmParams = { name: "AES-GCM", iv: iv as BufferSource };
  if (aad !== undefined) params.additionalData = utf8(aad) as BufferSource;
  return params;
}

export async function encryptBytes(
  plaintext: Uint8Array,
  key: Uint8Array,
  aad?: string,
): Promise<string> {
  const aesKey = await importAesKey(key);
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(gcmParams(iv, aad), aesKey, plaintext as BufferSource),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

export async function decryptBytes(
  envelope: string,
  key: Uint8Array,
  aad?: string,
): Promise<Uint8Array> {
  const parts = envelope.split(".");
  if (parts.length !== 3) throw new CryptoError("malformed envelope");
  const [version, ivB64, ctB64] = parts;
  if (version !== VERSION) throw new CryptoError(`unsupported envelope version: ${version}`);

  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = fromBase64(ivB64!);
    ciphertext = fromBase64(ctB64!);
  } catch {
    throw new CryptoError("malformed envelope");
  }
  if (iv.length !== IV_LENGTH) throw new CryptoError("malformed envelope");

  const aesKey = await importAesKey(key);
  try {
    const plaintext = await crypto.subtle.decrypt(
      gcmParams(iv, aad),
      aesKey,
      ciphertext as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new CryptoError("decryption failed: wrong key, wrong context, or tampered data");
  }
}

export async function encryptString(plaintext: string, key: Uint8Array, aad?: string): Promise<string> {
  return encryptBytes(utf8(plaintext), key, aad);
}

export async function decryptString(envelope: string, key: Uint8Array, aad?: string): Promise<string> {
  return utf8Decode(await decryptBytes(envelope, key, aad));
}
