# Run pw0d on a VPS — the simple guide

Goal: a permanent HTTPS URL that your browser extension and phone point at. Total
time ~15 minutes, cost ~$4–6/month. Everything you type is copy-paste.

You need: a credit card for the VPS, and (optionally) a domain name. **You don't
need a domain** — Step 2 covers a free hostname via sslip.io. But why HTTPS at
all? Browsers only run the vault's encryption code on secure (HTTPS) origins, and
the extension requires it — and HTTPS needs a hostname, because certificate
authorities don't issue free certs for bare IP addresses. Step 2 gives you three
ways to get that hostname.

---

## Step 1 — Create the server

Either provider works. Hetzner is cheapest.

### Hetzner (recommended)
1. Sign up at <https://console.hetzner.cloud> → **New Project** → **Add Server**.
2. **Location**: closest to you. **Image**: **Ubuntu 24.04**.
3. **Type**: **CX22** (2 vCPU / 4 GB) — €4.5/mo, plenty.
4. Under **SSH keys**, add yours if you have one (recommended). No key? You'll get
   a root password by email instead.
5. **Create & Buy now**. Copy the server's **IPv4 address** (e.g. `203.0.113.42`).

### DigitalOcean (alternative)
1. <https://cloud.digitalocean.com> → **Create → Droplets**.
2. **Ubuntu 24.04**, **Basic / Regular**, the **$6/mo** size (1 GB is tight for the
   build; pick **2 GB / $12** to be safe, or build elsewhere — see note in Step 4).
3. Add your SSH key, **Create Droplet**, copy the **IPv4 address**.

---

## Step 2 — Get a hostname for HTTPS (pick one)

### Option A — Your own domain (recommended)

Buy a domain (~$1–12/yr at Porkbun, Cloudflare, Namecheap…), then in your
registrar's **DNS settings**, add **one record**:

| Type | Name / Host | Value / Points to | TTL |
|------|-------------|-------------------|-----|
| `A` | `vault` | your server's IPv4, e.g. `203.0.113.42` | default / auto |

- The **Type** is `A` (maps a name to an IPv4 address).
- The **Name/Host** is the subdomain — `vault` gives you `vault.yourdomain.com`.
  Use `@` (or leave blank) to use the root domain itself.
- The **Value** is the IPv4 you copied in Step 1. (No `http://`, no port — just
  the number.)
- Leave TTL at the default. Save.

DNS can take a few minutes (occasionally up to an hour) to take effect. Check it
from your computer:
```bash
dig +short vault.yourdomain.com    # should print your server's IP
```
You'll pass `vault.yourdomain.com` to the installer in Step 4.

> Registrar-specific note: some registrars (Cloudflare especially) have a
> "proxy"/orange-cloud toggle on the record — turn it **off** (grey cloud /
> "DNS only") so Caddy can get its own certificate directly.

### Option B — Free hostname via sslip.io (no domain)

Skip DNS entirely. `203-0-113-42.sslip.io` automatically resolves to
`203.0.113.42` — a free public DNS service that only does lookups and never sees
your traffic. The installer detects your IP and uses it for you (Step 4, the
no-argument form). Trade-off: uglier URL, and you rely on sslip.io's DNS.

### Option C — Self-signed on the bare IP (advanced)

No hostname at all — `https://<your-ip>` with a self-signed certificate. The web
vault works after a one-time browser warning, but the extension needs the cert
manually trusted on each device. Use `bash deploy/install.sh --self-signed` in
Step 4. Only pick this if you want zero external hostnames.

---

## Step 3 — Open the ports (firewall)

pw0d needs **three** inbound ports open: **22** (SSH), **80** and **443** (web).
There are two firewall layers; the install script handles the one *on* the server
(`ufw`) for you. You only need to handle the **provider's cloud firewall** — and
on a fresh server it's often wide-open already, in which case there's nothing to
do. Check/set it like this:

### Hetzner — Cloud Firewall
By default a new Hetzner server has **no firewall** (all ports open), so you can
skip this. If you *want* a firewall (good practice):
1. Console → **Firewalls** → **Create Firewall**.
2. Add these **Inbound** rules (leave source as "Any IPv4 / Any IPv6"):
   - TCP **22**  (SSH)
   - TCP **80**  (HTTP)
   - TCP **443** (HTTPS)
