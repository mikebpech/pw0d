/**
 * Bridge to the native iOS AutoFill credential provider (see
 * `targets/autofill/`). The app pushes a compact, **encrypted** credential
 * cache into a shared App Group whenever the vault syncs; the system AutoFill
 * extension reads it to offer "fill this login" above the keyboard.
 *
 * Security model (PLAN.md §"Mobile autofill"): the app never writes plaintext
 * passwords to shared storage. It hands the native module the credential list;
 * the native side encrypts it with a random 256-bit cache key kept in a
 * biometric-gated, App-Group-shared Keychain item. The extension decrypts only
 * the single credential the user taps, behind a Face ID prompt.
 *
 * The native module is only present in a custom dev/EAS build that includes the
 * autofill target. In Expo Go or a plain build it is absent — every call here
 * becomes a safe no-op, so the companion app works with or without it.
 */

import { requireOptionalNativeModule } from "expo-modules-core";

export interface AutofillCredential {
  /** Stable id = vault item id, so the extension can deep-link back. */
  id: string;
  /** Service identifier the OS matches against: a bare host, e.g. "github.com". */
  domain: string;
  username: string;
  password: string;
}

interface Pw0dAutofillModule {
  readonly isSupported: boolean;
  /** Encrypt + persist the credential set into the shared App Group. */
  saveCredentials(credentials: AutofillCredential[]): Promise<void>;
  /** Wipe the shared cache + destroy the cache key (lock / logout). */
  clearCredentials(): Promise<void>;
}

const native = requireOptionalNativeModule<Pw0dAutofillModule>("Pw0dAutofill");

/** True only on an iOS build that bundled the AutoFill target. */
export const autofillSupported = process.env.EXPO_OS === "ios" && native?.isSupported === true;

/**
 * Mirror the unlocked vault's logins into the AutoFill cache. Only items with a
 * username, a password, and at least one resolvable host are included — an
 * empty/partial login is useless to the OS matcher and just noise.
 */
export async function syncAutofillCache(credentials: AutofillCredential[]): Promise<void> {
  if (!autofillSupported || !native) return;
  try {
    await native.saveCredentials(credentials);
  } catch (error) {
    // Non-fatal: the in-app vault is the source of truth; AutoFill is a bonus.
    console.warn("pw0d: failed to update AutoFill cache", error);
  }
}

export async function clearAutofillCache(): Promise<void> {
  if (!autofillSupported || !native) return;
  try {
    await native.clearCredentials();
  } catch (error) {
    console.warn("pw0d: failed to clear AutoFill cache", error);
  }
}

/** Reduce a vault host/URL to the bare host the OS AutoFill matcher expects. */
export function hostFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
