-- Username for login (email OR username). Backfill existing users from email local-part.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User" AS u
SET "username" = lower(
  regexp_replace(split_part(u."email", '@', 1), '[^a-zA-Z0-9_]', '', 'g')
) || '_' || substr(replace(u."id"::text, '-', ''), 1, 6);

-- Empty local-parts → user_<id>
UPDATE "User"
SET "username" = 'user_' || substr(replace("id"::text, '-', ''), 1, 10)
WHERE "username" IS NULL OR "username" = '' OR "username" ~ '^_';

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
