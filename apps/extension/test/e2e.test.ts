/**
 * Extension e2e: loads the built MV3 extension into Chromium, logs in via the
 * popup against a live pw0d server, then proves inline autofill on a fixture
 * login page. The inline menu lives in a CLOSED shadow root (by design), so
 * the menu click is done by coordinates relative to the focused input.
 *
 * Prereqs: `pnpm --filter @pw0d/extension build` and a running server.
 *   PW0D_E2E_URL=http://localhost:3000 pnpm vitest run apps/extension/test/e2e.test.ts
 */

import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiClient } from "@pw0d/api-client";
import { type LoginData, serializeItemData } from "@pw0d/core";
import { type KdfParams, createAccount, deriveLoginCredentials, encryptString } from "@pw0d/crypto";
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

const SERVER = process.env.PW0D_E2E_URL;
const EXT_DIR = fileURLToPath(new URL("../.output/chrome-mv3", import.meta.url));
const FIXTURE = readFileSync(fileURLToPath(new URL("../../../scripts/fixtures/login.html", import.meta.url)));
const FIXTURE_SHADOW = readFileSync(
  fileURLToPath(new URL("../../../scripts/fixtures/shadow-login.html", import.meta.url)),
);
const FIXTURE_SIGNUP = readFileSync(
  fileURLToPath(new URL("../../../scripts/fixtures/signup.html", import.meta.url)),
);
const KDF: KdfParams = { algorithm: "argon2id", memoryKiB: 1024, iterations: 1, parallelism: 1 };

const cleanups: (() => Promise<void> | void)[] = [];
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

