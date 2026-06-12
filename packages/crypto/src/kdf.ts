/**
 * Key derivation. See PLAN.md §2.1.
 *
 *   Master Password + email ──Argon2id──► Master Key (MK)
 *   MK ──HKDF──► MK-enc (wraps the Account Key)
 *           └──► MK-auth (basis for the server login hash)
 *
 * KDF parameters are versioned per user (stored server-side, returned at
 * pre-login) so they can be raised later without breaking existing accounts.
 */

import { argon2id } from "hash-wasm";
import { toBase64, utf8 } from "./random";

export interface KdfParams {
  algorithm: "argon2id";
  /** Memory cost in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: "argon2id",
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 4,
};

/** Light parameters for the second (login) hash — its input is already a full-entropy key. */
const LOGIN_HASH_PARAMS = { memoryKiB: 19456, iterations: 2, parallelism: 1 };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

/** Derive the 256-bit Master Key. Never leaves the client. */
export async function deriveMasterKey(
  masterPassword: string,
  email: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  const salt = await sha256(utf8(`pw0d/v1/salt:${normalizeEmail(email)}`));
  return argon2id({
    password: masterPassword,
    salt,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: "binary",
  });
}

/** HKDF-SHA256 expand of an input key to `length` bytes, domain-separated by `info`. */
export async function hkdf(ikm: Uint8Array, info: string, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: utf8(info) as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface SubKeys {
  /** MK-enc: wraps/unwraps the Account Key. Never leaves the client. */
  encKey: Uint8Array;
  /** MK-auth: input to the login hash. Never sent raw. */
  authKey: Uint8Array;
}

export async function deriveSubKeys(masterKey: Uint8Array): Promise<SubKeys> {
  const [encKey, authKey] = await Promise.all([
    hkdf(masterKey, "pw0d/v1/enc"),
    hkdf(masterKey, "pw0d/v1/auth"),
  ]);
  return { encKey, authKey };
}

/**
 * The value sent to the server to authenticate (over TLS). The server stores
 * argon2id(loginHash) and compares — it never learns MK or the password.
 */
export async function computeLoginHash(authKey: Uint8Array, email: string): Promise<string> {
  const salt = await sha256(utf8(`pw0d/v1/login:${normalizeEmail(email)}`));
  const hash = await argon2id({
    password: authKey,
    salt,
    iterations: LOGIN_HASH_PARAMS.iterations,
    memorySize: LOGIN_HASH_PARAMS.memoryKiB,
    parallelism: LOGIN_HASH_PARAMS.parallelism,
    hashLength: 32,
    outputType: "binary",
  });
  return toBase64(hash);
}
