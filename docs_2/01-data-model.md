# Hollow — database schema

PostgreSQL via Prisma. Use this schema verbatim as `backend/prisma/schema.prisma`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String      @id @default(uuid())
  email        String      @unique
  passwordHash String
  name         String
  notebooks    Notebook[]
  quickNotes   QuickNote[]
  tasks        Task[]
  createdAt    DateTime    @default(now())
}

model Notebook {
  id           String    @id @default(uuid())
  title        String
  owner        User      @relation(fields: [ownerId], references: [id])
  ownerId      String
  isLocked     Boolean   @default(false)
  passwordHash String?
  salt         String?
  sections     Section[]
  createdAt    DateTime  @default(now())
}

model Section {
  id           String   @id @default(uuid())
  title        String
  notebook     Notebook @relation(fields: [notebookId], references: [id])
  notebookId   String
  isLocked     Boolean  @default(false)
  passwordHash String?
  salt         String?
  pages        Page[]
  createdAt    DateTime @default(now())
}

// content is plain markdown/JSON blocks when the section is unlocked,
// or an AES-256-GCM ciphertext (base64) when the section is locked.
model Page {
  id            String     @id @default(uuid())
  title         String
  content       String     @default("")
  section       Section    @relation(fields: [sectionId], references: [id])
  sectionId     String
  tags          Tag[]      @relation("PageTags")
  outgoingLinks PageLink[] @relation("SourcePage")
  incomingLinks PageLink[] @relation("TargetPage")
  updatedAt     DateTime   @updatedAt
  createdAt     DateTime   @default(now())
}

// Obsidian-style [[links]] between pages, used for backlinks + graph view
model PageLink {
  id           String @id @default(uuid())
  sourcePage   Page   @relation("SourcePage", fields: [sourcePageId], references: [id])
  sourcePageId String
  targetPage   Page   @relation("TargetPage", fields: [targetPageId], references: [id])
  targetPageId String
}

// Google Keep-style quick notes, separate from the notebook hierarchy
model QuickNote {
  id        String   @id @default(uuid())
  content   String
  color     String   @default("gray")
  pinned    Boolean  @default(false)
  archived  Boolean  @default(false)
  owner     User     @relation(fields: [ownerId], references: [id])
  ownerId   String
  createdAt DateTime @default(now())
}

// Google Tasks-style tasks, with subtasks and optional due dates
model Task {
  id           String    @id @default(uuid())
  title        String
  done         Boolean   @default(false)
  dueAt        DateTime?
  owner        User      @relation(fields: [ownerId], references: [id])
  ownerId      String
  parentTask   Task?     @relation("SubTasks", fields: [parentTaskId], references: [id])
  parentTaskId String?
  subtasks     Task[]    @relation("SubTasks")
  createdAt    DateTime  @default(now())
}

model Tag {
  id    String @id @default(uuid())
  name  String @unique
  pages Page[] @relation("PageTags")
}
```

## Notes

- `isLocked` + `passwordHash` + `salt` exist on both `Notebook` and `Section`
  so either can be locked independently. Locking a notebook is a UI-level
  convenience (prompt once, applies to all its sections) — implement it by
  locking each contained section with the same password, so the encryption
  guarantee described in `02-backend-spec.md` still holds per-section.
- Never store the plaintext password anywhere. Only `salt` (random, public)
  and `passwordHash` (bcrypt, for verifying unlock attempts) are persisted.
  The AES key is derived on the fly from the password + salt on each request.
- `PageLink` rows are (re)computed on every page save by parsing `[[Page
  Title]]` occurrences in `content` and resolving them to page IDs within the
  same notebook (see backend doc, page save handler).
- Run `npx prisma migrate dev --name init` after this file is in place.
