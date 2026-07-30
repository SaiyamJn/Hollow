# Hollow

Notes, notebooks, tasks, and quick capture — web + mobile, with a Node/Prisma backend.

## Stack

- **backend** — Express, Prisma, PostgreSQL, Redis, Socket.io
- **frontend** — React, Vite, Tailwind
- **mobile** — Expo (SDK 54)

## Setup

### 1. Infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # set DATABASE_URL, REDIS_URL, JWT_SECRET, optional ADMIN_EMAILS
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

### 4. Mobile

```bash
cd mobile
cp .env.example .env   # set EXPO_PUBLIC_API_URL to your machine LAN IP :4000
npm install
npx expo start
```

Use Expo Go on a device that supports SDK 54.

## Notes

- Do not commit `.env` files — only `.env.example` templates are tracked.
- Admin stats: set `ADMIN_EMAILS` in the backend env to a comma-separated allowlist.
