/**
 * High-level key ceremonies — the only entry points apps should need for
 * signup, login, and unlock. See PLAN.md §2.
 */

import { CryptoError } from "./envelope";
import {
  DEFAULT_KDF_PARAMS,
  type KdfParams,
  computeLoginHash,
  deriveMasterKey,
  deriveSubKeys,
} from "./kdf";
import { generateAccountKey, unwrapKey, wrapKey } from "./keys";

export interface CreatedAccount {
  /** Stored by the server, returned at pre-login. */
  kdfParams: KdfParams;
  /** Account Key wrapped by MK-enc. Ciphertext — safe to store server-side. */
  protectedAccountKey: string;
  /** Sent to the server, which stores argon2id(loginHash). */
  loginHash: string;
  /** Plaintext Account Key — keep in memory only, never persist. */
  accountKey: Uint8Array;
}

/** Signup ceremony: derive keys, generate + wrap the Account Key. */
export async function createAccount(
  masterPassword: string,
  email: string,
  kdfParams: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<CreatedAccount> {
  const masterKey = await deriveMasterKey(masterPassword, email, kdfParams);
  const { encKey, authKey } = await deriveSubKeys(masterKey);
  const accountKey = generateAccountKey();
  const protectedAccountKey = await wrapKey(accountKey, encKey);
  const loginHash = await computeLoginHash(authKey, email);
  return { kdfParams, protectedAccountKey, loginHash, accountKey };
}

export interface LoginCredentials {
  loginHash: string;
  /** MK-enc — held briefly to unwrap the protected Account Key after auth. */
  encKey: Uint8Array;
}

/** Login/unlock ceremony, step 1: derive what's needed to authenticate. */
export async function deriveLoginCredentials(
  masterPassword: string,
  email: string,
  kdfParams: KdfParams,
): Promise<LoginCredentials> {
  const masterKey = await deriveMasterKey(masterPassword, email, kdfParams);
  const { encKey, authKey } = await deriveSubKeys(masterKey);
  const loginHash = await computeLoginHash(authKey, email);
  return { loginHash, encKey };
}

/** Login/unlock ceremony, step 2: recover the Account Key from the server blob. */
export async function unlockAccountKey(
  protectedAccountKey: string,
  encKey: Uint8Array,
): Promise<Uint8Array> {
  try {
    return await unwrapKey(protectedAccountKey, encKey);
  } catch {
    throw new CryptoError("unlock failed: wrong master password or corrupted key blob");
  }
}

/**
 * Master-password change: re-wrap the Account Key under the new MK-enc.
 * No item ciphertext is touched.
 */
export async function rewrapAccountKey(
  accountKey: Uint8Array,
  newMasterPassword: string,
  email: string,
  kdfParams: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<{ kdfParams: KdfParams; protectedAccountKey: string; loginHash: string }> {
  const masterKey = await deriveMasterKey(newMasterPassword, email, kdfParams);
  const { encKey, authKey } = await deriveSubKeys(masterKey);
  const protectedAccountKey = await wrapKey(accountKey, encKey);
  const loginHash = await computeLoginHash(authKey, email);
  return { kdfParams, protectedAccountKey, loginHash };
}
