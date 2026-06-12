/**
 * Biometric quick-unlock e2e: a CDP virtual authenticator (CTAP2, internal
 * transport, user-verifying, PRF-capable) stands in for Touch ID. Proves the
 * full cycle: enable → lock → biometric unlock → vault open.
 *
 *   PW0D_E2E_URL=http://localhost:3000 pnpm vitest run apps/extension/test/bio-e2e.test.ts
 */

import { fileURLToPath } from "node:url";
import { ApiClient } from "@pw0d/api-client";
import { type KdfParams, createAccount } from "@pw0d/crypto";
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

const SERVER = process.env.PW0D_E2E_URL;
const EXT_DIR = fileURLToPath(new URL("../.output/chrome-mv3", import.meta.url));
const KDF: KdfParams = { algorithm: "argon2id", memoryKiB: 1024, iterations: 1, parallelism: 1 };

const cleanups: (() => Promise<void> | void)[] = [];
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

describe.skipIf(!SERVER)("biometric unlock e2e", () => {
  it("enable Touch ID → lock → biometric unlock", async () => {
    const email = `ext-${Date.now()}@example.com`;
    const master = "correct horse battery staple bio";

    const api = new ApiClient({ baseUrl: SERVER! });
    const account = await createAccount(master, email, KDF);
    await api.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });

    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
    });
    cleanups.push(() => context.close());

    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    const extId = new URL(worker.url()).host;

    const popup = await context.newPage();

    // Virtual Touch ID: platform authenticator with PRF (hmac-secret) support.
    const cdp = await context.newCDPSession(popup);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf: true,
        automaticPresenceSimulation: true,
      },
    });

    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.fill('input[placeholder="https://vault.example.com"]', SERVER!);
    await popup.fill('input[type="email"]', email);
    await popup.fill('input[type="password"]', master);
    await popup.click('button[type="submit"]');
    await popup.waitForSelector("text=Enable Touch ID unlock", { timeout: 30000 });

    // ---- enable ----
    await popup.click("text=Enable Touch ID unlock");
    await popup.waitForSelector("text=Touch ID unlock enabled", { timeout: 15000 });

    // ---- lock ----
    await popup.click('button[title="Lock vault"]');
    await popup.waitForSelector("text=Unlock with Touch ID", { timeout: 10000 });
    await popup.screenshot({ path: "/tmp/pw0d-bio-locked.png" });

    // ---- biometric unlock ----
    await popup.click("text=Unlock with Touch ID");
    await popup.waitForSelector('input[placeholder="Search vault…"]', { timeout: 15000 });
    expect(await popup.isVisible('input[placeholder="Search vault…"]')).toBe(true);
  }, 120_000);
});
