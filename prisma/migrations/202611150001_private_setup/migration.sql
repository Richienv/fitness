-- Additive only: preserve existing account IDs, credentials until explicitly updated,
-- and all meal/workout/measurement rows.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginAlias" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "setup" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "User_loginAlias_key" ON "User"("loginAlias");
CREATE TABLE IF NOT EXISTS "LoginAttempt" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "LoginAttempt_expiresAt_idx" ON "LoginAttempt"("expiresAt");
