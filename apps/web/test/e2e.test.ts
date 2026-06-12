/**
 * End-to-end smoke test against a RUNNING server. The full zero-knowledge
 * flow: signup ceremony → login → encrypt/create → sync → decrypt → update
 * (incl. stale-write conflict) → delete. Run via scripts/e2e.sh, or:
 *   PW0D_E2E_URL=http://localhost:3789 vitest run apps/web/test/e2e.test.ts
 */

import { ApiClient, ApiError } from "@pw0d/api-client";
import { type LoginData, parseItemData, serializeItemData } from "@pw0d/core";
import {
  type KdfParams,
  createAccount,
  decryptString,
  deriveLoginCredentials,
  encryptString,
  unlockAccountKey,
} from "@pw0d/crypto";
import { describe, expect, it } from "vitest";

const BASE_URL = process.env.PW0D_E2E_URL;

// Light KDF for test speed — the server accepts any sane params.
const KDF: KdfParams = { algorithm: "argon2id", memoryKiB: 1024, iterations: 1, parallelism: 1 };

describe.skipIf(!BASE_URL)("e2e: full vault lifecycle", () => {
  const email = `e2e-${Math.random().toString(36).slice(2)}@example.com`;
  const masterPassword = "correct horse battery staple e2e";

  it("register → login → create → sync → update → conflict → delete", async () => {
    const client = new ApiClient({ baseUrl: BASE_URL! });

    // ---- signup ceremony ----
    const account = await createAccount(masterPassword, email, KDF);
    await client.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });

    // ---- prelogin returns our params ----
    const { kdfParams } = await client.prelogin(email);
    expect(kdfParams).toEqual(KDF);

    // ---- wrong password is rejected ----
    const badCreds = await deriveLoginCredentials("wrong password", email, kdfParams);
    await expect(
      client.login({ email, loginHash: badCreds.loginHash, deviceName: "e2e" }),
    ).rejects.toMatchObject({ status: 401 });

    // ---- login + unlock ----
    const creds = await deriveLoginCredentials(masterPassword, email, kdfParams);
    const session = await client.login({ email, loginHash: creds.loginHash, deviceName: "e2e" });
    const accountKey = await unlockAccountKey(session.protectedAccountKey, creds.encKey);
    expect(accountKey).toEqual(account.accountKey);

    // ---- create an encrypted item ----
    const data: LoginData = {
      type: "login",
      name: "GitHub",
      username: "mike",
      password: "hunter2!",
      urls: ["https://github.com"],
      notes: "",
      customFields: [],
    };
    const itemId = crypto.randomUUID();
    const envelope = await encryptString(serializeItemData(data), accountKey, `item:${itemId}`);
    const created = await client.createItem({ id: itemId, type: "login", data: envelope, folderId: null });
    expect(created.revision).toBe(1);

    // ---- sync returns ciphertext we can decrypt; server stores no plaintext ----
    const sync = await client.sync();
    expect(sync.revision).toBe(1);
    expect(sync.items).toHaveLength(1);
    const wire = sync.items[0]!;
    expect(wire.data).not.toContain("hunter2");
    expect(wire.data).not.toContain("GitHub");
    const decrypted = parseItemData(await decryptString(wire.data, accountKey, `item:${itemId}`));
    expect(decrypted).toEqual(data);

    // ---- stale write is rejected with 409 ----
    const updatedEnvelope = await encryptString(
      serializeItemData({ ...data, password: "new-password-9" }),
      accountKey,
      `item:${itemId}`,
    );
    await expect(
      client.updateItem(itemId, { data: updatedEnvelope, folderId: null, ifRevision: 999 }),
    ).rejects.toMatchObject({ status: 409, code: "stale_write" });

    // ---- correct update succeeds ----
    const updated = await client.updateItem(itemId, {
      data: updatedEnvelope,
      folderId: null,
      ifRevision: wire.revision,
    });
    expect(updated.revision).toBe(2);

    // ---- incremental sync only returns the change ----
    const delta = await client.sync(1);
    expect(delta.items).toHaveLength(1);
    expect(delta.items[0]!.revision).toBe(2);

    // ---- folders round-trip ----
    const folderId = crypto.randomUUID();
    const folderEnvelope = await encryptString("Work", accountKey, `folder:${folderId}`);
    await client.upsertFolder({ id: folderId, name: folderEnvelope });
    const withFolder = await client.sync();
    expect(withFolder.folders).toHaveLength(1);
    expect(
      await decryptString(withFolder.folders[0]!.name, accountKey, `folder:${folderId}`),
    ).toBe("Work");

    // ---- delete soft-deletes and shows up in sync ----
    await client.deleteItem(itemId);
    const afterDelete = await client.sync();
    expect(afterDelete.items[0]!.deletedAt).not.toBeNull();

    // ---- auth is actually enforced ----
    const anonymous = new ApiClient({ baseUrl: BASE_URL! });
    await expect(anonymous.sync()).rejects.toBeInstanceOf(ApiError);
  }, 60_000);
});
