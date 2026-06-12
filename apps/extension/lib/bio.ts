/**
 * Biometric quick unlock (Touch ID / Windows Hello) via WebAuthn PRF.
 *
 * Honest crypto, not UI theater: enabling creates a platform passkey with the
 * PRF extension; its PRF output (released only after user verification) is
 * HKDF'd into a wrapping key for a second copy of the Account Key. The PRF
 * secret never persists — storage.local holds only ciphertext + salt, useless
 * without the authenticator + your fingerprint.
 */

import { fromBase64, hkdf, randomBytes, toBase64, unwrapKey, wrapKey } from "@pw0d/crypto";

interface BioConfig {
  credentialId: string;
  salt: string;
  wrappedAccountKey: string;
}

const PRF_INFO = "pw0d/v1/bio-unlock";

export async function isBiometricsAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== "undefined" &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

export async function getBioConfig(): Promise<BioConfig | null> {
  const { bio } = await browser.storage.local.get("bio");
  return (bio as BioConfig | undefined) ?? null;
}

export async function disableBiometrics(): Promise<void> {
  await browser.storage.local.remove("bio");
}

async function prfSecret(credentialId: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      allowCredentials: [{ type: "public-key", id: credentialId as BufferSource }],
      userVerification: "required",
      extensions: { prf: { eval: { first: salt as BufferSource } } },
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("biometric prompt was dismissed");
  const result = assertion.getClientExtensionResults().prf?.results?.first;
  if (!result) throw new Error("this authenticator doesn't support PRF");
  return new Uint8Array(result as ArrayBuffer);
}

/** Create the passkey + wrap the Account Key. Call while unlocked. */
export async function enableBiometrics(accountKey: Uint8Array, email: string): Promise<void> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      rp: { name: "pw0d" },
      user: {
        id: randomBytes(16) as BufferSource,
        name: email,
        displayName: `pw0d quick unlock (${email})`,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      extensions: { prf: {} },
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("passkey creation was dismissed");
  if (!credential.getClientExtensionResults().prf?.enabled) {
    throw new Error("this device's authenticator doesn't support PRF");
  }

  const credentialId = new Uint8Array(credential.rawId);
  const salt = randomBytes(32);
  const secret = await prfSecret(credentialId, salt);
  const wrappingKey = await hkdf(secret, PRF_INFO);
  const config: BioConfig = {
    credentialId: toBase64(credentialId),
    salt: toBase64(salt),
    wrappedAccountKey: await wrapKey(accountKey, wrappingKey),
  };
  await browser.storage.local.set({ bio: config });
}

/** Touch ID → PRF secret → unwrap the Account Key. */
export async function biometricUnlock(): Promise<Uint8Array> {
  const config = await getBioConfig();
  if (!config) throw new Error("biometric unlock is not set up");
  const secret = await prfSecret(fromBase64(config.credentialId), fromBase64(config.salt));
  const wrappingKey = await hkdf(secret, PRF_INFO);
  return unwrapKey(config.wrappedAccountKey, wrappingKey);
}
