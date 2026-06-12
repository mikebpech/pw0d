# pw0d — Self-hostable Password Manager

A zero-knowledge, self-hostable password manager with a slick web vault (shadcn/ui),
a browser extension with first-class autofill, and (later) a mobile app.
NordPass feature parity for the core flows: autofill, save-on-login, generate, vault management.

---

## 1. Product scope

### v1 (parity with daily-driver NordPass usage)
- **Vault items**: logins (username, password, URLs, notes, custom fields), secure notes.
- **Web vault**: full CRUD, search, folders/tags, command palette, password generator,
  password health (reused / weak / old), import (NordPass CSV) & export.
- **Browser extension (Chrome first, MV3)**:
  - Inline autofill menu on login forms
  - Save / update prompt after submitting credentials
  - Quick generator (popup + inline on registration forms)
  - Popup vault search + copy username/password
  - Keyboard shortcut fill, context-menu fill
- **Accounts**: signup/login, 2FA (TOTP + passkeys), multiple devices, sessions list + revoke.
- **Self-hosting**: single Docker image, SQLite by default, behind-a-proxy HTTPS, registration toggle.

### v2+
- Credit cards & identities (autofill of checkout forms)
- TOTP storage (vault items that generate 2FA codes + autofill them)
- Org/sharing (per-item keys make this possible later — see crypto design)
- Emergency access, attachments, Postgres option

### Mobile (committed scope — endpoint is native OS autofill; staged in two tiers)
- **Tier 1 — companion app (Expo / React Native)**: biometric unlock, search,
  view/copy credentials, generator. Reuses `crypto` + `core` + `api-client`
  packages directly (all TS). Covers ~90% of phone usage via copy/paste.
  Cheap to build; scheduled right after the extension ships.
- **Tier 2 — true OS autofill (the actual goal: "fill this login" above the
  keyboard)**: iOS Credential Provider Extension (Swift) +
  Android AutofillService (Kotlin), added to the Expo app via prebuild/config
  plugins. These extensions are native code — they can't run the TS crypto core —
  so the design is: the app keeps an encrypted credential cache in shared storage
  (App Group / app-private storage), keyed by a biometric-gated key in the
  iOS Keychain / Android Keystore; the native extension decrypts just enough to
  show "fill?" suggestions. This is the single biggest engineering lift after
  browser autofill, which is why it's staged behind Tier 1.

### Explicit non-goals (for now)
- Passkey *storage* (acting as a passkey provider) — large platform-API surface, revisit later.
- Enterprise SSO/SCIM.

---

## 2. Security architecture (zero-knowledge)

**Principle: the server only ever stores ciphertext. The master password and all
derived keys never leave the client.** Everything below uses boring, standard,
well-reviewed primitives — no custom crypto.

### 2.1 Keys

```
Master Password + email (salt)
        │  Argon2id (64 MiB, iterations=3, parallelism=4)
        ▼
   Master Key (MK, 256-bit)            ── never leaves the client
        │  HKDF-SHA256
        ├──► MK-enc  — wraps the Account Key
        └──► MK-auth — basis for the server login hash

Account Key (AK, random 256-bit, generated client-side at signup)
        │  encrypted with MK-enc (AES-256-GCM) → "protected key" stored on server
        ▼
Per-item keys (random, wrapped by AK)  ── enables sharing + re-key later
        ▼
Item ciphertext (AES-256-GCM, every field encrypted; only id/type/timestamps in clear)
```

Why an Account Key layer: changing the master password only re-wraps AK
(one small blob), never re-encrypts the vault. Per-item keys make future
sharing possible without redesign.

### 2.2 Authentication (server never learns the password)

Bitwarden-style for v1 (simple, well understood):
1. Client computes `loginHash = Argon2id(MK-auth, masterPassword, light params)`.
2. Sends `loginHash` over TLS; server stores `argon2id(loginHash)` and compares.
3. On success server issues short-lived JWT access token + rotating refresh token
   (device-bound, listed in “sessions”, revocable).
