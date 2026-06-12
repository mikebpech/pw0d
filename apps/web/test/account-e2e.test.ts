/**
 * Account-security e2e against a live server: master-password change (vault
 * stays decryptable), account 2FA enroll → login challenge → disable, and
 * session listing + revoke.
 *
 *   PW0D_E2E_URL=http://localhost:3399 vitest run apps/web/test/account-e2e.test.ts
 */

import { ApiClient, ApiError } from "@pw0d/api-client";
import { type LoginData, generateTotp, parseTotpInput, serializeItemData } from "@pw0d/core";
import {
  type KdfParams,
  createAccount,
  decryptString,
  deriveLoginCredentials,
  deriveRecoveryKeys,
  encryptString,
  generateRecoveryCode,
  rewrapAccountKey,
  toBase64,
  unlockAccountKey,
  unwrapKey,
  wrapKey,
} from "@pw0d/crypto";
import { describe, expect, it } from "vitest";

const BASE_URL = process.env.PW0D_E2E_URL;
const KDF: KdfParams = { algorithm: "argon2id", memoryKiB: 1024, iterations: 1, parallelism: 1 };

async function codeFor(secret: string): Promise<string> {
  return generateTotp(parseTotpInput(secret), Date.now());
}

describe.skipIf(!BASE_URL)("account security e2e", () => {
  it("password change keeps the vault decryptable", async () => {
    const email = `acct-${Math.random().toString(36).slice(2)}@example.com`;
    const oldPw = "correct horse battery staple OLD";
    const newPw = "correct horse battery staple NEW-9";

    const client = new ApiClient({ baseUrl: BASE_URL! });
    const account = await createAccount(oldPw, email, KDF);
    await client.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });
    const oldCreds = await deriveLoginCredentials(oldPw, email, KDF);
    await client.login({ email, loginHash: oldCreds.loginHash, deviceName: "primary" });

    // Save an item under the original password.
    const itemId = crypto.randomUUID();
    const data: LoginData = {
      type: "login",
      name: "GitHub",
      username: "mike",
      password: "s3cret!",
      urls: ["https://github.com"],
      notes: "",
      customFields: [],
    };
    await client.createItem({
      id: itemId,
      type: "login",
      data: await encryptString(serializeItemData(data), account.accountKey, `item:${itemId}`),
      folderId: null,
    });

    // Change master password (re-wrap account key locally).
    const rewrapped = await rewrapAccountKey(account.accountKey, newPw, email, KDF);
    await client.changePassword({
      currentLoginHash: oldCreds.loginHash,
      newLoginHash: rewrapped.loginHash,
      kdfParams: rewrapped.kdfParams,
      protectedAccountKey: rewrapped.protectedAccountKey,
    });

    // Old password no longer logs in; new one does.
    const fresh = new ApiClient({ baseUrl: BASE_URL! });
    await expect(
      fresh.login({ email, loginHash: oldCreds.loginHash, deviceName: "x" }),
    ).rejects.toMatchObject({ status: 401 });

    const newCreds = await deriveLoginCredentials(newPw, email, KDF);
    const session = await fresh.login({ email, loginHash: newCreds.loginHash, deviceName: "after" });
    const accountKey = await unlockAccountKey(session.protectedAccountKey, newCreds.encKey);
    expect(accountKey).toEqual(account.accountKey);

    // The pre-existing item still decrypts with the recovered key.
    const sync = await fresh.sync();
    const wire = sync.items.find((entry) => entry.id === itemId)!;
    const decrypted = await decryptString(wire.data, accountKey, `item:${itemId}`);
    expect(JSON.parse(decrypted).password).toBe("s3cret!");
  }, 60_000);

  it("account 2FA: enroll → gates login → disable", async () => {
    const email = `2fa-${Math.random().toString(36).slice(2)}@example.com`;
    const pw = "correct horse battery staple 2FA";

    const client = new ApiClient({ baseUrl: BASE_URL! });
    const account = await createAccount(pw, email, KDF);
    await client.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });
    const creds = await deriveLoginCredentials(pw, email, KDF);
    await client.login({ email, loginHash: creds.loginHash, deviceName: "primary" });

    // Enroll: setup → enable with a valid code.
    const setup = await client.account2faSetup();
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    await client.account2faEnable(await codeFor(setup.secret));

    // A new login now requires the code: password alone gives totp_required.
    const fresh = new ApiClient({ baseUrl: BASE_URL! });
    await expect(
      fresh.login({ email, loginHash: creds.loginHash, deviceName: "no-2fa" }),
    ).rejects.toMatchObject({ status: 401, code: "totp_required" });

    // Wrong code rejected.
    await expect(
      fresh.login({ email, loginHash: creds.loginHash, deviceName: "bad", totpCode: "000000" }),
    ).rejects.toMatchObject({ code: "totp_invalid" });

    // Correct code succeeds.
    await fresh.login({
      email,
      loginHash: creds.loginHash,
      deviceName: "with-2fa",
      totpCode: await codeFor(setup.secret),
    });

    // Disabling requires a current code; afterwards password-only works again.
    await fresh.account2faDisable(await codeFor(setup.secret));
    const after = new ApiClient({ baseUrl: BASE_URL! });
    await after.login({ email, loginHash: creds.loginHash, deviceName: "post-disable" });
  }, 60_000);

  it("recovery code: forgotten password → recover → vault still decrypts", async () => {
    const email = `rec-${Math.random().toString(36).slice(2)}@example.com`;
    const oldPw = "the password I will FORGET";
    const newPw = "the recovered password 88!";

    const client = new ApiClient({ baseUrl: BASE_URL! });
    const account = await createAccount(oldPw, email, KDF);
    await client.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });
    const creds = await deriveLoginCredentials(oldPw, email, KDF);
    await client.login({ email, loginHash: creds.loginHash, deviceName: "primary" });

    // Save an item.
    const itemId = crypto.randomUUID();
    const data: LoginData = {
      type: "login",
      name: "Bank",
      username: "mike",
      password: "vault-secret-42",
      urls: ["https://bank.example"],
      notes: "",
      customFields: [],
    };
    await client.createItem({
      id: itemId,
      type: "login",
      data: await encryptString(serializeItemData(data), account.accountKey, `item:${itemId}`),
      folderId: null,
    });

    // Set up recovery (client wraps Account Key with recovery enc-key).
    const code = generateRecoveryCode();
    const { encKey, authKey } = await deriveRecoveryKeys(code);
    await client.recoverySetup(await wrapKey(account.accountKey, encKey), toBase64(authKey));
    expect(await client.recoveryStatus()).toBe(true);

    // …time passes, master password is forgotten. Recover from a fresh client.
    const fresh = new ApiClient({ baseUrl: BASE_URL! });
    const { encKey: recEnc, authKey: recAuth } = await deriveRecoveryKeys(code);

    // Wrong code is rejected.
    const { authKey: wrongAuth } = await deriveRecoveryKeys(generateRecoveryCode());
    await expect(fresh.recoverVerify(email, toBase64(wrongAuth))).rejects.toMatchObject({
      status: 401,
    });

    // Correct code returns the blob; unwrap the Account Key.
    const blob = await fresh.recoverVerify(email, toBase64(recAuth));
    const recovered = await unwrapKey(blob, recEnc);
    expect(recovered).toEqual(account.accountKey);

    // Re-key under the new password and reset.
    const rewrapped = await rewrapAccountKey(recovered, newPw, email, KDF);
    await fresh.recoverReset({
      email,
      recoveryAuth: toBase64(recAuth),
      newLoginHash: rewrapped.loginHash,
      kdfParams: rewrapped.kdfParams,
      protectedAccountKey: rewrapped.protectedAccountKey,
    });

    // Old password dead, new password works, and the old item still decrypts.
    await expect(
      fresh.login({ email, loginHash: creds.loginHash, deviceName: "old" }),
    ).rejects.toMatchObject({ status: 401 });
    const newCreds = await deriveLoginCredentials(newPw, email, KDF);
    const session = await fresh.login({ email, loginHash: newCreds.loginHash, deviceName: "recovered" });
    const accountKey = await unlockAccountKey(session.protectedAccountKey, newCreds.encKey);
    const sync = await fresh.sync();
    const wire = sync.items.find((e) => e.id === itemId)!;
    expect(JSON.parse(await decryptString(wire.data, accountKey, `item:${itemId}`)).password).toBe(
      "vault-secret-42",
    );
  }, 60_000);

  it("sessions: list shows current, revoke removes others", async () => {
    const email = `sess-${Math.random().toString(36).slice(2)}@example.com`;
    const pw = "correct horse battery staple SESS";

    const account = await createAccount(pw, email, KDF);
    const reg = new ApiClient({ baseUrl: BASE_URL! });
    await reg.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });
    const creds = await deriveLoginCredentials(pw, email, KDF);

    const primary = new ApiClient({ baseUrl: BASE_URL! });
    await primary.login({ email, loginHash: creds.loginHash, deviceName: "Desktop" });
    const secondary = new ApiClient({ baseUrl: BASE_URL! });
    await secondary.login({ email, loginHash: creds.loginHash, deviceName: "Phone" });

    const devices = await primary.listDevices();
    expect(devices.length).toBe(2);
    expect(devices.filter((d) => d.current)).toHaveLength(1);
    expect(devices.find((d) => d.current)!.name).toBe("Desktop");

    const phone = devices.find((d) => d.name === "Phone")!;
    await primary.revokeDevice(phone.id);
    expect((await primary.listDevices()).length).toBe(1);

    // You can't revoke another user's device (scoping).
    const otherEmail = `other-${Math.random().toString(36).slice(2)}@example.com`;
    const otherAccount = await createAccount(pw, otherEmail, KDF);
    const other = new ApiClient({ baseUrl: BASE_URL! });
    await other.register({
      email: otherEmail,
      loginHash: otherAccount.loginHash,
      kdfParams: otherAccount.kdfParams,
      protectedAccountKey: otherAccount.protectedAccountKey,
    });
    const otherCreds = await deriveLoginCredentials(pw, otherEmail, KDF);
    await other.login({ email: otherEmail, loginHash: otherCreds.loginHash, deviceName: "Intruder" });
    const myDevice = (await primary.listDevices())[0]!;
    await expect(other.revokeDevice(myDevice.id)).rejects.toBeInstanceOf(ApiError);
  }, 60_000);
});
