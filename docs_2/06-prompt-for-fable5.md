Build "Hollow," a self-hosted, multi-user note-taking app combining OneNote
(notebook -> section -> page, with real encryption on locked
sections/notebooks), Google Keep (quick notes), Google Tasks, Obsidian
([[links]], backlinks, graph view), and Notion (block editor). Web + React
Native mobile clients, one Node.js/Express backend, Postgres, Docker Compose
deployment. Minimal UI, dark theme by default with a light toggle.

Attached, read in this order, and follow them exactly — they contain final
decisions on stack, schema, and several files given verbatim:
1. 00-overview.md — architecture and stack
2. 01-data-model.md — Prisma schema
3. 02-backend-spec.md — API routes, sockets, encryption
4. 03-frontend-spec.md — web app, theming, screens
5. 04-mobile-spec.md — Expo app
6. 05-deployment-networking.md — Docker Compose, Nginx, Cloudflare Tunnel

Build in this order:
1. Backend: Prisma schema + migration, auth, notebooks/sections/pages CRUD
   with the lock/unlock + encryption flow.
2. Backend: quick notes, tasks, tags, `[[link]]` parsing + backlinks/graph
   endpoints.
3. Web frontend: auth screens, theming system, sidebar + notebook tree,
   BlockNote page editor with autosave.
4. Web frontend: quick notes grid, tasks list, graph view.
5. Realtime: Socket.io relay, then upgrade to Yjs for real collaborative
   editing.
6. Mobile app (Expo): mirror the web feature set per 04-mobile-spec.md.
7. Deployment: Docker Compose + Nginx + Cloudflare Tunnel per doc 05.

Rules:
- Where a doc gives code verbatim, use it as-is rather than re-deriving it.
  Where it specifies behavior without code, implement it following the
  stated conventions (error handling, security notes, visual language)
  rather than introducing new patterns.
- Output complete, working file contents for every file a phase touches —
  not snippets, not pseudocode.
- Keep explanations minimal: file paths and code, not restated theory
  already in the docs above.
- Stop after each phase and wait for me to confirm before starting the
  next one, so I can actually run and test it as we go.

Start with phase 1.