4. 2FA (TOTP / WebAuthn passkey) gates token issuance. Note: 2FA protects API
   access, not vault crypto — the docs must say this honestly.

(OPAQUE/SRP is a possible v2 upgrade; not required when TLS is assumed.)

### 2.3 Client-side crypto rules
- **WebCrypto** for AES-256-GCM and HKDF; **hash-wasm** for Argon2id (WASM, audited, fast).
- Random IV per encryption, never reused; AAD binds item id + type.
- Versioned envelope on every ciphertext: `{v, alg, kdfParams, iv, ct, tag}` → future migrations are possible.
- Vault unlock state lives in memory only (extension service worker / web app tab).
  Auto-lock on timer, browser close, or system idle. Optional "lock on navigate away".
- Copy-to-clipboard auto-clears after N seconds (where the platform allows).

### 2.4 Account recovery
Zero-knowledge means forgotten master password = lost vault, **unless** the user
opts into a **recovery code**: a random 128-bit code shown once at setup, which
wraps a second copy of AK. Stored server-side as ciphertext; useless without the code.

### 2.5 Threat model (summary)
| Threat | Mitigation |
|---|---|
| Server/database compromise | Everything is ciphertext; Argon2id makes offline cracking expensive |
| Network MITM | TLS required; HSTS; tokens short-lived |
| Phishing site autofill | Strict domain matching (public-suffix aware), never auto-fill without user gesture |
| XSS on a visited site reading the inline menu | Extension UI rendered in closed shadow DOM / sandboxed iframe; fills require explicit click |
| Stolen device, vault unlocked | Auto-lock timers, lock on idle, re-prompt master password for exports |
| Malicious self-host operator | Can't read vaults; can serve malicious *web* client → docs recommend extension/app as primary clients, web vault integrity is the known SaaS-tradeoff |

**Honest caveat:** a from-scratch password manager is a high-stakes project.
Mitigations: only standard primitives, vetted libraries, published threat model,
crypto test vectors in CI, and a `SECURITY.md` inviting disclosure. Benchmark
behavior against Bitwarden/Vaultwarden, which solved the same problems publicly.

---

## 3. Architecture & stack

### Monorepo (pnpm workspaces + Turborepo, all TypeScript)

```
pw0d/
├── apps/
│   ├── web/          # Next.js 15 (App Router) — web vault UI + REST API route handlers
│   └── extension/    # WXT (MV3) — popup, options, background SW, content scripts
├── packages/
│   ├── crypto/       # KDF, key wrapping, encrypt/decrypt, envelope format + test vectors
│   ├── core/         # vault domain logic: item models, sync, generator, password health
│   ├── api-client/   # typed client for the REST API (shared by web + extension + mobile)
│   └── ui/           # shared shadcn components + Tailwind preset (web + extension popup)
├── docker/           # Dockerfile, docker-compose.yml, Caddy example
└── docs/             # self-hosting guide, SECURITY.md, threat model
```

### Server: inside the Next.js app
- Route handlers under `/api/*` — one deployable, one Docker image, which is the
  single biggest self-hosting win. No separate API service to run.
- **Drizzle ORM + SQLite** (file on a volume) by default. Low write volume makes
  SQLite ideal; Litestream-friendly for backups. Postgres support later via Drizzle.
- Auth: hand-rolled token issuance (we control the crypto-auth flow anyway) —
  short-lived JWT (15 min) + rotating refresh tokens per device.
- Rate limiting on auth endpoints; optional `SIGNUPS_ALLOWED=false` env.

### Sync model
- v1: **pull-based with revision numbers**. Every mutation bumps `vault_revision`;
  clients send `?since=rev` and get changed ciphertext items. Extension polls +
  refetches on unlock/focus. Simple, correct, cache-friendly.
- Conflict rule: last-write-wins per item with `updated_at` guard; server rejects
  stale writes (client re-merges). Real-time push (SSE) is a later nicety.

