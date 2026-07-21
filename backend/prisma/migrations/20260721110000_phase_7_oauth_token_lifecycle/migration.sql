-- Expiry and encrypted refresh-token metadata are optional so existing
-- non-expiring OAuth grants continue to work without a data rewrite.
ALTER TABLE "User"
ADD COLUMN "githubAccessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "githubRefreshTokenCiphertext" TEXT,
ADD COLUMN "githubRefreshTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "githubTokenInvalidatedAt" TIMESTAMP(3);
