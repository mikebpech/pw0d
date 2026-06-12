# pw0d

**A self-hosted, zero-knowledge password manager you run on a $5 server.**

pw0d gives you a slick web vault, a browser extension with real autofill, and
(soon) a mobile app — all talking to a server *you* control. Your passwords are
encrypted on your own devices before they're ever sent anywhere. The server only
stores ciphertext and can never read your vault. Host it for just yourself, or
for your family and friends — no one can read anyone else's passwords, not even
you as the operator.

It's a NordPass/1Password/Bitwarden-style manager without the subscription and
without trusting someone else's cloud.

---

## Features

- **Web vault** — fast three-pane UI, ⌘K command palette, search-as-you-type,
  folders, site favicons. Items: logins, secure notes, and SSH keys.
- **Password generator** — characters or passphrases (EFF wordlist), strength
  meter, everywhere you need it.
- **Two-factor codes (TOTP)** — store your 2FA secrets and pw0d shows the live
  6-digit code with a countdown; the extension can fill or copy it for you.
- **Browser extension** (Chrome) — inline autofill that appears when you click a
  login field, an in-field pw0d icon, save/update prompts after you log in,
  signup detection (offers to generate, never pushes old passwords at you),
  Touch ID / Windows Hello quick-unlock, and a popup mini-vault.
- **Account security** — change your master password (re-keys locally, nothing
  re-encrypted), account 2FA, a one-time **recovery code** so a forgotten master
  password isn't game over, and a sessions list you can revoke devices from.
- **Migration** — import your NordPass CSV; export to JSON/CSV anytime.
- **Self-hosting** — one Docker container, one command to deploy, automatic
  HTTPS. SQLite means backups are a single file.

---

## How it works

### Zero-knowledge: the server never sees your passwords

The core idea is that **all encryption happens on your device**, and the server
only ever holds encrypted blobs it can't open.

```
Your master password + email
        │  Argon2id  (slow, memory-hard — expensive to brute-force)
        ▼
   Master Key ───────────────────────────── never leaves your device
        │  HKDF (splits into two independent keys)
        ├──► encryption key ──┐
        └──► auth key         │  proves who you are to the server,
                              │  without revealing your password
                              ▼
                        Account Key (a random key that actually
                        encrypts your vault) — stored on the server
                        only as ciphertext, wrapped by your enc key
                              │
                              ▼
                  Every item encrypted with AES-256-GCM.
                  The server sees: id, type, timestamps, ciphertext.
                  It does NOT see: names, usernames, passwords, URLs, notes.
```

When you log in, your device sends a *hash* of your auth key — never the
password. The server stores a further hash of that and compares. **A stolen
database is just ciphertext plus expensive-to-crack hashes; no password,
vault item, or 2FA secret is recoverable from it.**

Changing your master password only re-wraps the small Account Key — none of your
actual items are re-encrypted. The recovery code works the same way, with its own
independent key, so it can reset your password without ever exposing your vault.

### Sharing a server safely (multi-user)

If you host pw0d for other people, each user gets their own random Account Key
wrapped by their own master password. User A literally cannot decrypt user B's
vault, and the server never holds anyone's key in plaintext. Every request is
scoped to the logged-in user, so people can't even fetch each other's ciphertext.

> **One honest caveat:** because the operator serves the web vault's code, a
> malicious operator *could* serve tampered code that captures a password as
> it's typed into the **web** vault — this is true of every self-hosted web app.
> The browser extension and mobile app are installed from trusted sources (not
> served by the operator), so using them as your primary clients closes that gap.
> Full details in **[docs/SECURITY.md](./docs/SECURITY.md)**.

### The pieces

| Part | What it is |
|---|---|
| **Server + web vault** | A single Next.js app: the REST API (with SQLite) *and* the web UI. One container. |
| **Browser extension** | Chrome MV3 extension (autofill, popup, save prompts). |
| **Shared crypto/core** | TypeScript packages for the encryption, item models, generator, and TOTP — reused by every client so the security is identical everywhere. |

---

## Run your own

You'll need: a cheap Linux server (a "VPS") and about 15 minutes. Cost is roughly
**$4–6/month**. No prior server experience required — every command is copy-paste.

### Step 1 — Create a server

Both providers work; Hetzner is cheapest.