### Browser extension (WXT)
- **Background service worker**: holds the unlocked AK in memory, owns API calls,
  sync cache (encrypted at rest in extension storage, decrypted on unlock),
  lock timer, messaging hub.
- **Content script**: form detection + inline menu (see §5).
- **Popup**: mini vault — search, copy, fill-on-current-tab, generator, lock button.
  Built with React + the shared `ui` package so it matches the web vault.
- Firefox/Safari later; WXT abstracts most of the manifest differences.

### Data model (server, everything sensitive is ciphertext)

```
users        id, email, kdf_params, login_hash_hash, protected_account_key,
             recovery_key_blob?, 2fa secrets, created_at
items        id, user_id, type, encrypted_blob, folder_id?, revision,
             deleted_at (soft delete / trash), created_at, updated_at
folders      id, user_id, encrypted_name, revision
devices      id, user_id, name, platform, refresh_token_hash, last_seen
audit_log    id, user_id, event, device_id, ip, created_at   (no secrets ever)
```

---

## 4. UI/UX (shadcn/ui, Tailwind v4)

Design direction: dark-first, dense-but-calm, keyboard-driven. Not another
pastel SaaS dashboard — closer to Linear/Vercel than to LastPass.

- **Web vault**: three-pane — sidebar (folders/types/health) · item list (virtualized,
  search-as-you-type) · detail panel with reveal/copy/edit. `⌘K` command palette (cmdk)
  for jump-to-item, generate, lock.
- **Generator**: lives everywhere (palette, detail panel, extension popup, inline).
  Length/symbols/digits sliders, passphrase mode (EFF wordlist), strength meter (zxcvbn).
- **Password health**: reused / weak / old / breached-format checks, all computed
  client-side post-decryption. (HIBP k-anonymity range API as optional later feature.)
- **Extension popup**: single-column mini vault matching web styling; current-site
  matches pinned on top; one-click fill.
- **Inline autofill menu**: minimal anchored dropdown — favicon, username, “fill”;
  footer row for “generate password” on registration fields.
- Unlock screen, first-run onboarding (master password education + recovery code
  ceremony) get real design attention — that's the trust-building surface.

---

## 5. Autofill design (the part NordPass gets wrong)

1. **Detection**: scan for `input[type=password]` + heuristics (autocomplete attrs,
   field names, labels, single-field email→password multi-step flows). MutationObserver
   for SPA-rendered forms. Classify: login vs registration vs change-password.
2. **Matching**: URL of the top frame → match against item URLs.
   Precedence: exact host > base domain (via public suffix list) > user-defined
   equivalent domains. Never match on path/query by default.
3. **Fill**: only on explicit user gesture (menu click, shortcut, context menu).
   Set value + dispatch `input`/`change` events so React/Vue forms register it.
   Never fill into cross-origin iframes.
