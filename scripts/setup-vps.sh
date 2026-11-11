#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# NSA Training Platform — Ubuntu 24.04 LTS VPS Provisioning & Hardening Script
# ==============================================================================

APP_DIR="${APP_DIR:-/opt/nsa-app}"
APP_DOMAIN="${APP_DOMAIN:-app.newcitygroupsuleco.com.vn}"
TLS_EMAIL="${TLS_EMAIL:-admin@newcitygroupsuleco.com.vn}"
SSH_PORT="${SSH_PORT:-24700}"

echo "==> [1/6] Configuring 2 GB Swapfile (OOM protection)..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "==> [2/6] Installing security packages (UFW, Fail2ban, Unattended-Upgrades, Curl, Git)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git openssl

echo "==> [3/6] Hardening UFW Firewall & Fail2ban (SSH port ${SSH_PORT}, HTTP 80, HTTPS 443)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

cat >/etc/fail2ban/jail.d/sshd-nsa.local <<EOF
[sshd]
enabled = true
port = ${SSH_PORT},ssh
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> [4/6] Installing Official Docker Engine & Compose v2..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> [5/6] Preparing .env.production in ${APP_DIR}..."
mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

if [[ ! -f .env.production ]]; then
  PG_PASS="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 32)"
  cat >.env.production <<EOF
APP_DOMAIN=${APP_DOMAIN}
TLS_EMAIL=${TLS_EMAIL}
POSTGRES_USER=nsa
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=nsa_training
DATABASE_URL=postgres://nsa:${PG_PASS}@postgres:5432/nsa_training?sslmode=disable
JWT_ACCESS_SECRET=${JWT_SECRET}
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=30
BCRYPT_COST=12
LOG_LEVEL=info
SHUTDOWN_TIMEOUT_SECONDS=20
OPENROUTER_API_KEY=
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
GEMINI_API_KEY=
GROQ_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=nsa-diplomas
R2_PUBLIC_URL=
EOF
  chmod 600 .env.production
  echo "Generated secure .env.production"
fi

echo "==> [6/6] Registering Daily Automated PostgreSQL Backup Cronjob (02:00 UTC)..."
chmod +x "${APP_DIR}/scripts/backup-db.sh" || true
cat >/etc/cron.d/nsa-db-backup <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 2 * * * root APP_DIR=${APP_DIR} ${APP_DIR}/scripts/backup-db.sh >> /var/log/nsa-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/nsa-db-backup

echo "==> Provisioning completed successfully!"
