# Deploy Hollow on Ubuntu

This guide gets **Hollow** running on Ubuntu (22.04 / 24.04 LTS) — typically a
home laptop used as a server — and reachable from other networks.

You can do the entire setup over **SSH from another Wi‑Fi**. You do not need to
be on the same LAN as the server while configuring it.

**Remote access options (pick one in §9):**

| Option | Needs a domain? | Good when… |
|---|---|---|
| **Public IP on port 80** | No | Your ISP/router already forwards ports 80/81 to this machine |
| **Tailscale** | No | You want private access only for your own devices |
| **Cloudflare Tunnel** | Yes | You want a public `https://…` hostname |

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
9. [Remote access](#9-remote-access)
10. [Auto-start after reboot](#10-auto-start-after-reboot)
11. [Mobile app (same users as web + EAS Build)](#11-mobile-app-same-users-as-web--eas-build)
12. [Backups](#12-backups)
13. [Updating Hollow](#13-updating-hollow)
14. [Routine maintenance](#14-routine-maintenance)
15. [Troubleshooting](#15-troubleshooting)
16. [Security checklist](#16-security-checklist)
17. [Local development vs this server](#17-local-development-vs-this-server)

---

## 1. What you will end up with

```
Your phone / PC (any network)
        │
        ├─ LAN          → http://192.168.x.x   (or :8080)
        ├─ Public IP    → http://YOUR_PUBLIC_IP   (port 80)
        └─ Tailscale    → http://100.x.y.z:80
                │
                ▼
         Ubuntu host (Docker Compose)
         ├─ web (Nginx)   HOST_PORT → container :80
         ├─ backend API   :4000 (internal)
         ├─ PostgreSQL
         └─ Redis
```

Architecture inside Docker:

```
Nginx (published as HOST_PORT on the host)   ← compose service `web`
├─ /            → static React SPA
├─ /api/*       → backend:4000  (prefix stripped)
└─ /socket.io/* → backend:4000  (WebSockets)
```

`HOST_PORT` in `.env` controls the host listen port (commonly `80` or `8080`).

Mobile apps point `EXPO_PUBLIC_API_URL` at `http://YOUR_PUBLIC_IP/api`
(or Tailscale / domain equivalent). The path **must** include `/api`.

---

## 2. Before you start

- [ ] Ubuntu **22.04 or 24.04 LTS** (Server preferred; Desktop also works)
- [ ] SSH access to the machine (LAN or public IP + port)
- [ ] If it is a laptop: plugged into **AC power**
- [ ] Ethernet preferred over Wi‑Fi
- [ ] Router uses DHCP (reserve a LAN IP if you can — §4.3)
- [ ] Know which ports are forwarded to this machine (e.g. **80** and **81**)
- [ ] This Hollow git repo URL

---

## 3. Ubuntu base setup

### 3.1 Updates and basics

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git ca-certificates ufw openssh-server \
  htop net-tools avahi-daemon
```

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
ssh-copy-id -p YOUR_SSH_PORT saiya@SERVER_IP
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

---

## 4. DHCP, hostname, and LAN IP

### 4.1 Hostname (name of the whole machine)

This is the **server** name (SSH prompt, `.local` discovery) — not a per-app name.

```bash
sudo hostnamectl set-hostname snoe    # pick any name you like
sudo nano /etc/hosts
```

The `127.0.1.1` line must match that hostname:

```text
127.0.0.1 localhost
127.0.1.1 snoe
```

The shell prompt looks like `username@hostname`. Only the part after `@` is the
hostname. Your Linux username (e.g. `saiyam`) does **not** change.

```bash
hostnamectl
hostname
exec bash   # refresh the prompt
```

### 4.2 Find the LAN IP

```bash
hostname -I
ip -4 addr show
```

Example: `192.168.29.109` → LAN subnet is usually `192.168.29.0/24`.

### 4.3 DHCP reservation on the router (recommended)

Reserve this machine’s MAC → a fixed LAN IP so bookmarks and port-forwards stay
stable. Find the MAC with `ip link show`.

---

## 5. Keep a laptop awake (lid closed)

Skip on a VPS or a machine that never sleeps.

```bash
sudo nano /etc/systemd/logind.conf
```

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

Leave the laptop on AC power. In BIOS, enable **AC power recovery → Always On**
if available.

---

## 6. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

**Log out and SSH back in**, then:

```bash
docker --version
docker compose version
docker run --rm hello-world
sudo systemctl enable --now docker
```

---

## 7. Firewall

Allow SSH. Allow Hollow on the port you will publish (`HOST_PORT`).

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH

# If SSH uses a custom port (example: 5001):
# sudo ufw allow 5001/tcp
```

**If you will use public IP on port 80** (§9A):

```bash
sudo ufw allow 80/tcp
```

**If you keep Hollow on LAN-only 8080 for now:**

```bash
# replace 192.168.29.0/24 with your LAN from §4.2
sudo ufw allow from 192.168.29.0/24 to any port 8080 proto tcp
```

```bash
sudo ufw enable
sudo ufw status verbose
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

Generate secrets (**hex only** — run three times):

```bash
openssl rand -hex 32
```

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | **Must be hex from `openssl rand -hex 32`**. Do not use `@` or `#` |
| `JWT_SECRET` | Different hex secret |
| `CONTENT_ENCRYPTION_KEY` | Third hex secret (recommended). Encrypts unlocked content at rest |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin console login at `/admin/login` (min 8 char password). Leave empty to disable |
| `HOST_PORT` | Host port published by Nginx. Use **`80`** if that port is forwarded to this machine; otherwise `8080` |
| `CORS_ORIGIN` | Optional; for a real HTTPS domain later |

**Critical `.env` rules:**

- In `.env` files, `#` starts a **comment**.  
  `POSTGRES_PASSWORD=snoe#1234` becomes just `snoe` — broken.
- Never put passwords into `docker-compose.yml`. Only into `.env`.
- Prefer `openssl rand -hex 32` so URLs never break.

Example for **public access on port 80**:

```env
POSTGRES_PASSWORD=paste_first_hex
JWT_SECRET=paste_second_hex
CONTENT_ENCRYPTION_KEY=paste_third_hex
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_strong_admin_password
HOST_PORT=80
```

Verify (values must be long hex, no `#`):

```bash
grep -E '^(POSTGRES_PASSWORD|JWT_SECRET|CONTENT_ENCRYPTION_KEY|HOST_PORT)=' .env
```

Never commit `.env`. Keep an offline copy.

### 8.3 Build and start

```bash
cd /opt/hollow
docker compose up -d --build
```

First build can take several minutes on an old CPU.

Check (use your `HOST_PORT` — omit `:80` in the browser, but curl needs it only if not 80):

```bash
docker compose ps
# HOST_PORT=80:
curl -s http://127.0.0.1/api/health
# HOST_PORT=8080:
# curl -s http://127.0.0.1:8080/api/health
```

Expect:

```json
{"ok":true,"name":"Hollow","version":"1.0.0","service":"api",...}
```

On the LAN:

```text
http://SERVER_LAN_IP          # if HOST_PORT=80
http://SERVER_LAN_IP:8080     # if HOST_PORT=8080
```

Register an account. Migrations run automatically on backend start.

If the backend crash-loops, see §15 (usually bad `.env` secrets or an outdated image).

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

If you change `POSTGRES_PASSWORD` after the first successful start, Postgres still
has the old password in its volume. Fresh install only:

```bash
docker compose down -v    # deletes database data
docker compose up -d --build
```

---

## 9. Remote access

You do **not** need to be on the same Wi‑Fi as the server to configure this —
SSH in from anywhere and run the commands on the server.

### Option A — Public IP on port 80 (no domain)

Use this when your network already forwards **port 80** (and optionally 81) to
this Ubuntu machine.

1. Set Hollow to listen on 80:

```bash
cd /opt/hollow
nano .env
# HOST_PORT=80
sudo ufw allow 80/tcp
sudo ufw reload
docker compose up -d
curl -s http://127.0.0.1/api/health
```

2. Confirm the router / upstream forward:

```text
Internet :80  →  this machine LAN IP :80
```

Port **81** can stay free for another app later.

3. Open from any network:

```text
http://YOUR_PUBLIC_IP
```

Example: `http://203.192.206.63`

4. Mobile:

```env
EXPO_PUBLIC_API_URL=http://YOUR_PUBLIC_IP/api
```

**Security note:** this is plain **HTTP**. Login traffic is not encrypted on the
wire. Acceptable for a small personal setup if you understand the risk; prefer
Tailscale or a domain + HTTPS for anything sensitive.

---

### Option B — Tailscale (no domain, private)

Only your devices can reach Hollow. No public website.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# open the printed URL in your browser and approve
tailscale ip -4
```

```bash
# match your HOST_PORT (80 or 8080)
sudo ufw allow in on tailscale0 to any port 80 proto tcp
sudo ufw reload
```

On phone/PC: install Tailscale (same account) → open `http://100.x.y.z`
(or `http://100.x.y.z:8080` if `HOST_PORT=8080`).

```env
EXPO_PUBLIC_API_URL=http://100.x.y.z/api
```

---

### Option C — Cloudflare Tunnel (needs a domain)

Free HTTPS hostname; no port-forward for Hollow. Requires a domain on Cloudflare.

1. Install and log in (copy the URL from the **SSH terminal** into your local browser):

```bash
curl -L --output /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared tunnel login
```

2. Create tunnel + DNS:

```bash
cloudflared tunnel create hollow
cloudflared tunnel route dns hollow notes.example.com
```

3. Config — point at your `HOST_PORT` (example uses 80):

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /home/saiya/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: notes.example.com
    service: http://localhost:80
  - service: http_status:404
```

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

```bash
# optional CORS lock
nano /opt/hollow/.env
# CORS_ORIGIN=https://notes.example.com
cd /opt/hollow && docker compose up -d
```

---

### Option D — Domain + Caddy / Nginx on a VPS

If the machine has a public IP and you later buy a domain, put Caddy/Nginx +
Let’s Encrypt in front of `http://127.0.0.1:80` (or `:8080`). Details omitted
here — use Option C (Cloudflare) or a standard reverse-proxy guide.

---

## 10. Auto-start after reboot

```bash
sudo systemctl enable docker
sudo cp /opt/hollow/deploy/hollow.service /etc/systemd/system/hollow.service
sudo systemctl daemon-reload
sudo systemctl enable --now hollow.service
```

If using Cloudflare Tunnel: `sudo systemctl enable --now cloudflared`  
Tailscale usually enables itself with the install script.

Test:

```bash
sudo reboot
```

After it comes back (SSH in again):

```bash
cd /opt/hollow && docker compose ps
curl -s http://127.0.0.1/api/health    # or :8080 if HOST_PORT=8080
```

---

## 11. Mobile app (same users as web + EAS Build)

The Expo app talks to the **same** Hollow API and PostgreSQL as the web UI.
Register or log in with the same email/password on phone or desktop — notebooks,
pages, tasks, and quick notes are shared.

| How you access the server | `EXPO_PUBLIC_API_URL` |
|---|---|
| Public IP on port 80 | `http://YOUR_PUBLIC_IP/api` |
| LAN only, port 8080 | `http://192.168.29.109:8080/api` |
| Tailscale, port 80 | `http://100.x.y.z/api` |
| Cloudflare HTTPS | `https://notes.example.com/api` |

Always include the `/api` suffix. That value is **baked into** release binaries
at build time (not changeable later without rebuilding).

### 11.1 Dev against production (Expo Go)

On your PC:

```bash
cd mobile
cp .env.example .env
# edit: EXPO_PUBLIC_API_URL=http://YOUR_PUBLIC_IP/api
npm install
npx expo start
```

Scan the QR code with Expo Go (SDK 54). Confirm Settings shows the API URL and
`/health` is OK.

### 11.2 Build installable apps with Expo.dev (EAS)

One-time setup (Expo account required — free tier is enough for APKs):

```bash
cd mobile
npm install
npx eas-cli@latest login
npx eas-cli@latest init    # links this folder to an Expo project; writes projectId
```

`mobile/eas.json` already points production builds at
`http://203.192.206.63/api`. Change that value if your host or path differs
(Tailscale, HTTPS domain, etc.).

Android APK you can sideload (recommended first):

```bash
npm run build:android
# same as: npx eas-cli@latest build --profile preview --platform android
```

Follow the URL on [expo.dev](https://expo.dev) → download the APK → install on
the phone (allow “install unknown apps” if prompted).

iOS (needs Apple Developer account for device builds):

```bash
npm run build:ios
```

Profiles in `eas.json`:

| Profile | Output | Use |
|---|---|---|
| `preview` | Android **APK**, internal iOS | Sideload / TestFlight-style internal |
| `production` | Android **AAB**, store iOS | Play Store / App Store |
| `development` | Dev client | Optional native debugging |

Cleartext HTTP is enabled in `app.config.js` so `http://…` APIs work on device.
When you move to HTTPS, you can tighten ATS / cleartext settings later.

If you change the server URL later, update `eas.json` and run a new EAS build.

---

## 12. Backups

```bash
sudo mkdir -p /var/backups/hollow
crontab -e
```

```cron
0 3 * * * docker compose -f /opt/hollow/docker-compose.yml exec -T postgres pg_dump -U hollow hollow | gzip > /var/backups/hollow/hollow-$(date +\%F).sql.gz
30 3 * * * find /var/backups/hollow -name '*.sql.gz' -mtime +14 -delete
```

Also keep `/opt/hollow/.env` offline.

Restore (destructive):

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
docker compose logs -f backend
```

If `git pull` does not include a fix you applied manually on the server, keep
those local edits or re-apply them after pull.

---

## 14. Routine maintenance

```bash
sudo apt update && sudo apt upgrade -y
cd /opt/hollow && docker compose ps
docker system prune -f
df -h
```

---

## 15. Troubleshooting

| Symptom | Check |
|---|---|
| Cannot SSH after reboot | DHCP IP changed — reserve it (§4.3); or use your public SSH port |
| Laptop sleeps with lid closed | §5 |
| `502 Bad Gateway` | Backend crash-looping: `docker compose logs --tail=80 backend` |
| Prisma host shows `"1234"` / empty DB name | Bad `POSTGRES_PASSWORD` in `.env` (`@` or `#`). Use `openssl rand -hex 32`, never put secrets in `compose` YAML |
| `.env` password “ignored” after `#` | `#` starts a comment in `.env` — use hex only |
| Prisma OpenSSL / `Error load` | Backend image needs OpenSSL (current `backend/Dockerfile`). Rebuild: `docker compose build --no-cache backend` |
| YAML error in compose | Don’t paste passwords into `docker-compose.yml`; restore from repo / §8 |
| Migrations fail after password change | `docker compose down -v` then `up -d --build` (wipes DB — ok on fresh install) |
| Public IP works on SSH but not Hollow | Forward **80 → LAN:80**, set `HOST_PORT=80`, `ufw allow 80/tcp` |
| Mobile cannot login | `EXPO_PUBLIC_API_URL` must end with `/api` (production Nginx). Rebuild EAS after changing it |
| EAS Android build fails / no API | Set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` before `eas build`; run `eas init` once |
| Mobile HTTP blocked on device | `app.config.js` enables cleartext / ATS bypass — rebuild if you removed those |
| Web register/login returns **405** | Frontend built with empty `VITE_API_URL` posts to `/auth` not `/api/auth`. Pull latest, `docker compose up -d --build` (rebuild **web**) |
| Cloudflare login hangs over SSH | Copy the URL from the **server** terminal into your local browser; approve; confirm `~/.cloudflared/cert.pem` exists |

---

## 16. Security checklist

- [ ] Hex-only `POSTGRES_PASSWORD`, `JWT_SECRET`, `CONTENT_ENCRYPTION_KEY`
- [ ] Secrets only in `.env`, never in `docker-compose.yml`
- [ ] SSH key auth; disable password SSH if possible
- [ ] Prefer Tailscale or HTTPS over long-term public plain HTTP
- [ ] If exposing port 80 publicly, accept HTTP risk or add HTTPS later
- [ ] Strong `ADMIN_EMAIL` / `ADMIN_PASSWORD` (or leave unset to disable admin)
- [ ] Regular DB backups + offline `.env` copy
- [ ] Keep Ubuntu and images updated

---

## 17. Local development vs this server

| | Dev (your PC) | This Ubuntu server |
|---|---|---|
| Infra | `docker compose -f docker-compose.dev.yml up -d` | `docker compose up -d --build` |
| API | `cd backend && npm run dev` | container `backend` |
| Web | `cd frontend && npm run dev` | container `web` (Nginx) |
| DB URL | `localhost:5433` | `postgres:5432` inside compose |

---

## Quick path (public IP on port 80, no domain)

1. §3 updates + SSH  
2. §4 hostname + LAN IP (optional DHCP reservation)  
3. §5 lid/sleep (laptop)  
4. §6 Docker  
5. §7 UFW — allow SSH + `80/tcp`  
6. §8 Hollow with hex secrets and `HOST_PORT=80`  
7. §9A — open `http://YOUR_PUBLIC_IP`  
8. §10 enable `hollow.service` + reboot test  
9. §12 backups  

**Alternative without opening the app to the whole internet:** §9B Tailscale instead of §9A.
