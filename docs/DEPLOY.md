# Deploying pw0d

pw0d is one container (Next.js app + SQLite) plus Caddy for HTTPS. Pick the path
that matches where you want it to run. Both give you a stable URL your browser
extension and phone can point at.

> **HTTPS is required.** The extension and mobile app refuse non-HTTPS origins
> (except `localhost`). Both paths below give you HTTPS.

---

## Path A — A small VPS (recommended for always-on)

Best when you want pw0d reachable from anywhere, independent of your laptop.
A $4–6/mo box (Hetzner CX22, DigitalOcean basic droplet) is plenty.

1. **Point DNS** — create an A record, e.g. `vault.example.com` → your server's IP.
2. **On the server** (Docker + compose installed):
   ```bash
   git clone <your pw0d repo> && cd pw0d/docker
   PW0D_DOMAIN=vault.example.com docker compose up -d
   ```
   Caddy fetches a Let's Encrypt cert automatically on first boot.
3. **Open** `https://vault.example.com`, create your account (you're the first
   user, so you're the admin).
4. **Lock down signups** so no one else can register:
   ```bash
   SIGNUPS_ALLOWED=false PW0D_DOMAIN=vault.example.com docker compose up -d
   ```
5. **Point your clients** at `https://vault.example.com` (extension popup → server
   URL; mobile app → server URL).

Upgrades: `git pull && docker compose up -d --build`. Migrations run on boot.

---

## Path B — Your Mac / home server + Tailscale (no VPS, no domain)

Best when you'd rather not pay for a box. Runs pw0d at home and makes it reachable
from your phone anywhere via Tailscale's private network (free).

1. **Run pw0d** (stays up across reboots, no terminal needed):
   ```bash
   cd pw0d/docker
   docker compose -f docker-compose.local.yml up -d
   # → http://localhost:8080
   ```
2. **Install [Tailscale](https://tailscale.com/)** on this machine and your phone;
   sign in to the same account on both (free personal plan).
3. **Expose pw0d over Tailscale with HTTPS**:
   ```bash
   tailscale serve --bg 8080
   ```
   This gives you a stable HTTPS URL like `https://your-mac.tailXXXX.ts.net`,
   reachable from your phone and other devices on your tailnet — from anywhere,
   not just home wifi.
4. **Point your clients** at that `https://…ts.net` URL.

Caveat: this machine must be awake to serve requests (disable sleep, or use a
mini home server). For true always-on with no caveats, use Path A.

---

## Backups

Everything lives in the `pw0d-data` Docker volume: the SQLite file and the
auto-generated JWT secret. Two good options:

- **Simple**: `docker run --rm -v pw0d-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/pw0d-backup.tar.gz -C /data .` on a cron.
- **Continuous**: point [Litestream](https://litestream.io/) at the SQLite file
  to stream to any S3-compatible bucket.

Restore = drop the file back into the volume and `docker compose up -d`.

---

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PW0D_DOMAIN` | — | Your domain (Path A; Caddy uses it for the cert) |
| `SIGNUPS_ALLOWED` | `true` | Set `false` after your account exists to close registration |
| `DATA_DIR` | `/data` | Where the SQLite DB + JWT secret live (mapped to the volume) |
| `JWT_SECRET` | auto | Auto-generated into `DATA_DIR` on first boot if unset; persists |
| `DATABASE_PATH` | `$DATA_DIR/pw0d.db` | Override the DB file location |

## Health check

`GET /api/health` → `{"status":"ok"}` when the app and DB are reachable. The
container uses this for its Docker healthcheck.

See [SECURITY.md](./SECURITY.md) for the threat model and the honest caveats of
self-hosting.
