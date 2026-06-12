# pw0d security model

pw0d is a zero-knowledge password manager: the server stores only ciphertext
and never has the ability to decrypt your vault. This document is the honest
threat model — what's protected, what isn't, and the trade-offs of self-hosting.

## Cryptography

- **KDF**: Argon2id (64 MiB, 3 iterations, 4 lanes) over your master password,
  salted with your email. Produces the Master Key, which never leaves your device.
- **Sub-keys**: HKDF-SHA256 splits the Master Key into an encryption key (wraps
  the Account Key) and an auth key (basis for the server login hash). Independent
  branches — one can't derive the other.
- **Account Key**: a random 256-bit key that actually encrypts your vault. Wrapped
  by the Master Key's encryption sub-key. Changing your master password re-wraps
  this one small blob — no vault item is ever re-encrypted.
- **Items**: AES-256-GCM (WebCrypto), random 96-bit IV per encryption, with the
  item id bound as AAD. Every field is encrypted; the server sees only id, type,
  timestamps, and ciphertext.
- **Login**: the client sends an Argon2id hash of its auth key; the server stores
  `argon2id(loginHash)` and compares. The server never learns the master password.
- **Tokens**: 15-minute JWT access tokens + rotating, single-use refresh tokens,
  stored hashed, revocable per device.

## What a database breach yields

Ciphertext and Argon2id hashes — nothing directly usable. Offline cracking of a
strong master password is computationally infeasible (Argon2id is memory-hard).
No plaintext password, vault item, TOTP secret, or recovery code is recoverable.

## Multi-user isolation (shared self-hosted instance)

Every user has an independent, randomly-generated Account Key wrapped by their own
master password. User A literally cannot decrypt user B's vault — neither holds
the other's master password, and the server never has either Account Key in
plaintext. Every API query is scoped by user id with an ownership check, so users
cannot even fetch each other's ciphertext.

## Account 2FA & recovery

- **2FA (TOTP)** gates API login (a second factor for *access*). It does not
  protect vault crypto — that's the master password's job — and the docs say so.
- **Recovery code**: 160-bit, shown once. Derives two independent keys — an
  enc-key that wraps a second copy of the Account Key (stored server-side as
  ciphertext) and an auth-key the server stores only as an Argon2id hash. Because
  the branches are independent, the auth-key the server briefly sees during a
  reset can never derive the enc-key. **Recovery stays zero-knowledge even from a
  malicious operator.**

## Honest caveats

- **The operator controls the web client.** A self-host operator serves the web
  vault's JavaScript and could, in principle, serve a tampered version that
  captures a user's master password as they type it. This is the inherent trust
  model of any self-hosted web app (Vaultwarden/Bitwarden share it). Mitigation:
  **the browser extension and mobile app are installed from trusted sources, not
  served by the operator** — use them as your primary clients and the operator
  cannot capture your password. Treat the operator-served web vault as the
  known trade-off.
- **In-memory unlock.** While unlocked, the Account Key lives in memory (browser
  tab / extension service worker). Auto-lock (default 10 min web / 30 min
  extension) and lock-on-exit limit the window.
- **TLS is required.** Always run behind HTTPS (the bundled Caddy does this
  automatically). Tokens and login hashes assume a confidential channel.

## Reporting

Found a vulnerability? Please open a private report rather than a public issue.
Crypto changes ship with updated, pinned test vectors (`packages/crypto`).
