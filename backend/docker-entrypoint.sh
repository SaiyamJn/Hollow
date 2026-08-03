#!/bin/sh
set -e
# Build DATABASE_URL with a URL-encoded password so characters like @ # : don't break Prisma.
PASS="${POSTGRES_PASSWORD:-changeme}"
ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$PASS")"
export DATABASE_URL="postgresql://hollow:${ENC}@postgres:5432/hollow"
npx prisma migrate deploy
exec node dist/index.js
