# Deploy Hollow on a home Ubuntu laptop (server + NAS)

This guide assumes a **fresh Ubuntu 24.04 LTS** install on an old laptop that will
act as:

1. A **home server** for Hollow (and later other apps)
2. A **NAS** for files on your LAN
3. A machine that stays on **DHCP** from your router (no static IP on the laptop
   itself — reserve an address on the router if you want a stable LAN IP)

Follow the sections in order the first time. Later sections assume earlier ones
are done.

---

## Table of contents

1. [What you will end up with](#1-what-you-will-end-up-with)
2. [Before you start (checklist)](#2-before-you-start-checklist)
3. [Ubuntu base setup](#3-ubuntu-base-setup)
4. [DHCP, hostname, and finding the laptop on the LAN](#4-dhcp-hostname-and-finding-the-laptop-on-the-lan)
5. [Keep the laptop awake (lid closed)](#5-keep-the-laptop-awake-lid-closed)
6. [Disk layout for NAS + Docker apps](#6-disk-layout-for-nas--docker-apps)
7. [Install Docker (shared by all projects)](#7-install-docker-shared-by-all-projects)
8. [Firewall (LAN NAS + SSH; apps via tunnel)](#8-firewall-lan-nas--ssh-apps-via-tunnel)
9. [NAS: Samba file share](#9-nas-samba-file-share)
10. [Install and run Hollow](#10-install-and-run-hollow)
11. [Reach Hollow from the internet (Cloudflare Tunnel)](#11-reach-hollow-from-the-internet-cloudflare-tunnel)
12. [Auto-start after reboot](#12-auto-start-after-reboot)
13. [Mobile app against production](#13-mobile-app-against-production)
14. [Hosting other projects on the same laptop](#14-hosting-other-projects-on-the-same-laptop)
15. [Backups (Hollow + NAS)](#15-backups-hollow--nas)
16. [Updating Hollow](#16-updating-hollow)
17. [Routine maintenance](#17-routine-maintenance)
18. [Troubleshooting](#18-troubleshooting)
19. [Security checklist](#19-security-checklist)
20. [Local development vs this server](#20-local-development-vs-this-server)

---

## 1. What you will end up with

```
Your phone / PC (internet)
        │
        ▼
Cloudflare Tunnel  (HTTPS, no router port-forward)
        │
        ▼
This Ubuntu laptop (DHCP from router)
├─ Docker
│  ├─ Hollow  → localhost:8080  (Nginx + API + Postgres + Redis)
│  └─ (later) other apps on other localhost ports
├─ Samba NAS  → \\SERVERNAME\share  or smb://SERVERNAME/share  (LAN only)
└─ SSH        → you@LAN_IP  (admin)
```

**Design choices for a shared home server:**

| Choice | Why |
|---|---|
| Docker for apps | Isolate Hollow from other projects; easy rebuilds |
| Each app on its own host port (`8080`, `8081`, …) | One Cloudflare Tunnel can route many hostnames |
| Samba for NAS | Works from Windows, macOS, phones on the LAN |
| Cloudflare Tunnel for public HTTPS | No opening 80/443 on the router; fine behind DHCP/NAT |
| Firewall: SSH + Samba LAN-only | NAS stays private; Hollow is public only via Cloudflare |

---

## 2. Before you start (checklist)

- [ ] Ubuntu **24.04 LTS** installed (Server or Desktop — Server is lighter)
- [ ] You can log in on the laptop (keyboard/monitor or already have SSH)
- [ ] Laptop plugged into **AC power** whenever it acts as a server
- [ ] Ethernet preferred over Wi‑Fi (more reliable for NAS)
- [ ] Router uses **DHCP** (default on almost all home routers)
- [ ] Optional but recommended: a domain on **Cloudflare** (free plan is enough)
- [ ] This Hollow git repo URL (or a USB copy of the project)
- [ ] Extra disk or large partition if you want serious NAS capacity (optional)

If Ubuntu Desktop is installed: you can still follow this guide. Prefer logging
in over SSH and leaving the graphical session alone, or install
`ubuntu-server` next time for less RAM use.

---

## 3. Ubuntu base setup

### 3.1 First login and updates

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git ca-certificates ufw openssh-server \
  htop net-tools avahi-daemon
```

`avahi-daemon` lets other devices find the laptop as `hostname.local` on the LAN
(useful with DHCP).

Enable SSH if it is not already running:

```bash
sudo systemctl enable --now ssh
```

### 3.2 Create a normal admin user (if you only have root)

Skip if you already created a user during install.

```bash
sudo adduser saiya
sudo usermod -aG sudo saiya
```

From now on, prefer logging in as that user (not root).

### 3.3 SSH key login (do this from your main PC)

On your **main computer** (not the server):

```bash
# Generate a key if you do not have one
ssh-keygen -t ed25519 -C "hollow-server"

# Copy it to the server (use the DHCP IP you find in §4)
ssh-copy-id saiya@SERVER_LAN_IP
```

Then on the **server**, harden SSH:

```bash
sudo nano /etc/ssh/sshd_config
```

Recommended settings (uncomment / set):

```text
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

Reload:

```bash
sudo systemctl reload ssh
```

**Keep one SSH session open** until you confirm a new key-based login works in
another window, or you can lock yourself out.

### 3.4 Timezone and NTP

```bash
sudo timedatectl set-timezone Asia/Kolkata
timedatectl status
```

(Use your real timezone; list with `timedatectl list-timezones | grep -i asia`.)

---

## 4. DHCP, hostname, and finding the laptop on the LAN

Your laptop gets its IP from the router. That IP can change after a reboot
unless you **reserve** it on the router.

### 4.1 Set a memorable hostname

```bash
sudo hostnamectl set-hostname hollow-nas
```

Also put the name in hosts:

```bash
sudo nano /etc/hosts
```

Ensure a line like:

```text
127.0.1.1   hollow-nas
```

### 4.2 Find the current LAN IP

```bash
ip -4 addr show
hostname -I
```

Look for something like `192.168.1.42` or `192.168.0.x` (not `127.0.0.1`).

From another device on the same Wi‑Fi/LAN you can often reach:

```text
http://hollow-nas.local:8080
```

(after Hollow is running — Avahi/mDNS).

### 4.3 DHCP reservation on the router (strongly recommended)

On the router admin page (often `192.168.1.1` or `192.168.0.1`):

1. Find **DHCP** / **LAN** / **Address reservation** / **Static lease**
2. Reserve the laptop’s **MAC address** → a fixed IP (e.g. `192.168.1.50`)
3. Save and reboot the laptop once so it picks up the reserved address

Find the MAC:

```bash
ip link show
# look for `link/ether aa:bb:cc:dd:ee:ff` on eth0 or wlan0
```

You are still on DHCP — the router just always hands out the same IP. That is
ideal for Samba bookmarks and SSH.

### 4.4 Optional: prefer Ethernet

If both Ethernet and Wi‑Fi are connected, prefer cable. Disable Wi‑Fi if you
do not need it:

```bash
# NetworkManager (common on Desktop / some Server installs)
nmcli radio wifi off
```

---

## 5. Keep the laptop awake (lid closed)

Old laptops often sleep when the lid closes. For a server that must stay on:

### 5.1 Ignore lid switch

```bash
sudo nano /etc/systemd/logind.conf
```

Set (uncomment if needed):

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
```

```bash
sudo systemctl restart systemd-logind
```

### 5.2 Disable suspend / hibernate targets

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

### 5.3 If Ubuntu Desktop is installed

Also turn off automatic suspend in **Settings → Power**, or:

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power lid-close-ac-action 'nothing'
```

(Only applies when a GNOME session is active; `logind` + masking targets cover
headless use.)

### 5.4 Leave it on AC power

Battery-only operation will eventually shut the machine down. Plug it in and,
if the BIOS has it, enable **“AC power recovery → Always On”** so it comes
back after a power cut.

---

## 6. Disk layout for NAS + Docker apps

Keep **system**, **Docker**, and **NAS files** mentally (and preferably
physically) separate so one project cannot fill the OS disk unnoticed.

### 6.1 Recommended directories

```bash
sudo mkdir -p /opt/apps          # git checkouts: Hollow, other projects
sudo mkdir -p /srv/nas           # Samba share root (user files)
sudo mkdir -p /var/backups       # local backup dumps
sudo chown "$USER":"$USER" /opt/apps
sudo chown "$USER":"$USER" /srv/nas
```

Suggested layout later:

```text
/opt/apps/hollow/        ← this repo
/opt/apps/other-project/ ← next Docker app
/srv/nas/documents/
/srv/nas/media/
/srv/nas/backups/        ← optional copy of app backups
```

### 6.2 Optional second disk for NAS

If you added a spare HDD/SSD:

```bash
# List disks (careful — do not wipe the wrong one)
lsblk -f
```

Example: format and mount `/dev/sdb1` as `/srv/nas` (adjust device name):

```bash
sudo mkfs.ext4 -L NAS /dev/sdb1
echo 'LABEL=NAS /srv/nas ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a
sudo chown "$USER":"$USER" /srv/nas
df -h /srv/nas
```

`nofail` lets the machine boot even if the disk is unplugged.

### 6.3 Docker data

By default Docker stores images/volumes under `/var/lib/docker`. That is fine
for Hollow. If the OS disk is tiny, move Docker’s root later — do that before
you accumulate many images (search: “Docker daemon.json data-root”).

---

## 7. Install Docker (shared by all projects)

One Docker Engine for Hollow and every future compose stack:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

**Log out and SSH back in** so the `docker` group applies.

Verify:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Enable Docker on boot (usually already enabled by the install script):

```bash
sudo systemctl enable --now docker
```

---

## 8. Firewall (LAN NAS + SSH; apps via tunnel)

Strategy for this machine:

- **SSH** — allowed (so you can administer)
- **Samba** — allowed on the LAN only (NAS)
- **Hollow / other apps** — bound to localhost or LAN; **public** access only
  through Cloudflare Tunnel (no need to open 80/443 on the router)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH

# Samba (NAS) — open to the world of your LAN only if you trust the network.
# Replace 192.168.1.0/24 with your real LAN subnet from `ip route`.
sudo ufw allow from 192.168.1.0/24 to any port 445 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 139 proto tcp

# Optional: reach Hollow on the LAN without the tunnel (phones on Wi‑Fi)
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp

sudo ufw enable
sudo ufw status verbose
```

Find your LAN CIDR:

```bash
ip route | grep -E 'default|src'
# e.g. default via 192.168.1.1 … → subnet is often 192.168.1.0/24
```

Do **not** open 445/139 to the public internet. Cloudflare Tunnel does not need
inbound router ports for Hollow.

---

## 9. NAS: Samba file share

### 9.1 Install Samba

```bash
sudo apt install -y samba
sudo mkdir -p /srv/nas/{documents,media,backups}
sudo chown -R "$USER":"$USER" /srv/nas
```

### 9.2 Configure a share

Back up and edit the config:

```bash
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak
sudo nano /etc/samba/smb.conf
```

Append at the bottom:

```ini
[nas]
   path = /srv/nas
   browseable = yes
   read only = no
   guest ok = no
   create mask = 0644
   directory mask = 0755
   force user = saiya
```

Replace `saiya` with your Linux username.

### 9.3 Samba password (separate from Linux login)

```bash
sudo smbpasswd -a saiya
sudo smbpasswd -e saiya
sudo systemctl restart smbd nmbd
sudo systemctl enable smbd nmbd
```

### 9.4 Connect from other devices

| OS | How |
|---|---|
| Windows | File Explorer → `\\hollow-nas\nas` or `\\192.168.1.50\nas` |
| macOS | Finder → Go → Connect to Server → `smb://hollow-nas/nas` |
| Linux | Files → Other Locations → `smb://hollow-nas/nas` |
| Phone | Solid Explorer / Files app with SMB, same host + share `nas` |

Use the DHCP-reserved IP if `.local` discovery fails.

### 9.5 Do not put Hollow’s Postgres data on the Samba share

Keep Docker volumes under Docker’s control. Use `/srv/nas` for **your** files
and optional backup copies — not as live DB storage.

---

## 10. Install and run Hollow

### 10.1 Clone the repo

```bash
sudo mkdir -p /opt/apps
sudo chown "$USER":"$USER" /opt/apps
git clone https://github.com/SaiyamJn/Hollow.git /opt/apps/hollow
cd /opt/apps/hollow
```

(Use your real remote URL if different.)

> Older docs used `/opt/hollow`. Either path works; this guide uses
> `/opt/apps/hollow` so other projects can sit beside it. If you already use
> `/opt/hollow`, keep that path and adjust commands below.

### 10.2 Create production env

```bash
cp .env.example .env
nano .env
```

Generate secrets (run three times for three values):

```bash
openssl rand -hex 32
```

Set at least:

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | Long random password |
| `JWT_SECRET` | Different long random secret |
| `CONTENT_ENCRYPTION_KEY` | Recommended: another `openssl rand -hex 32`. Encrypts unlocked page/note/task bodies at rest. If omitted, derived from `JWT_SECRET` — rotating JWT later can make old ciphertext unreadable |
| `ADMIN_EMAILS` | Your email, or leave empty |
| `HOST_PORT` | Default `8080` — leave this; other apps use `8081+` |
| `CORS_ORIGIN` | After the tunnel works: `https://notes.yourdomain.com` |

Example `.env` shape:

```env
POSTGRES_PASSWORD=paste_secret_1
JWT_SECRET=paste_secret_2
CONTENT_ENCRYPTION_KEY=paste_secret_3
ADMIN_EMAILS=you@example.com
HOST_PORT=8080
# CORS_ORIGIN=https://notes.example.com
```

Never commit `.env`. Keep a copy in a password manager or encrypted USB.

### 10.3 Build and start

```bash
cd /opt/apps/hollow
docker compose up -d --build
```

First build can take several minutes on an old laptop (CPU-bound image builds).

Check:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# → {"ok":true}
```

On the LAN (from phone/PC Wi‑Fi):

```text
http://SERVER_LAN_IP:8080
```

or

```text
http://hollow-nas.local:8080
```

Register your account in the UI. Migrations run automatically on backend start
(`prisma migrate deploy`).

### 10.4 Useful Compose commands

```bash
cd /opt/apps/hollow
docker compose logs -f backend
docker compose logs -f web
docker compose restart backend
docker compose ps
docker compose down                 # stop Hollow only
docker compose up -d --build        # after git pull / config change
```

Hollow’s containers are named by the compose project; they do not stop your
other Docker apps.

### 10.5 systemd unit path

If you use the bundled unit file, either edit its `WorkingDirectory` or copy
with a fix:

```bash
sudo cp /opt/apps/hollow/deploy/hollow.service /etc/systemd/system/hollow.service
sudo nano /etc/systemd/system/hollow.service
```

Set:

```ini
WorkingDirectory=/opt/apps/hollow
```

Then enable (also covered in §12).

---

## 11. Reach Hollow from the internet (Cloudflare Tunnel)

Best option for a **home DHCP laptop**: no port forwarding, free HTTPS, works
behind CGNAT.

### 11.1 Cloudflare side

1. Create a free Cloudflare account
2. Add your domain and change nameservers as Cloudflare instructs
3. Wait until the domain shows **Active**

### 11.2 Install `cloudflared` on the laptop

```bash
curl -L --output /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared --version
```

### 11.3 Login, create tunnel, DNS route

```bash
cloudflared tunnel login
# browser opens — pick your domain

cloudflared tunnel create hollow
cloudflared tunnel list
# note the TUNNEL UUID

cloudflared tunnel route dns hollow notes.example.com
```

Replace `notes.example.com` with your hostname.

### 11.4 Tunnel config

```bash
sudo mkdir -p /etc/cloudflared
sudo cp /opt/apps/hollow/deploy/cloudflared.config.example.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml
```

Example:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /home/saiya/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: notes.example.com
    service: http://localhost:8080
  # Add more hostnames later for other projects, e.g.:
  # - hostname: other.example.com
  #   service: http://localhost:8081
  - service: http_status:404
```

If credentials were created as root, path may be
`/root/.cloudflared/<uuid>.json` — use the path printed by `tunnel create`.
Ensure the `cloudflared` service user can read that file (often run as root via
the official service install).

### 11.5 Run tunnel as a service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

Visit `https://notes.example.com` and confirm login works.

Then lock CORS:

```bash
nano /opt/apps/hollow/.env
# CORS_ORIGIN=https://notes.example.com
cd /opt/apps/hollow && docker compose up -d
```

### 11.6 Option B — VPS / public IP (skip if using Cloudflare Tunnel)

Only if the laptop has a public IP or you port-forward 80/443 (not ideal for
this DHCP home setup). Point DNS at the public IP and reverse-proxy to
`127.0.0.1:8080` with Caddy or Nginx + Let’s Encrypt. Prefer §11 Tunnel for
home laptops.

---

## 12. Auto-start after reboot

After a power blip you want: network → Docker → Hollow → Cloudflare Tunnel → Samba.

```bash
sudo systemctl enable docker
sudo systemctl enable smbd nmbd
sudo systemctl enable cloudflared   # if you installed the tunnel

sudo cp /opt/apps/hollow/deploy/hollow.service /etc/systemd/system/hollow.service
sudo sed -i 's|WorkingDirectory=.*|WorkingDirectory=/opt/apps/hollow|' /etc/systemd/system/hollow.service
sudo systemctl daemon-reload
sudo systemctl enable --now hollow.service
```

Docker’s `restart: unless-stopped` also recreates containers when Docker
starts; the systemd unit makes `compose up` explicit.

Test:

```bash
sudo reboot
```

After it comes back (wait a minute):

```bash
ssh saiya@SERVER_LAN_IP
docker compose -f /opt/apps/hollow/docker-compose.yml ps
curl -s http://127.0.0.1:8080/api/health
sudo systemctl status cloudflared --no-pager
```

---

## 13. Mobile app against production

On the machine where you build/run the Expo app, set:

```bash
# mobile/.env
EXPO_PUBLIC_API_URL=https://notes.example.com/api
```

Rebuild / restart Expo. The path **must** include `/api` because the Hollow
Nginx strips that prefix before forwarding to Express.

LAN-only testing (no tunnel):

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:8080/api
```

Phone and laptop must be on the same Wi‑Fi; HTTP is fine on LAN only.

---

## 14. Hosting other projects on the same laptop

Treat each project like Hollow: its own folder, own `.env`, own Compose port.

### 14.1 Conventions

```text
/opt/apps/hollow/          HOST_PORT=8080
/opt/apps/project-b/       publish 127.0.0.1:8081:80
/opt/apps/project-c/       publish 127.0.0.1:8082:80
/srv/nas/                  Samba files (not app code)
```

Bind published ports to localhost when the app is only meant for the tunnel:

```yaml
# in the other project's docker-compose.yml
ports:
  - "127.0.0.1:8081:80"
```

Hollow’s compose currently publishes `8080` on all interfaces (handy for LAN).
That is fine behind UFW. For stricter apps, use `127.0.0.1:PORT:80`.

### 14.2 Add another hostname to the same tunnel

Edit `/etc/cloudflared/config.yml`:

```yaml
ingress:
  - hostname: notes.example.com
    service: http://localhost:8080
  - hostname: other.example.com
    service: http://localhost:8081
  - service: http_status:404
```

```bash
cloudflared tunnel route dns hollow other.example.com
sudo systemctl restart cloudflared
```

### 14.3 Resource limits on an old laptop

Old CPUs/RAM fill up quickly. Per project you can add Compose limits, e.g.:

```yaml
deploy:
  resources:
    limits:
      memory: 512M
```

Watch usage:

```bash
htop
docker stats
df -h
```

Leave headroom for Samba and OS (rough guide: if you have 8 GB RAM, avoid
running many heavy stacks at once).

### 14.4 One Postgres or many?

Prefer **one Postgres container per app** (Hollow already has its own). Sharing
a single global Postgres across projects is possible but couples upgrades and
backups — more pain than it saves on a home NAS laptop.

---

## 15. Backups (Hollow + NAS)

### 15.1 Hollow database (nightly)

```bash
sudo mkdir -p /var/backups/hollow
crontab -e
```

Add:

```cron
0 3 * * * docker compose -f /opt/apps/hollow/docker-compose.yml exec -T postgres pg_dump -U hollow hollow | gzip > /var/backups/hollow/hollow-$(date +\%F).sql.gz
```

Optional: copy dumps into the NAS share:

```cron
5 3 * * * cp /var/backups/hollow/hollow-$(date +\%F).sql.gz /srv/nas/backups/
```

Keep `/opt/apps/hollow/.env` offline too (secrets). Without it, a DB restore
is not enough to run the app.

### 15.2 Restore Hollow DB (destructive)

```bash
cd /opt/apps/hollow
gunzip -c /var/backups/hollow/hollow-YYYY-MM-DD.sql.gz | \
  docker compose exec -T postgres psql -U hollow hollow
```

### 15.3 NAS files

Samba files in `/srv/nas` are not backed up by the Hollow dump. Options:

- Copy important folders to an external drive periodically
- Use `restic` / `rsync` to another PC or cloud
- At minimum: keep a second copy of `/srv/nas/backups` and photos off-site

Example weekly rsync to an external disk mounted at `/mnt/backup-disk`:

```bash
sudo rsync -aH --delete /srv/nas/ /mnt/backup-disk/nas/
```

### 15.4 Prune old DB dumps (optional)

```cron
30 3 * * * find /var/backups/hollow -name '*.sql.gz' -mtime +14 -delete
```

---

## 16. Updating Hollow

```bash
cd /opt/apps/hollow
git pull
docker compose up -d --build
docker compose logs -f backend   # confirm migrate deploy succeeded
```

If something breaks:

```bash
docker compose logs --tail=200 backend
docker compose ps
```

---

## 17. Routine maintenance

Monthly (or when things feel slow):

```bash
sudo apt update && sudo apt upgrade -y
docker system prune -f          # unused images/networks (does not delete volumes)
df -h
docker compose -f /opt/apps/hollow/docker-compose.yml ps
sudo systemctl status cloudflared --no-pager
```

After kernel updates, reboot when convenient:

```bash
sudo reboot
```

Check disk before it hits 100% — full disk breaks Postgres and Samba.

---

## 18. Troubleshooting

| Symptom | Check |
|---|---|
| Cannot SSH after reboot | Router gave a new DHCP IP — check router client list; set a reservation (§4.3) |
| Laptop sleeps with lid closed | §5 — `logind.conf` + masked sleep targets |
| `curl localhost:8080/api/health` fails | `cd /opt/apps/hollow && docker compose ps` and `docker compose logs backend` |
| Migrations fail | `.env` `POSTGRES_PASSWORD` changed after first volume create; only wipe if OK to lose data: `docker compose down -v` |
| Web loads, API 404 | Use Nginx URL (`:8080`), not the backend container port |
| Live collab / sockets broken | Tunnel/proxy must allow WebSockets; Hollow Nginx already routes `/socket.io/` |
| Mobile cannot login | `EXPO_PUBLIC_API_URL` must be `https://domain/api` (with `/api`) |
| Cloudflare 502 | Hollow not on `HOST_PORT`; tunnel `service:` must match (`http://localhost:8080`) |
| Samba not visible | UFW LAN rules; `smbd` running; use IP instead of `.local` |
| Disk full | `df -h`, `docker system df`, prune old dumps under `/var/backups` |
| Slow builds on old CPU | Normal for first `--build`; later starts are faster |

---

## 19. Security checklist

- [ ] SSH key auth; password SSH disabled
- [ ] Strong `POSTGRES_PASSWORD`, `JWT_SECRET`, `CONTENT_ENCRYPTION_KEY`
- [ ] UFW on; Samba not exposed to the internet
- [ ] Public Hollow only via HTTPS (Cloudflare Tunnel or similar)
- [ ] `ADMIN_EMAILS` only accounts you trust
- [ ] `.env` backed up offline, never in git
- [ ] Nightly DB dumps + occasional off-site copy
- [ ] NAS Samba password set; no guest write access
- [ ] Unattended laptop: full-disk encryption was optional at install — if the
      machine might be stolen, consider LUKS next reinstall
- [ ] Keep Ubuntu and Docker images updated

Hollow stores JWTs in the browser `localStorage` by design for this project —
fine for a self-hosted notes app; harden further before treating it as
high-security production.

---

## 20. Local development vs this server

| | Dev (your PC) | This Ubuntu laptop |
|---|---|---|
| Infra | `docker compose -f docker-compose.dev.yml up -d` | `docker compose up -d --build` |
| API | `cd backend && npm run dev` | container `backend` |
| Web | `cd frontend && npm run dev` | container `web` (Nginx) |
| DB URL | `localhost:5433` | `postgres:5432` inside compose |
| Public URL | — | Cloudflare → `:8080` |

Do **not** run both compose files against the same host ports at once without
changing mappings.

---

## Quick “first weekend” path

If you want the shortest successful path:

1. §3 updates + SSH keys  
2. §4 hostname + router DHCP reservation  
3. §5 lid / sleep  
4. §6 `/opt/apps` + `/srv/nas`  
5. §7 Docker  
6. §8 UFW  
7. §9 Samba  
8. §10 Hollow up on `:8080`  
9. §11 Cloudflare Tunnel  
10. §12 enable services + reboot test  
11. §15 backups  

Then add other projects with §14 when you need them.
