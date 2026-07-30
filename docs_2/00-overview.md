# Hollow — overview & architecture

Self-hosted, multi-user note-taking app. Combines: OneNote (notebook -> section
-> page hierarchy, password-locked sections/notebooks with real encryption),
Google Keep (quick sticky notes), Google Tasks (tasks with subtasks/due dates),
Obsidian (`[[wiki-links]]`, backlinks, graph view), Notion (block-based
editor). Ships as a web app and a React Native mobile app, both talking to one
backend. Deployed on a home Linux server (old laptop), exposed via Cloudflare
Tunnel. Minimal UI, dark theme by default with a light toggle.

Read the other docs in this order when implementing:
1. `01-data-model.md` — Prisma schema (use verbatim)
2. `02-backend-spec.md` — Express + Socket.io API (core routes given verbatim, rest specified)
3. `03-frontend-spec.md` — React web app spec
4. `04-mobile-spec.md` — React Native (Expo) app spec
5. `05-deployment-networking.md` — Docker Compose, Nginx, Cloudflare Tunnel, systemd

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + TypeScript, Express | one language full-stack, native WebSocket support |
| Realtime | Socket.io, later Yjs (CRDT) for collab editing | conflict-free concurrent edits |
| Database | PostgreSQL via Prisma ORM | relational fit for notebook/section/page tree |
| Cache/pubsub | Redis | sessions, socket fan-out across workers |
| Auth | JWT + bcrypt | stateless, standard |
| Web frontend | React + TypeScript (Vite), Tailwind CSS, shadcn/ui | fast to build, easy to theme |
| Editor | BlockNote (ProseMirror-based) | Notion-style block editing out of the box |
| Graph view | react-flow or d3 | Obsidian-style backlink graph |
| Mobile | React Native + Expo, TypeScript | shares language/types with web |
| Reverse proxy | Nginx | TLS termination, routes REST + WS |
| Exposure | Cloudflare Tunnel | no port forwarding, no static IP needed |
| Orchestration | Docker Compose | one command deploy on the laptop |

## Architecture (text form)

```
[Web client (React)]        [Mobile client (React Native/Expo)]
        |                              |
        +--------------+  +------------+
                       |  |
                 [Cloudflare Tunnel]   (TLS, no inbound ports opened)
                       |
        --- old laptop, Docker Compose ---
                       |
              [Nginx reverse proxy]
              /api/*  -> backend:4000
              /socket.io/* -> backend:4000 (upgraded)
              /*      -> static frontend build
                       |
        [Node.js API + Socket.io backend]
              /            \
     [PostgreSQL]         [Redis]
     (all app data)   (sessions, socket pub/sub)
```

## Non-functional requirements

- Multi-user with accounts (JWT auth, per-user data scoping).
- Dark theme is the default; light mode is a toggle, persisted per user
  (localStorage on web, SecureStore/AsyncStorage on mobile). Implement via
  CSS variables + Tailwind `darkMode: "class"` — never hardcode colors.
- Minimal aesthetic: near-black/near-white surfaces (not pure black/white),
  one muted accent color, thin hairline borders, no shadows/gradients,
  generous whitespace, two font weights only (400/500).
- Locked sections/notebooks must be **encrypted at rest** (AES-256-GCM, key
  derived via PBKDF2 from the password) — not just UI-gated. See
  `02-backend-spec.md`.
- Real-time sync between multiple clients editing the same page.
- Works offline on mobile; queued writes sync when connectivity returns.

## Resume-relevant concepts to make visible in the implementation

Add brief code comments at these points so the networking concepts are
legible in the codebase (this app doubles as a learning project):
- JWT auth flow (`middleware/auth.ts`)
- WebSocket upgrade handshake and Socket.io rooms (`index.ts`)
- CRDT-based conflict resolution once Yjs is wired in (see backend doc)
- AES-256-GCM + PBKDF2 key derivation (`lib/encryption.ts`)
- Nginx reverse proxy routing rules (`nginx.conf`)
- Cloudflare Tunnel as reverse-tunnel/NAT traversal (deployment doc)
