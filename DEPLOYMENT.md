# Deploy Hollow on Ubuntu

This guide gets **Hollow** running on a fresh **Ubuntu 24.04 LTS** machine
(home laptop or VPS) and optionally reachable on the internet.

Assumptions for a home laptop:

- The machine uses **DHCP** from your router
- You can reserve a LAN IP on the router if you want a stable address
- Prefer **Cloudflare Tunnel** for HTTPS (no router port-forwarding)

Follow the sections in order the first time.

---

## Table of contents

1. [What you will end up with](#1-what-you-will-end-up-with)
2. [Before you start](#2-before-you-start)
3. [Ubuntu base setup](#3-ubuntu-base-setup)
4. [DHCP, hostname, and LAN IP](#4-dhcp-hostname-and-lan-ip)
5. [Keep a laptop awake (lid closed)](#5-keep-a-laptop-awake-lid-closed)
6. [Install Docker](#6-install-docker)
7. [Firewall](#7-firewall)
8. [Install and run Hollow](#8-install-and-run-hollow)
9. [Reach Hollow from the internet](#9-reach-hollow-from-the-internet)
10. [Auto-start after reboot](#10-auto-start-after-reboot)
11. [Mobile app against production](#11-mobile-app-against-production)
12. [Backups](#12-backups)
13. [Updating Hollow](#13-updating-hollow)
14. [Routine maintenance](#14-routine-maintenance)
15. [Troubleshooting](#15-troubleshooting)
16. [Security checklist](#16-security-checklist)
17. [Local development vs this server](#17-local-development-vs-this-server)

---

## 1. What you will end up with

```
Your phone / PC
        │
        ├─ LAN  → http://SERVER_LAN_IP:8080
        │
        └─ Internet (optional)
                │
                ▼
         Cloudflare Tunnel (HTTPS)
                │
                ▼
         Ubuntu host
                │
                ▼
         Docker Compose
         ├─ web (Nginx)   :8080
         ├─ backend API
         ├─ PostgreSQL
         └─ Redis
```

Architecture inside Docker:

```
Nginx (:8080 on the host)          ← compose service `web`
├─ /            → static React SPA
├─ /api/*       → backend:4000  (prefix stripped)
└─ /socket.io/* → backend:4000  (WebSockets)
```

Mobile apps point `EXPO_PUBLIC_API_URL` at `https://your.domain/api`
(or `http://LAN_IP:8080/api` for LAN-only testing).

---

## 2. Before you start

- [ ] Ubuntu **24.04 LTS** installed (Server preferred; Desktop also works)
- [ ] You can log in (keyboard/monitor or SSH)
- [ ] If it is a laptop: plugged into **AC power**
- [ ] Ethernet preferred over Wi‑Fi
- [ ] Router uses DHCP (default on most home routers)
- [ ] Optional: a domain on **Cloudflare** for public HTTPS
- [ ] This Hollow git repo URL (or a copy of the project)

---

## 3. Ubuntu base setup

### 3.1 Updates and basics

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git ca-certificates ufw openssh-server \
  htop net-tools avahi-daemon
```

`avahi-daemon` lets other devices find the machine as `hostname.local` on the LAN.

Enable SSH if needed:

```bash
sudo systemctl enable --now ssh
```

### 3.2 Admin user (if you only have root)

```bash
sudo adduser saiya
sudo usermod -aG sudo saiya
```

Prefer logging in as that user (not root).

### 3.3 SSH key login (from your main PC)

```bash
ssh-keygen -t ed25519 -C "hollow-server"   # if you do not have a key yet
ssh-copy-id saiya@SERVER_LAN_IP
```

On the server, harden SSH:

```bash
sudo nano /etc/ssh/sshd_config
```

Set:

```text
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

```bash
sudo systemctl reload ssh
```

Keep one SSH session open until a new key-based login works in another window.

### 3.4 Timezone

```bash
sudo timedatectl set-timezone Asia/Kolkata
timedatectl status
```

(Use your real timezone: `timedatectl list-timezones | grep -i asia`.)

---

## 4. DHCP, hostname, and LAN IP

### 4.1 Hostname (name of the whole machine)

```bash
sudo hostnamectl set-hostname hollow
sudo nano /etc/hosts
```

Ensure:

```text
127.0.1.1   hollow
```

This is the **server** name (SSH, `.local` discovery) — not a per-app name.
Public app URLs are separate DNS names (e.g. `notes.example.com`).

### 4.2 Find the current LAN IP

```bash
hostname -I
ip -4 addr show
```

Look for something like `192.168.1.42` (not `127.0.0.1`).

### 4.3 DHCP reservation on the router (recommended)

On the router admin page (often `192.168.1.1`):

1. Open **DHCP** / **Address reservation** / **Static lease**
2. Reserve this machine’s **MAC address** → a fixed IP (e.g. `192.168.1.50`)
3. Save; reboot the Ubuntu box once so it picks up the lease

Find the MAC:

```bash
ip link show
# `link/ether aa:bb:cc:dd:ee:ff` on eth0 or wlan0
```

You stay on DHCP; the router just always hands out the same IP.

---

## 5. Keep a laptop awake (lid closed)

Skip this section on a VPS or desktop that never sleeps.

```bash
sudo nano /etc/systemd/logind.conf
```

Set:

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
```

```bash
sudo systemctl restart systemd-logind
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

If Ubuntu Desktop is installed, also disable automatic suspend in
**Settings → Power**, or:

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power lid-close-ac-action 'nothing'
```

Leave the laptop on AC power. In BIOS, enable **AC power recovery → Always On**
if available so it comes back after a power cut.

---

## 6. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

**Log out and SSH back in** so the `docker` group applies.

```bash
docker --version
docker compose version
docker run --rm hello-world
sudo systemctl enable --now docker
```

---

## 7. Firewall

Allow SSH. Optionally allow Hollow on the LAN. Public HTTPS should go through
Cloudflare Tunnel (§9) — you do **not** need to open 80/443 on the router.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH

# Optional: open Hollow to your LAN only (replace with your subnet)
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp

sudo ufw enable
sudo ufw status verbose
```

Find your LAN CIDR:

```bash
ip route | grep default
# e.g. via 192.168.1.1 → often 192.168.1.0/24
```

---

## 8. Install and run Hollow

### 8.1 Clone

```bash
sudo mkdir -p /opt/hollow
sudo chown "$USER":"$USER" /opt/hollow
git clone https://github.com/SaiyamJn/Hollow.git /opt/hollow
cd /opt/hollow
```

(Use your real remote URL if different.)

### 8.2 Create production env

```bash
cp .env.example .env
nano .env
```

Generate secrets (run three times). Prefer hex only — special characters like
`@` in `POSTGRES_PASSWORD` used to break the database URL:

```bash
openssl rand -hex 32
```

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | Long random password |
| `JWT_SECRET` | Different long random secret |
| `CONTENT_ENCRYPTION_KEY` | Recommended: another `openssl rand -hex 32`. Encrypts unlocked content at rest. If omitted, derived from `JWT_SECRET` — rotating JWT later can make old ciphertext unreadable |
| `ADMIN_EMAILS` | Your email, or leave empty |
| `HOST_PORT` | Default `8080` |
| `CORS_ORIGIN` | After the public URL works: `https://notes.yourdomain.com` |

Example:

```env
POSTGRES_PASSWORD=paste_secret_1
JWT_SECRET=paste_secret_2
CONTENT_ENCRYPTION_KEY=paste_secret_3
ADMIN_EMAILS=you@example.com
HOST_PORT=8080
# CORS_ORIGIN=https://notes.example.com
```

Never commit `.env`. Keep a copy in a password manager.

### 8.3 Build and start

```bash
cd /opt/hollow
docker compose up -d --build
```

First build can take several minutes on an old CPU.

Check:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# → {"ok":true,"name":"Hollow","version":"1.0.0",...}
```

On the LAN:

```text
http://SERVER_LAN_IP:8080
```

or

```text
http://hollow.local:8080
```

Register an account in the UI. Migrations run automatically on backend start
(`prisma migrate deploy`).

### 8.4 Useful Compose commands

```bash
cd /opt/hollow
docker compose logs -f backend
docker compose logs -f web
docker compose restart backend
docker compose ps
docker compose down
docker compose up -d --build
```

---

## 9. Reach Hollow from the internet

### Option A — Cloudflare Tunnel (recommended for home / DHCP)

No port-forwarding, free HTTPS at the edge.

1. Create a free Cloudflare account and add your domain.
2. Install `cloudflared` on the server:

```bash
curl -L --output /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
```

3. Authenticate and create a tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create hollow
cloudflared tunnel list
cloudflared tunnel route dns hollow notes.example.com
```

Replace `notes.example.com` with your hostname.

4. Config:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp /opt/hollow/deploy/cloudflared.config.example.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml
```

Example:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /home/saiya/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: notes.example.com
    service: http://localhost:8080
  - service: http_status:404
```

Use the credentials path printed by `tunnel create` (sometimes under `/root/.cloudflared/`).

5. Install as a service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

6. Visit `https://notes.example.com` and confirm login works.

Then set CORS and restart:

```bash
nano /opt/hollow/.env
# CORS_ORIGIN=https://notes.example.com
cd /opt/hollow && docker compose up -d
```

### Option B — VPS with public IP (Caddy / Nginx + Let’s Encrypt)

1. Point DNS `A` record of `notes.example.com` to the VPS IP.
2. Keep Hollow on `127.0.0.1:8080`, put Caddy or Nginx in front for TLS.

**Caddy** (`/etc/caddy/Caddyfile`):

```caddy
notes.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

**Nginx** (host Nginx, not the container):

```nginx
server {
    listen 443 ssl http2;
    server_name notes.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d notes.example.com
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## 10. Auto-start after reboot

```bash
sudo systemctl enable docker
sudo cp /opt/hollow/deploy/hollow.service /etc/systemd/system/hollow.service
sudo systemctl daemon-reload
sudo systemctl enable --now hollow.service
```

If you use Cloudflare Tunnel:

```bash
sudo systemctl enable --now cloudflared
```

Docker’s `restart: unless-stopped` also brings containers back after reboot;
the systemd unit makes `compose up` explicit.

Test:

```bash
sudo reboot
```

After it comes back:

```bash
ssh saiya@SERVER_LAN_IP
cd /opt/hollow && docker compose ps
curl -s http://127.0.0.1:8080/api/health
```

---

## 11. Mobile app against production

```bash
# mobile/.env
EXPO_PUBLIC_API_URL=https://notes.example.com/api
```

Rebuild / restart Expo. The path **must** include `/api` because Nginx strips
that prefix before forwarding to Express.

LAN-only testing:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:8080/api
```

Phone and server must be on the same Wi‑Fi; HTTP is fine on LAN only.

---

## 12. Backups

Nightly Postgres dump:

```bash
sudo mkdir -p /var/backups/hollow
crontab -e
```

```cron
0 3 * * * docker compose -f /opt/hollow/docker-compose.yml exec -T postgres pg_dump -U hollow hollow | gzip > /var/backups/hollow/hollow-$(date +\%F).sql.gz
30 3 * * * find /var/backups/hollow -name '*.sql.gz' -mtime +14 -delete
```

Also keep a safe offline copy of `/opt/hollow/.env`.

Restore (destructive — replaces DB contents):

```bash
cd /opt/hollow
gunzip -c /var/backups/hollow/hollow-YYYY-MM-DD.sql.gz | \
  docker compose exec -T postgres psql -U hollow hollow
```

---

## 13. Updating Hollow

```bash
cd /opt/hollow
git pull
docker compose up -d --build
docker compose logs -f backend   # confirm migrate deploy succeeded
```

---

## 14. Routine maintenance

```bash
sudo apt update && sudo apt upgrade -y
cd /opt/hollow && docker compose ps
docker system prune -f
df -h
sudo systemctl status cloudflared --no-pager   # if using the tunnel
```

Reboot after kernel updates when convenient: `sudo reboot`.

---

## 15. Troubleshooting

| Symptom | Check |
|---|---|
| Cannot SSH after reboot | New DHCP IP — check router client list; set a reservation (§4.3) |
| Laptop sleeps with lid closed | §5 |
| `curl localhost:8080/api/health` fails | `cd /opt/hollow && docker compose ps` / `docker compose logs backend` |
| Migrations fail | `.env` password changed after first volume create; wipe only if OK to lose data: `docker compose down -v` |
| Web loads, API 404 | Use Nginx URL (`:8080`), not the backend port directly |
| Live collab / sockets broken | Tunnel/proxy must allow WebSockets; see `/socket.io/` in Nginx config |
| Mobile cannot login | `EXPO_PUBLIC_API_URL` must be `https://domain/api` (with `/api`) |
| Cloudflare 502 | Hollow not on `HOST_PORT`; tunnel `service:` must match `http://localhost:8080` |

---

## 16. Security checklist

- [ ] Strong `POSTGRES_PASSWORD`, `JWT_SECRET`, and preferably `CONTENT_ENCRYPTION_KEY`
- [ ] HTTPS via Cloudflare or Let’s Encrypt (do not expose plain HTTP publicly)
- [ ] SSH key auth; disable password SSH if possible
- [ ] `ADMIN_EMAILS` set only to accounts you trust
- [ ] Regular DB backups + offline `.env` copy
- [ ] Keep the host and images updated (`apt upgrade`, rebuild images periodically)

Hollow stores JWTs in the browser `localStorage` by design for this project —
fine for a self-hosted notes app; harden further before treating it as
high-security production.

---

## 17. Local development vs this server

| | Dev (your PC) | This Ubuntu server |
|---|---|---|
| Infra | `docker compose -f docker-compose.dev.yml up -d` | `docker compose up -d --build` |
| API | `cd backend && npm run dev` | container `backend` |
| Web | `cd frontend && npm run dev` | container `web` (Nginx) |
| DB URL | `localhost:5433` | `postgres:5432` inside compose |

Do **not** run both compose files against the same host ports at once without
changing mappings.

---

## Quick path

1. §3 updates + SSH  
2. §4 hostname + DHCP reservation  
3. §5 lid/sleep (laptop only)  
4. §6 Docker  
5. §7 UFW  
6. §8 Hollow up on `:8080`  
7. §9 Cloudflare Tunnel (if you want public HTTPS)  
8. §10 enable services + reboot test  
9. §12 backups  
