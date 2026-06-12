/**
 * Pinned test vectors. These freeze the v1 crypto outputs: if any of these
 * assertions ever fails, a change has broken compatibility with existing
 * vaults and MUST NOT ship without a versioned migration.
 *
 * Regenerate (only for an intentional, versioned format change):
 *   GEN_VECTORS=1 pnpm vitest run packages/crypto/test/vectors.test.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type KdfParams,
  computeLoginHash,
  decryptString,
  deriveMasterKey,
  deriveSubKeys,
  deriveRecoveryKeys,
  toBase64,
  unwrapKey,
  utf8,
  encryptString,
  wrapKey,
} from "../src";

const VECTORS_PATH = fileURLToPath(new URL("./vectors.json", import.meta.url));

const EMAIL = "  Vector@Example.COM "; // exercises normalization
const PASSWORD = "correct horse battery staple";
const LIGHT_KDF: KdfParams = { algorithm: "argon2id", memoryKiB: 1024, iterations: 2, parallelism: 1 };
const FIXED_KEY = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));
const FIXED_PLAINTEXT = "pw0d envelope test vector";
const FIXED_AAD = "pw0d/test";
const RECOVERY_CODE = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789";

interface Vectors {
  masterKeyDefault: string;
  masterKeyLight: string;
  encKey: string;
  authKey: string;
  loginHash: string;
  recoveryEncKey: string;
  recoveryAuthKey: string;
  envelope: string;
  wrappedKey: string;
}

async function computeDeterministic() {
  const masterKeyDefault = await deriveMasterKey(PASSWORD, EMAIL);
  const masterKeyLight = await deriveMasterKey(PASSWORD, EMAIL, LIGHT_KDF);
  const { encKey, authKey } = await deriveSubKeys(masterKeyDefault);
  return {
    masterKeyDefault: toBase64(masterKeyDefault),
    masterKeyLight: toBase64(masterKeyLight),
    encKey: toBase64(encKey),
    authKey: toBase64(authKey),
    loginHash: await computeLoginHash(authKey, EMAIL),
    recoveryEncKey: toBase64((await deriveRecoveryKeys(RECOVERY_CODE)).encKey),
    recoveryAuthKey: toBase64((await deriveRecoveryKeys(RECOVERY_CODE)).authKey),
  };
}

if (process.env.GEN_VECTORS) {
  it("generates vectors.json", async () => {
    const deterministic = await computeDeterministic();
    const vectors: Vectors = {
      ...deterministic,
      // Random IVs: pinned as decryption vectors, not by re-encryption.
      envelope: await encryptString(FIXED_PLAINTEXT, FIXED_KEY, FIXED_AAD),
      wrappedKey: await wrapKey(utf8("0123456789abcdef0123456789abcdef"), FIXED_KEY),
    };
    writeFileSync(VECTORS_PATH, `${JSON.stringify(vectors, null, 2)}\n`);
    expect(existsSync(VECTORS_PATH)).toBe(true);
  });
} else {
  describe("pinned v1 vectors", () => {
    const vectors: Vectors = JSON.parse(readFileSync(VECTORS_PATH, "utf-8"));

    it("key derivation (Argon2id + HKDF + login hash) is stable", async () => {
      const computed = await computeDeterministic();
      expect(computed).toEqual({
        masterKeyDefault: vectors.masterKeyDefault,
        masterKeyLight: vectors.masterKeyLight,
        encKey: vectors.encKey,
        authKey: vectors.authKey,
        loginHash: vectors.loginHash,
        recoveryEncKey: vectors.recoveryEncKey,
        recoveryAuthKey: vectors.recoveryAuthKey,
      });
    });

    it("decrypts a pinned v1 envelope", async () => {
      expect(await decryptString(vectors.envelope, FIXED_KEY, FIXED_AAD)).toBe(FIXED_PLAINTEXT);
    });

    it("unwraps a pinned v1 wrapped key", async () => {
      const unwrapped = await unwrapKey(vectors.wrappedKey, FIXED_KEY);
      expect(new TextDecoder().decode(unwrapped)).toBe("0123456789abcdef0123456789abcdef");
    });
  });
}
