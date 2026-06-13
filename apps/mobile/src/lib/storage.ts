/**
 * Persistence for the mobile vault. Two tiers, both backed by the iOS Keychain
 * / Android Keystore via expo-secure-store:
 *
 *  - **Session** (non-secret material): server URL, email, KDF params, the
 *    *wrapped* Account Key, and API tokens. Readable without a biometric
 *    prompt so the app can tell on launch that it's logged in (→ lock screen).
 *
 *  - **Account Key** (the only real secret at rest): the unwrapped 256-bit AK,
 *    stored behind `requireAuthentication` so retrieving it forces a Face ID /
 *    passcode prompt. This is what makes biometric unlock possible *without*
 *    re-running Argon2 over the master password on every open.
 */

import * as SecureStore from "expo-secure-store";
import type { Tokens } from "@pw0d/api-client";
import type { ItemData, ItemType } from "@pw0d/core";
import type { KdfParams } from "@pw0d/crypto";
import { decryptString, encryptString, fromBase64, toBase64 } from "@pw0d/crypto";

const SESSION_KEY = "pw0d.session";
const ACCOUNT_KEY = "pw0d.accountKey";
const VAULT_CACHE_KEY = "pw0d.vaultCache";

export interface PersistedSession {
  serverUrl: string;
  email: string;
  kdfParams: KdfParams;
  protectedAccountKey: string;
  tokens: Tokens | null;
}

export interface CachedVaultItem {
  id: string;
  type: ItemType;
  folderId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: ItemData;
}

export interface CachedVaultFolder {
  id: string;
  name: string;
}

export interface CachedVault {
  items: CachedVaultItem[];
  folders: CachedVaultFolder[];
  revision: number;
  cachedAt: string;
}

export async function loadSession(): Promise<PersistedSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: PersistedSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function loadVaultCache(accountKey: Uint8Array): Promise<CachedVault | null> {
  const encrypted = await SecureStore.getItemAsync(VAULT_CACHE_KEY);
  if (!encrypted) return null;
  try {
    return JSON.parse(await decryptString(encrypted, accountKey, "mobile:vault-cache")) as CachedVault;
  } catch {
    await SecureStore.deleteItemAsync(VAULT_CACHE_KEY);
    return null;
  }
}

export async function saveVaultCache(cache: Omit<CachedVault, "cachedAt">, accountKey: Uint8Array): Promise<void> {
  const encrypted = await encryptString(
    JSON.stringify({ ...cache, cachedAt: new Date().toISOString() } satisfies CachedVault),
    accountKey,
    "mobile:vault-cache",
  );
  await SecureStore.setItemAsync(VAULT_CACHE_KEY, encrypted, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearVaultCache(): Promise<void> {
  await SecureStore.deleteItemAsync(VAULT_CACHE_KEY);
}

/**
 * Store the unwrapped Account Key behind a biometric/passcode gate. The next
 * `loadAccountKey()` will surface the OS authentication prompt.
 */
export async function saveAccountKey(accountKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_KEY, toBase64(accountKey), {
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Retrieve the Account Key, prompting for biometrics. Null if not enrolled. */
export async function loadAccountKey(promptMessage: string): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(ACCOUNT_KEY, {
    requireAuthentication: true,
    authenticationPrompt: promptMessage,
  });
  return stored ? fromBase64(stored) : null;
}

export async function clearAccountKey(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNT_KEY);
}

/** True once a biometric-gated Account Key has been enrolled on this device. */
export async function hasEnrolledKey(): Promise<boolean> {
  // A bare existence check still trips the auth gate on iOS, so we instead infer
  // enrollment from the session: the key is written iff a session exists.
  return (await loadSession()) !== null;
}
