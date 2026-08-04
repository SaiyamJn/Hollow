# Hollow

Notes, notebooks, tasks, and quick capture — web + mobile, with a Node/Prisma backend.

## Stack

- **backend** — Express, Prisma, PostgreSQL, Redis, Socket.io
- **frontend** — React, Vite, Tailwind
- **mobile** — Expo (SDK 54)

## Production deploy

Full Linux server + internet access guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**  
(Docker Compose, Nginx, Cloudflare Tunnel, backups, mobile URL).

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d --build
# app: http://localhost:8080
```

## Local development

### 1. Infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# For local dev, point at exposed ports:
# DATABASE_URL=postgresql://hollow:changeme@localhost:5433/hollow
# REDIS_URL=redis://localhost:6380
npm install
npx prisma migrate dev
npm run dev
```

### 3. Web

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/socket.io` to `localhost:4000`.

### 4. Mobile

Same backend and user accounts as the web app. Point the phone at your API:

```bash
cd mobile
cp .env.example .env
# Local backend:  EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:4000
# Production:     EXPO_PUBLIC_API_URL=http://YOUR_PUBLIC_IP/api
npm install
npx expo start
```

Use Expo Go (SDK 54) for day-to-day work.

**Installable builds (Expo.dev / EAS):** see [DEPLOYMENT.md §11](./DEPLOYMENT.md#11-mobile-app-same-users-as-web--eas-build). Short version:

```bash
cd mobile
# edit eas.json → EXPO_PUBLIC_API_URL=http://YOUR_PUBLIC_IP/api
npx eas-cli@latest login
npx eas-cli@latest init
npm run build:android   # APK on expo.dev
```

## Notes

- Do not commit `.env` files — only `.env.example` templates are tracked.
- Admin console: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (min 8 chars), then open `/admin/login`.