3. Under **Apply to**, select your server. **Create Firewall**.

### DigitalOcean — Cloud Firewall
DO droplets also default to open. To add a firewall:
1. **Networking → Firewalls → Create Firewall**.
2. **Inbound Rules** — add:
   - SSH — TCP **22**
   - HTTP — TCP **80**
   - HTTPS — TCP **443**
   (sources: "All IPv4" and "All IPv6")
3. Under **Apply to Droplets**, pick your droplet. **Create Firewall**.

> The key rule: **80 and 443 must be reachable from anywhere.** Caddy needs port
> 80 to obtain the HTTPS certificate and 443 to serve the vault. If you ever see
> "connection refused" or the cert won't issue, an unopened 80/443 is the usual
> cause.

---

## Step 4 — Get pw0d onto the server and start it

**SSH into the server** from your Mac (replace the IP):

```bash
ssh root@203.0.113.42
```

Now get the pw0d code onto the box. Pick one:

### Option A — From GitHub (best, makes updates trivial)
One-time, on your **Mac**, push the project to a **private** GitHub repo:
```bash
cd ~/Development/sideprojects/pw0d
gh repo create pw0d --private --source=. --push   # needs the GitHub CLI
# (or create a repo on github.com and: git remote add origin <url> && git push -u origin main)
```
Then on the **server**:
```bash
apt-get update && apt-get install -y git
git clone https://github.com/<your-username>/pw0d.git
cd pw0d
```

### Option B — Copy straight from your Mac (no GitHub)
In a **new terminal on your Mac** (not the SSH session):
```bash
cd ~/Development/sideprojects
rsync -az --exclude node_modules --exclude .next --exclude .output \
  --exclude data --exclude .git pw0d/ root@203.0.113.42:/root/pw0d/
```
Then back in the **SSH session**:
```bash
cd /root/pw0d
```

### Run the installer (either option above lands you in the pw0d folder)

Match this to your Step 2 choice:
```bash
bash deploy/install.sh vault.yourdomain.com   # Option A — your domain
bash deploy/install.sh                         # Option B — free sslip.io URL
bash deploy/install.sh --self-signed           # Option C — self-signed on the IP
```

That's it. The script installs Docker, opens the server firewall, builds the
image, and starts pw0d with automatic HTTPS. First build takes a few minutes,
then it prints your URL.

> **Note for 1 GB droplets**: the Next.js build can run out of memory. Either use
> a 2 GB+ size, or temporarily add swap before installing:
> `fallocate -l 2G /swap && chmod 600 /swap && mkswap /swap && swapon /swap`

---

## Step 5 — Create your account & lock it down

1. Open **https://vault.yourdomain.com** (wait ~30–60s after install for the cert).
2. Sign up. You're the first user — this is your admin account.
3. Close registration so nobody else can sign up. On the server:
   ```bash
   cd ~/pw0d/docker     # or /root/pw0d/docker
   SIGNUPS_ALLOWED=false PW0D_DOMAIN=vault.yourdomain.com docker compose up -d
   ```
4. In **Settings → Account & security**, set up a **recovery code** and **2FA**.

---

## Step 6 — Point your devices

- **Browser extension**: click the pw0d icon → server URL → `https://vault.yourdomain.com`.
- **Phone** (once the mobile app exists): same URL.

Done — your passwords now live on a server you control, reachable anywhere.

---

## Keeping it running

**Updates** (when you change the code):
- GitHub: on the server, `cd ~/pw0d && git pull && cd docker && PW0D_DOMAIN=vault.yourdomain.com docker compose up -d --build`
- rsync: re-run the rsync from your Mac, then the same compose command.

**Backups** — everything is in one Docker volume (`pw0d-data`):
```bash
docker run --rm -v pw0d-data:/data -v /root:/backup alpine \
  tar czf /backup/pw0d-backup-$(date +%F).tar.gz -C /data .
```
Copy that file somewhere safe (or automate with cron). To restore, drop it back
into the volume and `docker compose up -d`.

**Check status**: `curl https://vault.yourdomain.com/api/health` → `{"status":"ok"}`.

**Logs**: `cd ~/pw0d/docker && docker compose logs -f`.

See [SECURITY.md](./SECURITY.md) for the threat model.
