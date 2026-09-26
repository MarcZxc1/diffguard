ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubAccessTokenCiphertext" TEXT;
ALTER TABLE "User" DROP COLUMN IF EXISTS "githubAccessToken";

CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");

CREATE TABLE IF NOT EXISTS "OAuthLoginExchange" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthLoginExchange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OAuthLoginExchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthLoginExchange_codeHash_key" ON "OAuthLoginExchange"("codeHash");
CREATE INDEX IF NOT EXISTS "OAuthLoginExchange_expiresAt_idx" ON "OAuthLoginExchange"("expiresAt");
