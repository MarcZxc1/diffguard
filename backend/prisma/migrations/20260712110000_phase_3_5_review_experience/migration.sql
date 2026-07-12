ALTER TYPE "DeliveryState" ADD VALUE IF NOT EXISTS 'SKIPPED';
ALTER TYPE "ReviewRunState" ADD VALUE IF NOT EXISTS 'SKIPPED';

ALTER TABLE "GithubRepository"
  ADD COLUMN IF NOT EXISTS "draftPullRequestPolicy" TEXT NOT NULL DEFAULT 'SKIP',
  ADD COLUMN IF NOT EXISTS "checkRunMode" TEXT NOT NULL DEFAULT 'ADVISORY',
  ADD COLUMN IF NOT EXISTS "llmReviewEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "llmModel" TEXT NOT NULL DEFAULT 'gpt-5.6-sol',
  ADD COLUMN IF NOT EXISTS "retentionDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "ReviewRun"
  ADD COLUMN IF NOT EXISTS "checkRunId" BIGINT,
  ADD COLUMN IF NOT EXISTS "checkRunUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "checkRunStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "checkRunConclusion" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "llmState" TEXT NOT NULL DEFAULT 'SKIPPED',
  ADD COLUMN IF NOT EXISTS "llmFailureMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "rerunReason" TEXT,
  ADD COLUMN IF NOT EXISTS "rerunRequestedByUserId" TEXT;

ALTER TABLE "Finding"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'DETERMINISTIC';

CREATE INDEX IF NOT EXISTS "ReviewRun_repositoryId_pullRequestNumber_headSha_idx"
  ON "ReviewRun"("repositoryId", "pullRequestNumber", "headSha");

CREATE TABLE IF NOT EXISTS "GithubRepositoryAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GithubRepositoryAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GithubRepositoryAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GithubRepositoryAccess_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GithubRepositoryAccess_userId_repositoryId_key"
  ON "GithubRepositoryAccess"("userId", "repositoryId");
CREATE INDEX IF NOT EXISTS "GithubRepositoryAccess_repositoryId_role_idx"
  ON "GithubRepositoryAccess"("repositoryId", "role");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "repositoryId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditLog_repositoryId_createdAt_idx"
  ON "AuditLog"("repositoryId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx"
  ON "AuditLog"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PullRequestEvidenceExport" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "pullRequestNumber" INTEGER NOT NULL,
  "headSha" TEXT,
  "filename" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "markdownSha256" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PullRequestEvidenceExport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PullRequestEvidenceExport_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PullRequestEvidenceExport_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PullRequestEvidenceExport_repositoryId_pullRequestNumber_version_key"
  ON "PullRequestEvidenceExport"("repositoryId", "pullRequestNumber", "version");
CREATE INDEX IF NOT EXISTS "PullRequestEvidenceExport_repositoryId_pullRequestNumber_createdAt_idx"
  ON "PullRequestEvidenceExport"("repositoryId", "pullRequestNumber", "createdAt");
