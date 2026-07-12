-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "pilotNotes" TEXT,
ADD COLUMN     "pilotVerification" TEXT,
ADD COLUMN     "pilotVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pilotVerifiedBy" TEXT;

-- CreateTable
CREATE TABLE "PilotPrecisionSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "totalFindings" INTEGER NOT NULL,
    "confirmedCount" INTEGER NOT NULL,
    "falsePositiveCount" INTEGER NOT NULL,
    "unverifiedCount" INTEGER NOT NULL,
    "precision" DOUBLE PRECISION NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotPrecisionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PilotPrecisionSnapshot_repositoryId_ruleId_snapshotAt_idx" ON "PilotPrecisionSnapshot"("repositoryId", "ruleId", "snapshotAt");

-- AddForeignKey
ALTER TABLE "PilotPrecisionSnapshot" ADD CONSTRAINT "PilotPrecisionSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GithubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "PullRequestEvidenceExport_repositoryId_pullRequestNumber_create" RENAME TO "PullRequestEvidenceExport_repositoryId_pullRequestNumber_cr_idx";

-- RenameIndex
ALTER INDEX "PullRequestEvidenceExport_repositoryId_pullRequestNumber_versio" RENAME TO "PullRequestEvidenceExport_repositoryId_pullRequestNumber_ve_key";
