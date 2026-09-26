-- Preserve rule-version boundaries in historical pilot evidence. Existing
-- snapshots predate version-aware gating and remain explicitly marked unknown.
ALTER TABLE "PilotPrecisionSnapshot"
ADD COLUMN "ruleVersion" TEXT NOT NULL DEFAULT 'unknown';

DROP INDEX "PilotPrecisionSnapshot_repositoryId_ruleId_snapshotAt_idx";

CREATE INDEX "pilot_precision_repo_rule_version_snapshot_idx"
ON "PilotPrecisionSnapshot"("repositoryId", "ruleId", "ruleVersion", "snapshotAt");
