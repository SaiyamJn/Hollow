# Deploy Hollow on a Linux server

This guide gets Hollow running on an Ubuntu (or similar) machine and reachable
from the internet. Prefer **Cloudflare Tunnel** if the server is behind home
NAT (no port forwarding). Use **public IP + TLS** if you have a VPS with open ports.

## Architecture

```
Internet
   │
   ▼
Cloudflare Tunnel  (or your firewall → :443)
   │
   ▼
Nginx (:8080 on the host)          ← docker service `web`
   ├─ /            → static React SPA
   ├─ /api/*       → backend:4000  (prefix stripped)
   └─ /socket.io/* → backend:4000  (WebSockets)
         │
         ├─ PostgreSQL
         └─ Redis
```

Mobile apps point `EXPO_PUBLIC_API_URL` at `https://your.domain/api`.

---

## 0. What you need

- A Linux box (Ubuntu Server 22.04/24.04 recommended)
- Docker Engine + Compose plugin
- A domain you control (for HTTPS / Cloudflare)
- This repo (git clone or copy)

---

## 1. Prepare the server

### 1.1 Update & basics

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates
```

### 1.2 Keep a laptop awake with the lid closed (home server only)

```bash
sudo nano /etc/systemd/logind.conf
```

Set:

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

Then:

```bash
sudo systemctl restart systemd-logind
```

Also disable sleep in power settings if your distro uses them.

### 1.3 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in so the docker group applies
docker --version
docker compose version
```

### 1.4 Firewall (optional but recommended)

If you only use Cloudflare Tunnel, you do **not** need to open 80/443 publicly.
Allow SSH from your LAN/VPN:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

If you expose Nginx directly on the VPS:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## 2. Install Hollow

### 2.1 Clone

```bash
sudo mkdir -p /opt/hollow
sudo chown "$USER":"$USER" /opt/hollow
git clone https://github.com/SaiyamJn/Hollow.git /opt/hollow
cd /opt/hollow
```

(Use your real remote URL if different.)

### 2.2 Create production env

```bash
cp .env.example .env
nano .env
```

Set at least:

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | Long random password |
| `JWT_SECRET` | Different long random secret (`openssl rand -hex 32`) |
| `ADMIN_EMAILS` | Your email, or leave empty |
| `HOST_PORT` | Default `8080` — tunnel / reverse proxy target |
| `CORS_ORIGIN` | Optional: `https://notes.example.com` |

Generate secrets:

```bash
openssl rand -hex 32
```

### 2.3 Build and start

```bash
cd /opt/hollow
docker compose up -d --build
```

First build takes a few minutes (frontend + backend images).

Check health:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# → {"ok":true}
```

Open locally on the LAN:

```text
http://SERVER_LAN_IP:8080
```

Migrations run automatically when the backend container starts (`prisma migrate deploy`).

### 2.4 Useful Compose commands

```bash
docker compose logs -f backend
docker compose logs -f web
docker compose restart backend
docker compose down
docker compose up -d --build    # after pulling code changes
```

---

## 3. Put it on the internet

### Option A — Cloudflare Tunnel (recommended for home servers)

No router port-forwarding, free HTTPS at the edge.

1. Create a free Cloudflare account and add your domain.
2. Install `cloudflared` on the server:

```bash
# Debian/Ubuntu package — see https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

3. Authenticate and create a tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create hollow
cloudflared tunnel route dns hollow notes.example.com
```

Replace `notes.example.com` with your hostname.

4. Config — copy the example and edit:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp /opt/hollow/deploy/cloudflared.config.example.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml
```

Fill in:

- `tunnel:` UUID (from `cloudflared tunnel list`)
- `credentials-file:` path shown after `tunnel create` (usually `/root/.cloudflared/<uuid>.json`)
- `hostname:` your DNS name
- `service:` `http://localhost:8080` (or whatever `HOST_PORT` you set)

5. Install as a service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

6. Visit `https://notes.example.com` — register an account.

Optional: set `CORS_ORIGIN=https://notes.example.com` in `/opt/hollow/.env` and
`docker compose up -d` again.