- **Hetzner** — [console.hetzner.cloud](https://console.hetzner.cloud) → New
  Project → Add Server → **Ubuntu 24.04**, type **CX22** (€4.5/mo). Copy the
  server's **IPv4 address**.
- **DigitalOcean** — [cloud.digitalocean.com](https://cloud.digitalocean.com) →
  Create → Droplets → **Ubuntu 24.04**, **2 GB** size ($12/mo; the 1 GB size
  works but needs a swap tweak, noted in the guide). Copy the **IPv4 address**.

Add your SSH key during creation if you have one (recommended).

### Step 2 — Choose how you'll reach it over HTTPS

The vault **must** be served over HTTPS — browsers only allow the encryption code
to run on secure (HTTPS) origins, and the extension requires it too. HTTPS needs a
*hostname* (certificate authorities don't issue free certs for bare IP addresses).
Pick one:

#### Option A — Your own domain (recommended, cleanest)

Buy a domain (~$1–12/year at [Porkbun](https://porkbun.com),
[Cloudflare](https://www.cloudflare.com/products/registrar/), Namecheap, etc.),
then add **one DNS record** in your registrar's DNS settings:

| Type | Name / Host | Value / Points to | TTL |
|------|-------------|-------------------|-----|
| `A` | `vault` | your server's IPv4 (e.g. `203.0.113.42`) | default / auto |

That makes `vault.yourdomain.com` point at your server. (Use `@` as the Name to
use the root domain itself instead of a `vault.` subdomain.) DNS can take a few
minutes to take effect — check from your computer with:

```bash
dig +short vault.yourdomain.com    # should print your server's IP
```

You'll pass this domain to the installer in Step 4.

#### Option B — Free hostname via sslip.io (no domain, no signup)

[sslip.io](https://sslip.io) is a free public DNS service: `203-0-113-42.sslip.io`
automatically resolves to `203.0.113.42`. It only answers DNS lookups — your
actual vault traffic goes **directly** to your server and never touches sslip.io.
Because it's a recognized domain, your server still gets a real, trusted HTTPS
certificate. Nothing to set up; the installer detects your IP and uses it
automatically. Trade-off: an uglier URL, and you depend on sslip.io's DNS staying
online.

#### Option C — Self-signed on the bare IP (advanced, no hostname at all)

Pure `https://<your-ip>`, no hostname anywhere. The web vault works after you
click through a browser "not trusted" warning, but the browser extension won't
connect until you manually install the certificate into each device's trust
store. Only choose this if you specifically want zero external hostnames.

### Step 3 — Open the firewall ports

pw0d needs inbound TCP **22** (SSH), **80**, and **443** (web) reachable. The
installer opens these on the server itself. If your provider has a **cloud
firewall** (Hetzner and DigitalOcean default to *open*, so usually nothing to
do), make sure those three ports are allowed from anywhere — **80 and 443 must be
open or the HTTPS certificate can't be issued.** Step-by-step for each provider is
in **[docs/VPS-GUIDE.md](./docs/VPS-GUIDE.md)**.

### Step 4 — Install (one command)

SSH into your server (`ssh root@YOUR_SERVER_IP`), get the pw0d code onto it, then
run the installer:

```bash
# Get the code (pick one):
#   A) from a private GitHub repo you pushed it to:
git clone https://github.com/<you>/pw0d.git && cd pw0d
#   B) or copy from your computer (run THIS on your computer, not the server):
#   rsync -az --exclude node_modules --exclude .next --exclude .output \
#     --exclude data --exclude .git pw0d/ root@YOUR_SERVER_IP:/root/pw0d/   # then: cd /root/pw0d

# Then, on the server, run ONE of these:
bash deploy/install.sh vault.yourdomain.com   # Option A — your domain
bash deploy/install.sh                         # Option B — free sslip.io URL
bash deploy/install.sh --self-signed           # Option C — self-signed on the IP
```

The installer sets up Docker, opens the server firewall, builds pw0d, and starts
it with automatic HTTPS. The first build takes a few minutes, then it prints your
URL.

### Step 5 — First run

1. Open your URL (wait ~30–60s for the HTTPS certificate on first start).
2. **Sign up** — you're the first user, so this is your admin account.
3. **Close registration** so no one else can sign up (the installer prints the
   exact command, e.g. `SIGNUPS_ALLOWED=false PW0D_DOMAIN=... docker compose up -d`).
4. In **Settings → Account & security**, set up a **recovery code** and **2FA**.

That's it — your vault is live on a server you own.

**Updates & backups** (one `git pull` to update, one `tar` of a Docker volume to
back up) are documented in **[docs/VPS-GUIDE.md](./docs/VPS-GUIDE.md)**. No VPS?
**[docs/DEPLOY.md](./docs/DEPLOY.md)** covers running on your own Mac/home server
with Tailscale.

---

## Using pw0d

- **Web vault** — just open your URL and log in. Create items with the `+` button
  or `⌘K`. Import your old manager's export from the account menu.
- **Browser extension** — build it with `pnpm --filter @pw0d/extension build`,
  then load it: `chrome://extensions` → Developer mode → Load unpacked →
  `apps/extension/.output/chrome-mv3`. Click the pw0d icon, set your server URL,
  and log in. Autofill then appears whenever you click a login field.
- **Mobile** — coming next (companion app with biometric unlock, then native
  iOS/Android autofill).

---

## Security

pw0d uses only standard, well-reviewed cryptography (Argon2id, HKDF, AES-256-GCM
via the browser's Web Crypto), with pinned test vectors so the format can't
silently change. The full threat model — what's protected, the honest caveats of
self-hosting, and how to report a vulnerability — is in
**[docs/SECURITY.md](./docs/SECURITY.md)**.

---

## Development

Requires Node ≥ 20 (`.nvmrc` pins 24) and pnpm 9.

```bash
nvm use
pnpm install
pnpm test                  # vitest across all packages
pnpm typecheck             # tsc via turbo
pnpm --filter web dev      # vault on http://localhost:3000 (SQLite in apps/web/data/)
```

End-to-end tests run the real crypto → API → autofill flow against a live server
or the Docker container (`PW0D_E2E_URL=... pnpm vitest run`).

### Layout

- `packages/crypto` — KDF, AES-256-GCM envelopes, key wrapping, account
  ceremonies, recovery codes. Pinned vectors in `test/vectors.json`.
- `packages/core` — item schemas (Zod), generator (EFF wordlist), strength
  scoring (zxcvbn), TOTP (RFC 6238).
- `packages/api-client` — typed v1 API client + wire schemas, shared by every
  client. Handles token refresh/rotation.
- `apps/web` — Next.js app: the REST API (Drizzle + SQLite) and the shadcn web
  vault. One deployable.
- `apps/extension` — Chrome MV3 extension (WXT).
- `deploy/`, `docker/`, `docs/` — the install script, container setup, and guides.

See [PLAN.md](./PLAN.md) for the full architecture and roadmap.

## Roadmap

Done: web vault, extension, account security (2FA, recovery, sessions), one-command
self-hosting. Next: **mobile app**, then credit cards/identities, trash & restore,
and Firefox/Safari builds.