4. **Inline UI**: rendered inside a **sandboxed iframe positioned over the field**
   (page JS can't read its DOM), anchored/repositioned on scroll/resize.
5. **Save prompt**: content script watches form submission / password field +
   navigation; background diffs against vault → toast-style “Save login?” /
   “Update password?” banner.
6. **Multi-step logins** (Google-style email→next→password): remember the matched
   item across the step transition within the tab.

This is the hardest, most QA-heavy surface in the project. Budget real time for a
test matrix of top sites + the standard weird cases (Stripe-style iframes, shadow-DOM
forms, web components).

---

## 6. Self-hosting story

Target experience on a $4–6/mo VPS (Hetzner CX22 / DO basic droplet):

```bash
# 1. point a DNS A record (vault.example.com) at the box
# 2. on the box:
curl -O https://raw.githubusercontent.com/.../docker-compose.yml
PW0D_DOMAIN=vault.example.com docker compose up -d
# done — open https://vault.example.com, run the setup wizard
```

- **One app image** (Next.js standalone build) + **Caddy bundled in the compose file**
  for automatic Let's Encrypt HTTPS — no manual cert or proxy setup. HTTPS is
  non-negotiable anyway (the extension and mobile app require it).
- SQLite file + Caddy certs on named volumes; backup = copy one file (or Litestream
  to any S3-compatible bucket — doc'd as the recommended setup).
- Env config: `PW0D_DOMAIN`, `DATABASE_PATH`, `JWT_SECRET` (auto-generated on first
  boot if absent), `SIGNUPS_ALLOWED`.
- First-run: setup wizard creates the first (admin) account, then optionally closes signups.
- Upgrades: `docker compose pull && docker compose up -d`; migrations run on boot.
- Versioned REST API so old extensions/apps keep working against newer servers.
- SQLite is plenty for this workload (a handful of users, low write volume) and is
  exactly why the deployment can be this simple.

---

## 7. Build phases

**Phase 0 — Foundations (the crypto must be right before anything is built on it)**
- Monorepo scaffold (pnpm + Turborepo, TS strict, Vitest, Biome/ESLint).
- `packages/crypto`: KDF, HKDF, key wrapping, envelope encrypt/decrypt.
  Published test vectors; round-trip + tamper tests in CI.
- `packages/core`: item models (Zod schemas), generator, strength scoring.

**Phase 1 — Server + Web vault MVP**
- Drizzle schema + migrations, signup/login flow (full key ceremony), token issuance.
- Vault CRUD + revision-based sync API.
- Web vault: unlock screen, item list/detail, create/edit, generator, search, folders.
- NordPass CSV import (so you can switch immediately) + JSON/CSV export.

**Phase 2 — Extension**
- WXT scaffold, background SW with lock/unlock + encrypted local cache + sync.
- Popup vault (search/copy/fill current tab/generate).
- Content script: detection, inline menu, fill, save/update prompt.
- Site test matrix; context menu + keyboard shortcuts.

**Phase 3 — Hardening + self-host release**
- 2FA (TOTP + passkeys), sessions/devices management, audit log, rate limiting.
- Auto-lock policies, recovery-code ceremony, password health dashboard.
- Docker image, compose file, self-hosting docs, SECURITY.md + threat model doc.
- ZAP/dependency scanning in CI; ideally an external eyeballs pass on the crypto.

**Phase 4 — Mobile companion (Tier 1)**
- Expo app: biometric unlock (key wrapped via Keychain/Keystore), vault search,
  view/copy, generator, encrypted offline cache. Reuses crypto/core/api-client.
- Ship via TestFlight/internal track first; App Store/Play later if wanted.

**Phase 5 — Mobile autofill (Tier 2, committed)**
- iOS Credential Provider Extension (Swift) + Android AutofillService (Kotlin),
  wired into the Expo app via prebuild/config plugins.
- Encrypted credential cache in shared storage, biometric-gated key in
  Keychain/Keystore; extension decrypts only what's needed for suggestions.

**Phase 6 — Beyond parity (optional)**
- TOTP storage + autofill of 2FA codes, cards/identities, SSE live sync,
  Firefox/Safari builds, sharing.

---

## 8. Key decisions made (and the alternative if you disagree)

| Decision | Chosen | Alternative |
|---|---|---|
| Server shape | API inside Next.js, one container | Separate Hono/Fastify service |
| Database | SQLite default | Postgres (add later via Drizzle) |
| KDF | Argon2id via hash-wasm | scrypt/PBKDF2 (weaker, no reason) |
| Cipher | AES-256-GCM via WebCrypto | XChaCha20-Poly1305 via libsodium |
| Auth | Hashed-key login + JWT/refresh | OPAQUE (v2 upgrade path) |
| Extension framework | WXT | Plasmo (less maintained), raw MV3 |
| Sync | Revision pull, LWW per item | CRDTs (overkill for single-user) |
| Mobile | Expo companion first (Phase 4), native autofill extensions later (Phase 5) | Native-first app (slower, duplicates the TS core) |
| Deployment | Compose bundle: app + Caddy (auto-HTTPS), SQLite volume | Bare image behind user's own proxy (still supported, just not the headline path) |