describe.skipIf(!SERVER)("extension e2e", () => {
  it("popup login → inline menu autofill → save prompt", async () => {
    const email = `ext-${Date.now()}@example.com`;
    const master = "correct horse battery staple ext";

    // ---- fixture site on :8077 ----
    const fixture: Server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      if (req.url?.startsWith("/shadow")) res.end(FIXTURE_SHADOW);
      else if (req.url?.startsWith("/signup")) res.end(FIXTURE_SIGNUP);
      else res.end(FIXTURE);
    });
    await new Promise<void>((resolve) => fixture.listen(8077, resolve));
    cleanups.push(() => void fixture.close());

    // ---- seed account + one matching login item via the API ----
    const api = new ApiClient({ baseUrl: SERVER! });
    const account = await createAccount(master, email, KDF);
    await api.register({
      email,
      loginHash: account.loginHash,
      kdfParams: account.kdfParams,
      protectedAccountKey: account.protectedAccountKey,
    });
    const creds = await deriveLoginCredentials(master, email, KDF);
    await api.login({ email, loginHash: creds.loginHash, deviceName: "e2e-seed" });
    const itemId = crypto.randomUUID();
    const data: LoginData = {
      type: "login",
      name: "Fixture",
      username: "mike@fixture.test",
      password: "s3cret-fixture-pw!",
      urls: ["http://localhost:8077"],
      notes: "",
      customFields: [],
    };
    await api.createItem({
      id: itemId,
      type: "login",
      data: await encryptString(serializeItemData(data), account.accountKey, `item:${itemId}`),
      folderId: null,
    });

    // ---- browser with the extension loaded ----
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
    });
    cleanups.push(() => context.close());

    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    const extId = new URL(worker.url()).host;

    // ---- log in through the real popup UI ----
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.fill('input[placeholder="https://vault.example.com"]', SERVER!);
    await popup.fill('input[type="email"]', email);
    await popup.fill('input[type="password"]', master);
    await popup.click('button[type="submit"]');
    await popup.waitForSelector('input[placeholder="Search vault…"]', { timeout: 30000 });
    await popup.waitForSelector("text=Fixture", { timeout: 10000 });
    await popup.screenshot({ path: "/tmp/pw0d-ext-popup.png" });

    // ---- inline autofill on the fixture page ----
    const page = await context.newPage();
    await page.goto("http://localhost:8077/");
    await page.click("#password");
    await page.waitForTimeout(900); // menu fetch + render
    const box = await page.locator("#password").boundingBox();
    expect(box).not.toBeNull();
    await page.screenshot({ path: "/tmp/pw0d-ext-menu.png" });
    // Menu: 4px below input; header ~29px; first row center ~+22px.
    await page.mouse.click(box!.x + 60, box!.y + box!.height + 4 + 29 + 22);
    await page.waitForTimeout(300);

    expect(await page.inputValue("#email")).toBe(data.username);
    expect(await page.inputValue("#password")).toBe(data.password);
    await page.screenshot({ path: "/tmp/pw0d-ext-filled.png" });

    // ---- shadow-DOM form (Reddit-style web components) ----
    const shadowPage = await context.newPage();
    await shadowPage.goto("http://localhost:8077/shadow");
    await shadowPage.click("#s-password"); // playwright pierces open shadow roots
    await shadowPage.waitForTimeout(900);
    const shadowBox = await shadowPage.locator("#s-password").boundingBox();
    expect(shadowBox).not.toBeNull();
    await shadowPage.mouse.click(shadowBox!.x + 60, shadowBox!.y + shadowBox!.height + 4 + 29 + 22);
    await shadowPage.waitForTimeout(300);
    expect(await shadowPage.inputValue("#s-email")).toBe(data.username);
    expect(await shadowPage.inputValue("#s-password")).toBe(data.password);
    await shadowPage.close();

    // ---- signup flow: email prefill suggestion + generate (NOT old creds) ----
    const signupPage = await context.newPage();
    await signupPage.goto("http://localhost:8077/signup");
    await signupPage.click("#su-email");
    await signupPage.waitForTimeout(900);
    const emailBox = await signupPage.locator("#su-email").boundingBox();
    await signupPage.screenshot({ path: "/tmp/pw0d-ext-signup-email.png" });
    // First suggestion row sits right under the header.
    await signupPage.mouse.click(emailBox!.x + 60, emailBox!.y + emailBox!.height + 4 + 29 + 22);
    await signupPage.waitForTimeout(200);
    expect(await signupPage.inputValue("#su-email")).toBe(data.username);

    await signupPage.click("#su-password");
    await signupPage.waitForTimeout(900);
    const pwBox = await signupPage.locator("#su-password").boundingBox();
    await signupPage.screenshot({ path: "/tmp/pw0d-ext-signup-pw.png" });
    // Signup password menu: generate is the FIRST row (matches stay collapsed).
    await signupPage.mouse.click(pwBox!.x + 60, pwBox!.y + pwBox!.height + 4 + 29 + 22);
    await signupPage.waitForTimeout(400);
    const generated = await signupPage.inputValue("#su-password");
    expect(generated.length).toBeGreaterThanOrEqual(16);
    expect(generated).not.toBe(data.password); // generated, not an old credential
    expect(await signupPage.inputValue("#su-confirm")).toBe(generated); // confirm filled too
    await signupPage.close();

    // ---- save prompt: submit a NEW credential → banner → SAVED to server ----
    await page.bringToFront();
    await page.fill("#email", "new-user@fixture.test");
    await page.fill("#password", "brand-new-password-1!");
    await page.click("button[type=submit]");
    await page.waitForURL(/email=/, { timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "/tmp/pw0d-ext-banner.png" });
    // Accept: the Save button sits at the banner's bottom (320px card, right:16).
    // Closed shadow root → click by coordinates, probing a few y positions.
    const viewport = page.viewportSize()!;
    const saveX = viewport.width - 16 - 320 + 14 + 71;
    let saved = false;
    for (const saveY of [301, 311, 291, 321, 281, 331]) {
      await page.mouse.click(saveX, saveY);
      await page.waitForTimeout(700);
      const state = await api.sync();
      saved = state.items.filter((item) => !item.deletedAt).length === 2;
      if (saved) break;
    }
    expect(saved).toBe(true);
  }, 120_000);
});
