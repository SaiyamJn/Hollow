# Hollow — deployment & networking

Target: an old laptop running Ubuntu Server 24.04 LTS as a headless home
server, exposed to the internet without port forwarding.

## docker-compose.yml (verbatim)

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: hollow
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      POSTGRES_DB: hollow
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  backend:
    build: ./backend
    env_file: ./backend/.env
    depends_on: [postgres, redis]
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./frontend/dist:/usr/share/nginx/html:ro
    ports:
      - "8080:80"
    depends_on: [backend]
    restart: unless-stopped

volumes:
  pgdata:
```

## nginx/nginx.conf (verbatim)

```nginx
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://backend:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
        proxy_pass http://backend:4000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
    }
}
```

## Backend Dockerfile (verbatim)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

## Setup steps

1. Install Ubuntu Server 24.04 on the laptop.
2. Prevent it from sleeping when the lid closes: edit
   `/etc/systemd/logind.conf`, set `HandleLidSwitch=ignore`, restart
   `systemd-logind`.
3. Install Docker + Docker Compose plugin.
4. Clone the project, `cp backend/.env.example backend/.env` and fill in
   real secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`).
5. `docker compose up -d --build`.
6. Run the first migration once, pointing `DATABASE_URL` at `localhost`
   instead of `postgres` for this one command: `cd backend && npx prisma
   migrate dev --name init`.

## Exposing it to the internet — Cloudflare Tunnel

No router port-forwarding, no static IP needed, free TLS at the edge.

1. Install `cloudflared` on the laptop; `cloudflared tunnel login`.
2. `cloudflared tunnel create hollow`.
3. Add a DNS route: `cloudflared tunnel route dns hollow notes.yourdomain.com`.
4. Config file (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: hollow
   credentials-file: /root/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: notes.yourdomain.com
       service: http://localhost:8080
     - service: http_status:404
   ```
5. Run as a service: `sudo cloudflared service install`, then
   `sudo systemctl enable --now cloudflared`.

## Auto-start & resilience

- Systemd unit so Docker Compose comes back up after a reboot/power cut:
  ```ini
  [Unit]
  Description=Hollow app
  Requires=docker.service
  After=docker.service

  [Service]
  WorkingDirectory=/opt/hollow
  ExecStart=/usr/bin/docker compose up -d
  ExecStop=/usr/bin/docker compose down
  Restart=on-failure

  [Install]
  WantedBy=multi-user.target
  ```
- Nightly backup cron: `pg_dump` to a file outside the container, ideally
  synced to another disk or cloud storage:
  ```
  0 3 * * * docker exec <postgres-container> pg_dump -U hollow hollow > /backups/hollow-$(date +\%F).sql
  ```

## Networking concepts checklist (for the resume angle)

Make sure these are genuinely implemented, not just named, so they hold up
under interview questions:
- **REST API design** — versionless is fine for v1, but keep routes
  resource-oriented and status codes correct (401 vs 403 vs 423 for locked).
- **WebSocket protocol** — the HTTP→WS upgrade handshake happens
  automatically via Socket.io/Nginx config above; be able to explain it.
- **JWT auth** — stateless bearer tokens, verified per request.
- **TLS** — terminated at Cloudflare's edge; understand this means
  laptop-to-Cloudflare traffic through the tunnel is what you'd secure next
  if going further (cloudflared already encrypts this channel).
- **Reverse proxy** — Nginx routing `/api`, `/socket.io`, and static assets
  to different upstreams.
- **Reverse tunneling / NAT traversal** — Cloudflare Tunnel avoids exposing
  the laptop's IP or opening router ports; know roughly how this differs
  from traditional port forwarding.
- **CRDTs over WebSockets** — once Yjs is wired in (backend doc, phase 2),
  this is your strongest distributed-systems talking point.
- **Encryption at rest** — AES-256-GCM with PBKDF2-derived keys for locked
  sections; be able to explain why the key is derived per-request rather
  than stored.
