# pw0d

Self-hostable, zero-knowledge password manager. Web vault + browser extension +
mobile app, one-container Docker deployment. See [PLAN.md](./PLAN.md) for the
full architecture and roadmap.

## Status

Server, web vault, Chrome extension, and Docker self-hosting all work.

- **Web vault**: three-pane UI, ⌘K palette, generator, folders, favicons,
  NordPass import, JSON/CSV export. Items: logins (with **live TOTP codes** +
  countdown), notes, SSH keys.
- **Extension**: inline autofill (closed-shadow-root menu, PSL-aware matching,
  shadow-DOM forms), in-field icons, editable save/update cards, signup
  email-prefill + generate, **2FA-code fill/copy**, Touch ID quick unlock
  (WebAuthn PRF), ⌘⇧L fill, context menu.
- **Self-host**: one Docker image (~220MB) with a `/api/health` check. Deploy to
  a VPS with one command — `bash deploy/install.sh vault.example.com` installs
  Docker, opens the firewall, and launches with Caddy auto-HTTPS. Full
  step-by-step in **`docs/VPS-GUIDE.md`** (incl. the cloud-firewall ports for
  Hetzner/DO); threat model in `docs/SECURITY.md`. Verified: the production
  Caddy-TLS→app stack serves over HTTPS, data + JWT secret survive restarts, and
  the full e2e suite (vault, account security, extension autofill) passes against
  the running container.

Load the extension: `pnpm --filter @pw0d/extension build`, then
chrome://extensions → Developer mode → Load unpacked →
`apps/extension/.output/chrome-mv3`.

Account security (Settings → Account & security): master-password change
(local re-key, zero items re-encrypted), account 2FA (TOTP, gates login),
recovery code (dual-branch: enc-key wraps the Account Key, auth-key proves
knowledge — recovery stays zero-knowledge even from the operator), and a
sessions/devices list with revoke. Security headers (HSTS, CSP, frame-deny).

Still queued: password health dashboard (reused/weak/old + HIBP breach check),
credit cards / identities, trash & restore, mobile app.

## Deploy to a VPS (~15 min, ~$5/mo)

Get a permanent `https://vault.yourdomain.com`. You need a domain and a VPS
(Hetzner CX22 or a DigitalOcean droplet, Ubuntu 24.04).

1. **Create the server**, copy its IPv4 address.
2. **Point DNS**: add an `A` record `vault` → your server IP. Verify with
   `dig +short vault.yourdomain.com`.
3. **Open ports** in the provider's cloud firewall (fresh servers are usually
   open already): inbound TCP **22**, **80**, **443** from anywhere. 80/443 must
   be reachable or the HTTPS cert won't issue.
4. **SSH in and run one command** — first get the code on the box, then:
   ```bash
   # Option A — from a private GitHub repo:
   git clone https://github.com/<you>/pw0d.git && cd pw0d
   # Option B — copy from your Mac (no GitHub), run on your Mac:
   #   rsync -az --exclude node_modules --exclude .next --exclude .output \
   #     --exclude data --exclude .git pw0d/ root@SERVER_IP:/root/pw0d/

   bash deploy/install.sh vault.yourdomain.com
   ```
   This installs Docker, opens the server firewall, builds, and launches pw0d
   with automatic HTTPS via Caddy.
5. **Open** `https://vault.yourdomain.com` (~30–60s for the cert), sign up,
   then close registration:
   ```bash
   cd ~/pw0d/docker
   SIGNUPS_ALLOWED=false PW0D_DOMAIN=vault.yourdomain.com docker compose up -d
   ```
6. **Point your devices** at `https://vault.yourdomain.com` (extension popup →
   server URL).

Full walkthrough — provider-specific firewall steps, swap for 1 GB droplets,
updates, backups — in **[docs/VPS-GUIDE.md](./docs/VPS-GUIDE.md)**. Prefer not
to pay for a VPS? **[docs/DEPLOY.md](./docs/DEPLOY.md)** also covers running on
your Mac + Tailscale. Threat model: **[docs/SECURITY.md](./docs/SECURITY.md)**.

## Layout

- `packages/crypto` — KDF (Argon2id + HKDF), AES-256-GCM envelopes, key
  wrapping, account ceremonies, recovery codes. Pinned test vectors in
  `test/vectors.json` freeze the v1 format — if `vectors.test.ts` fails,
  compatibility with existing vaults is broken.
- `packages/core` — vault item schemas (Zod), password/passphrase generator
  (EFF wordlist), strength scoring (zxcvbn).
- `packages/api-client` — typed v1 API client + wire schemas (shared by web,
  extension, mobile). Handles token refresh/rotation.
- `apps/web` — Next.js app: the REST API (route handlers + Drizzle/SQLite)
  and the shadcn web vault. One deployable.

## Development

Requires Node >= 20 (`.nvmrc` pins 24) and pnpm 9.

```bash
nvm use
pnpm install
pnpm test                  # vitest, all packages
pnpm typecheck             # tsc via turbo
pnpm --filter web dev      # vault on http://localhost:3000 (SQLite in apps/web/data/)
```

End-to-end test (starts crypto → API → sync against a live server):

```bash
pnpm --filter web dev -p 3789 &
PW0D_E2E_URL=http://localhost:3789 pnpm vitest run apps/web/test/e2e.test.ts
```

Env vars: `DATA_DIR` (default `./data`), `DATABASE_PATH`, `JWT_SECRET`
(auto-generated into the data dir if unset), `SIGNUPS_ALLOWED=false` to close
registration after the first account.