### Option B — VPS with public IP (Nginx / Caddy + Let’s Encrypt)

1. Point DNS `A` record of `notes.example.com` to the VPS IP.
2. Keep Hollow on `127.0.0.1:8080`, put Caddy or Nginx in front for TLS.

**Caddy example** (`/etc/caddy/Caddyfile`):

```caddy
notes.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

**Nginx example** (host Nginx, not the container):

```nginx
server {
    listen 443 ssl http2;
    server_name notes.example.com;
    # certbot will manage ssl_certificate lines

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

Then:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d notes.example.com
```

---

## 4. Auto-start after reboot

```bash
sudo cp /opt/hollow/deploy/hollow.service /etc/systemd/system/hollow.service
sudo systemctl daemon-reload
sudo systemctl enable --now hollow.service
```

Docker’s `restart: unless-stopped` also brings containers back after a reboot
once the Docker daemon is up. The unit above ensures `compose up` runs.

If you use Cloudflare Tunnel, keep `cloudflared` enabled as in §3A.

---

## 5. Mobile app against production

On your phone / Expo build machine, set:

```bash
# mobile/.env
EXPO_PUBLIC_API_URL=https://notes.example.com/api
```

Rebuild / restart Expo. The path **must** include `/api` because Nginx strips
that prefix before forwarding to Express.

---

## 6. Backups

Nightly Postgres dump (adjust container name from `docker compose ps`):

```bash
sudo mkdir -p /var/backups/hollow
sudo crontab -e
```

```cron
0 3 * * * docker compose -f /opt/hollow/docker-compose.yml exec -T postgres pg_dump -U hollow hollow | gzip > /var/backups/hollow/hollow-$(date +\%F).sql.gz
```

Restore (destructive — replaces DB contents):

```bash
gunzip -c /var/backups/hollow/hollow-YYYY-MM-DD.sql.gz | \
  docker compose exec -T postgres psql -U hollow hollow
```

Also keep copies of `/opt/hollow/.env` somewhere safe offline.

---

## 7. Updating the app

```bash
cd /opt/hollow
git pull
docker compose up -d --build
docker compose logs -f backend   # confirm migrate deploy succeeded
```

---

## 8. Local development vs production

| | Dev | Production |
|---|---|---|
| Infra | `docker compose -f docker-compose.dev.yml up -d` | `docker compose up -d --build` |
| API | `cd backend && npm run dev` on host | container `backend` |
| Web | `cd frontend && npm run dev` (Vite proxies `/api`) | container `web` (Nginx) |
| DB URL | `localhost:5433` | `postgres:5432` inside compose |

Do **not** run both compose files against the same host ports at once without
changing mappings.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| `curl localhost:8080/api/health` fails | `docker compose ps`, `docker compose logs backend` |
| Migrations fail | DB password mismatch between `.env` and first-time volume; wipe volume only if OK to lose data: `docker compose down -v` |
| Web loads but API 404 | Confirm you open via Nginx (`:8080`), not the backend port directly |
| Socket / live collab broken | Cloudflare / proxy must allow WebSockets; see `/socket.io/` in `nginx/nginx.conf` |
| Mobile can’t login | `EXPO_PUBLIC_API_URL` must be `https://domain/api` (with `/api`) |
| 502 from Cloudflare | Hollow not listening on `HOST_PORT`; tunnel `service:` must match |

---

## 10. Security checklist

- [ ] Strong `POSTGRES_PASSWORD` and `JWT_SECRET`
- [ ] HTTPS via Cloudflare or Let’s Encrypt (never expose plain HTTP on the public internet)
- [ ] SSH key auth; disable password SSH if possible
- [ ] `ADMIN_EMAILS` set only to accounts you trust
- [ ] Regular DB backups
- [ ] Keep the host and images updated (`apt upgrade`, rebuild images periodically)

Hollow stores JWTs in the browser `localStorage` by design for this project —
fine for a self-hosted notes app; harden further before treating it as
high-security production.
