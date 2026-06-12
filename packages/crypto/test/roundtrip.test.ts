import { describe, expect, it } from "vitest";
import {
  CryptoError,
  type KdfParams,
  createAccount,
  decryptBytes,
  decryptString,
  deriveLoginCredentials,
  encryptBytes,
  encryptString,
  fromBase64,
  generateAccountKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  randomBytes,
  deriveRecoveryKeys,
  rewrapAccountKey,
  toBase64,
  unlockAccountKey,
  unwrapKey,
  wrapKey,
} from "../src";

// Light KDF params so ceremony tests run fast; crypto correctness is identical.
const LIGHT_KDF: KdfParams = {
  algorithm: "argon2id",
  memoryKiB: 1024,
  iterations: 1,
  parallelism: 1,
};

describe("envelope", () => {
  const key = randomBytes(32);

  it("round-trips bytes", async () => {
    const plaintext = randomBytes(1024);
    const envelope = await encryptBytes(plaintext, key);
    expect(await decryptBytes(envelope, key)).toEqual(plaintext);
  });

  it("round-trips strings with AAD", async () => {
    const envelope = await encryptString("hunter2 🔐", key, "item:abc123");
    expect(await decryptString(envelope, key, "item:abc123")).toBe("hunter2 🔐");
  });

  it("produces a fresh IV every time", async () => {
    const a = await encryptString("same input", key);
    const b = await encryptString("same input", key);
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("rejects tampered ciphertext", async () => {
    const envelope = await encryptString("secret", key);
    const [v, iv, ct] = envelope.split(".");
    const bytes = fromBase64(ct!);
    bytes[0]! ^= 0xff;
    const tampered = `${v}.${iv}.${toBase64(bytes)}`;
    await expect(decryptString(tampered, key)).rejects.toThrow(CryptoError);
  });

  it("rejects the wrong key", async () => {
    const envelope = await encryptString("secret", key);
    await expect(decryptString(envelope, randomBytes(32))).rejects.toThrow(CryptoError);
  });

  it("rejects a missing or wrong AAD", async () => {
    const envelope = await encryptString("secret", key, "context-a");
    await expect(decryptString(envelope, key)).rejects.toThrow(CryptoError);
    await expect(decryptString(envelope, key, "context-b")).rejects.toThrow(CryptoError);
  });

  it("rejects malformed and unknown-version envelopes", async () => {
    await expect(decryptString("not-an-envelope", key)).rejects.toThrow(CryptoError);
    await expect(decryptString("v9.AAAA.AAAA", key)).rejects.toThrow(CryptoError);
  });

  it("rejects keys that are not 32 bytes", async () => {
    await expect(encryptString("x", randomBytes(16))).rejects.toThrow(CryptoError);
  });
});

describe("key wrapping", () => {
  it("round-trips", async () => {
    const accountKey = generateAccountKey();
    const wrappingKey = randomBytes(32);
    const wrapped = await wrapKey(accountKey, wrappingKey);
    expect(await unwrapKey(wrapped, wrappingKey)).toEqual(accountKey);
  });

  it("a wrapped key cannot be opened as plain data (AAD domain separation)", async () => {
    const wrappingKey = randomBytes(32);
    const wrapped = await wrapKey(generateAccountKey(), wrappingKey);
    await expect(decryptBytes(wrapped, wrappingKey)).rejects.toThrow(CryptoError);
  });
});

describe("account ceremonies", () => {
  const email = "mike@example.com";
  const password = "correct horse battery staple";

  it("signup → login → unlock round-trips the Account Key", async () => {
    const account = await createAccount(password, email, LIGHT_KDF);
    const creds = await deriveLoginCredentials(password, email, account.kdfParams);
    expect(creds.loginHash).toBe(account.loginHash);
    const unlocked = await unlockAccountKey(account.protectedAccountKey, creds.encKey);
    expect(unlocked).toEqual(account.accountKey);
  });

  it("wrong master password fails to unlock and produces a different login hash", async () => {
    const account = await createAccount(password, email, LIGHT_KDF);
    const wrong = await deriveLoginCredentials("wrong password", email, account.kdfParams);
    expect(wrong.loginHash).not.toBe(account.loginHash);
    await expect(unlockAccountKey(account.protectedAccountKey, wrong.encKey)).rejects.toThrow(
      CryptoError,
    );
  });

  it("email normalization: ' Mike@EXAMPLE.com ' derives the same keys", async () => {
    const account = await createAccount(password, "  Mike@EXAMPLE.com ", LIGHT_KDF);
    const creds = await deriveLoginCredentials(password, email, account.kdfParams);
    expect(creds.loginHash).toBe(account.loginHash);
  });

  it("master-password change re-wraps the same Account Key", async () => {
    const account = await createAccount(password, email, LIGHT_KDF);
    const rewrapped = await rewrapAccountKey(account.accountKey, "new password 42", email, LIGHT_KDF);
    expect(rewrapped.loginHash).not.toBe(account.loginHash);
    const creds = await deriveLoginCredentials("new password 42", email, LIGHT_KDF);
    const unlocked = await unlockAccountKey(rewrapped.protectedAccountKey, creds.encKey);
    expect(unlocked).toEqual(account.accountKey);
  });
});

describe("recovery codes", () => {
  it("generates the documented format", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it("normalization forgives case, separators, and look-alikes", () => {
    expect(normalizeRecoveryCode("abcd-efgh-jkmn-pqrs-tvwx-yz01-2345-6789")).toBe(
      normalizeRecoveryCode("ABCDEFGH JKMN PQRS TVWX YZO1 2345 6789".replace(/ /g, "")),
    );
  });

  it("recovery key wraps and recovers the Account Key", async () => {
    const code = generateRecoveryCode();
    const accountKey = generateAccountKey();
    const { encKey } = await deriveRecoveryKeys(code);
    const wrapped = await wrapKey(accountKey, encKey);
    const sloppy = code.toLowerCase().replace(/-/g, " ");
    const { encKey: encKey2, authKey } = await deriveRecoveryKeys(sloppy);
    expect(await unwrapKey(wrapped, encKey2)).toEqual(accountKey);
    // enc and auth branches are independent: authKey can't open the blob.
    await expect(unwrapKey(wrapped, authKey)).rejects.toThrow();
  });

  it("rejects garbage codes", () => {
    expect(() => normalizeRecoveryCode("too-short")).toThrow(CryptoError);
  });
});
