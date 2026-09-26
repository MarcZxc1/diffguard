DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryState" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewRunState" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FailureCategory" AS ENUM ('CONFIGURATION', 'AUTHORIZATION', 'RATE_LIMIT', 'NOT_FOUND', 'INVALID_RESPONSE', 'VALIDATION', 'STALE_COMMIT', 'UPSTREAM', 'TRANSIENT', 'INTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FindingCategory" AS ENUM ('SECURITY', 'POLICY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PublicationState" AS ENUM ('PENDING', 'POSTED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "GithubWebhookDelivery" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GithubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GithubWebhookDelivery"
  ADD COLUMN IF NOT EXISTS "state" "DeliveryState" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS "failureCategory" "FailureCategory",
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "GithubWebhookDelivery_deliveryId_key" ON "GithubWebhookDelivery"("deliveryId");
CREATE INDEX IF NOT EXISTS "GithubWebhookDelivery_state_receivedAt_idx" ON "GithubWebhookDelivery"("state", "receivedAt");

CREATE TABLE IF NOT EXISTS "GithubInstallation" (
  "id" TEXT NOT NULL,
  "githubInstallationId" BIGINT NOT NULL,
  "accountLogin" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GithubInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GithubInstallation_githubInstallationId_key" ON "GithubInstallation"("githubInstallationId");

CREATE TABLE IF NOT EXISTS "GithubRepository" (
  "id" TEXT NOT NULL,
  "githubRepositoryId" BIGINT NOT NULL,
  "installationId" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "ruleConfiguration" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GithubRepository_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GithubRepository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GithubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GithubRepository_githubRepositoryId_key" ON "GithubRepository"("githubRepositoryId");
CREATE INDEX IF NOT EXISTS "GithubRepository_fullName_idx" ON "GithubRepository"("fullName");
CREATE INDEX IF NOT EXISTS "GithubRepository_installationId_enabled_idx" ON "GithubRepository"("installationId", "enabled");

CREATE TABLE IF NOT EXISTS "ReviewRun" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "pullRequestNumber" INTEGER NOT NULL,
  "headSha" TEXT NOT NULL,
  "ruleConfiguration" JSONB NOT NULL DEFAULT '{}',
  "state" "ReviewRunState" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retryable" BOOLEAN NOT NULL DEFAULT true,
  "failureCategory" "FailureCategory",
  "failureMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "analyzedFileCount" INTEGER NOT NULL DEFAULT 0,
  "skippedFileCount" INTEGER NOT NULL DEFAULT 0,
  "findingCount" INTEGER NOT NULL DEFAULT 0,
  "suppressedFindingCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewRun_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "GithubWebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReviewRun_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReviewRun_deliveryId_key" ON "ReviewRun"("deliveryId");
CREATE INDEX IF NOT EXISTS "ReviewRun_state_nextAttemptAt_idx" ON "ReviewRun"("state", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "ReviewRun_repositoryId_pullRequestNumber_createdAt_idx" ON "ReviewRun"("repositoryId", "pullRequestNumber", "createdAt");

CREATE TABLE IF NOT EXISTS "Finding" (
  "id" TEXT NOT NULL,
  "reviewRunId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "category" "FindingCategory" NOT NULL,
  "severity" "FindingSeverity" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "filePath" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "remediation" TEXT NOT NULL,
  "suppressed" BOOLEAN NOT NULL DEFAULT false,
  "suppressionReason" TEXT,
  "publicationState" "PublicationState" NOT NULL DEFAULT 'PENDING',
  "githubCommentId" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Finding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Finding_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "ReviewRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Finding_reviewRunId_fingerprint_key" ON "Finding"("reviewRunId", "fingerprint");
CREATE INDEX IF NOT EXISTS "Finding_reviewRunId_suppressed_severity_idx" ON "Finding"("reviewRunId", "suppressed", "severity");
