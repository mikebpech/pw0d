#!/usr/bin/env bash
#
# pw0d one-command installer. Run on a fresh Ubuntu server (as root), from the
# pw0d project folder:
#
#     bash deploy/install.sh
#
# With no arguments it auto-detects this server's public IP and gives you a free
# HTTPS URL via sslip.io — no domain required. To use your own domain instead:
#
#     bash deploy/install.sh vault.example.com
#
set -euo pipefail

DOMAIN="${1:-}"
TLS_MODE="auto"   # "auto" = Let's Encrypt; "internal" = self-signed

if [ "$DOMAIN" = "--self-signed" ]; then
  TLS_MODE="internal"
  DOMAIN=""
fi

if [ ! -f docker/docker-compose.yml ]; then
  echo "✗ Run this from the pw0d project root (the folder that contains docker/)."
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "✗ Please run as root (e.g. 'sudo bash deploy/install.sh')."
  exit 1
fi

if [ "$TLS_MODE" = "internal" ]; then
  echo "==> Self-signed mode: detecting public IP..."
  IP="$(curl -fsSL https://api.ipify.org || curl -fsSL https://ifconfig.me || true)"
  [ -z "$IP" ] && { echo "✗ Couldn't detect the public IP."; exit 1; }
  DOMAIN="$IP"
  echo "    Serving https://$IP with a self-signed certificate."
  echo "    (Browsers will warn once; the extension needs this cert trusted manually.)"
elif [ -z "$DOMAIN" ]; then
  echo "==> Detecting this server's public IP..."
  IP="$(curl -fsSL https://api.ipify.org || curl -fsSL https://ifconfig.me || true)"
  if [ -z "$IP" ]; then
    echo "✗ Couldn't detect the public IP. Pass a domain or IP-based host instead:"
    echo "    bash deploy/install.sh 203-0-113-42.sslip.io"
    exit 1
  fi
  # sslip.io maps <dashed-ip>.sslip.io → that IP, and is on the Public Suffix
  # List, so Caddy gets a real Let's Encrypt cert for it. Free HTTPS, no domain.
  DOMAIN="${IP//./-}.sslip.io"
  echo "    Public IP: $IP"
  echo "    Your pw0d URL will be: https://$DOMAIN  (free HTTPS, no domain needed)"
fi

echo "==> [1/4] Installing Docker (if needed)..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker already installed."
fi

echo "==> [2/4] Opening the server firewall (SSH 22, HTTP 80, HTTPS 443)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  echo "    ufw configured."
else
  echo "    ufw not present — skipping (your provider firewall still needs 80/443 open)."
fi

echo "==> [3/4] Building and starting pw0d for https://$DOMAIN ..."
cd docker
PW0D_DOMAIN="$DOMAIN" docker compose up -d --build

echo "==> [4/4] Waiting for the app to come up..."
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

cat <<EOF

────────────────────────────────────────────────────────────
✓ pw0d is running.

  Open it (give Caddy ~30–60s to fetch the HTTPS certificate):

      https://$DOMAIN

  Create your account — you're the first user, so it's yours.

  Then close signups so nobody else can register:

      cd $(pwd)
      SIGNUPS_ALLOWED=false PW0D_DOMAIN=$DOMAIN docker compose up -d

  Point your browser extension (and phone, later) at:
      https://$DOMAIN
────────────────────────────────────────────────────────────
EOF
