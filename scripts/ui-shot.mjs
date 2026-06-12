import { chromium } from "playwright";

const BASE = process.env.PW0D_URL ?? "http://localhost:3789";
const email = `ui-${Date.now()}@example.com`;
const master = "correct horse battery staple!";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// ---- register (runs real Argon2id in the browser) ----
await page.goto(`${BASE}/register`);
await page.fill("#email", email);
await page.fill("#password", master);
await page.fill("#confirm", master);
await page.click("button[type=submit]");
await page.waitForSelector("text=All items", { timeout: 30000 });

// ---- create a login via the UI (with a real URL so the favicon loads) ----
await page.click('button[aria-label="New item"]');
await page.click("text=New login");
await page.fill('input[placeholder="GitHub"]', "GitHub");
const inputs = page.locator("input.font-mono");
await inputs.nth(0).fill("mike@pechousek.com");
await inputs.nth(1).fill("kV9#mQ2$xL7@pR4&wN8!");
await page.fill("textarea.font-mono", "https://github.com/login");
await page.fill('input[placeholder="otpauth:// URI or base32 secret"]', "JBSWY3DPEHPK3PXP");
await page.click("button:has-text('Save')");
await page.waitForSelector("text=updated", { timeout: 15000 });

// ---- create an SSH key via the UI ----
await page.click('button[aria-label="New item"]');
await page.click("text=New SSH key");
await page.fill('input[placeholder="prod deploy key"]', "prod deploy key");
await page.fill('input[placeholder="prod-1.example.com"]', "prod-1.pechousek.com");
await page.fill('input[placeholder="deploy"]', "deploy");
await page.fill(
  'textarea[placeholder="ssh-ed25519 AAAA…"]',
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPLACEHOLDERKEYDATA deploy@pw0d",
);
await page.fill(
  'textarea[placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"]',
  "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA...placeholder...\n-----END OPENSSH PRIVATE KEY-----",
);
await page.click("button:has-text('Save')");
await page.waitForSelector("text=updated", { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/pw0d-ssh.png" });

// ---- vault with favicon + live TOTP ----
await page.click("text=GitHub");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/pw0d-vault.png" });

await browser.close();
console.log("OK", email);
