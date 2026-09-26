import type { RuleConfiguration } from "@/lib/governance-policy";

export type DiscoveredRepository = {
  githubRepositoryId: number;
  fullName: string;
  canConnect: boolean;
  permission: string;
  diffguardRepositoryId?: string;
  isConnected: boolean;
  isInstalledInDiffguard: boolean;
};

export type Repository = {
  id: string;
  fullName: string;
  enabled: boolean;
  draftPullRequestPolicy: "SKIP" | "ANALYZE";
  checkRunMode: "ADVISORY" | "ENFORCING";
  llmReviewEnabled: boolean;
  llmModel: string;
  retentionDays: number;
  ruleConfiguration?: RuleConfiguration;
  _count?: { reviewRuns: number };
  reviewRuns?: ReviewRun[];
};

export type ReviewRun = {
  id: string;
  pullRequestNumber: number;
  headSha: string;
  state: string;
  attemptCount: number;
  checkRunConclusion?: string | null;
  checkRunUrl?: string | null;
  llmState?: string;
  llmFailureMessage?: string | null;
  analyzedFileCount: number;
  skippedFileCount: number;
  findingCount: number;
  suppressedFindingCount: number;
  createdAt: string;
  completedAt?: string | null;
};

export type Finding = {
  id: string;
  ruleId: string;
  source: string;
  category: string;
  severity: string;
  confidence: number;
  filePath: string;
  lineNumber: number;
  title: string;
  evidence: string;
  explanation: string;
  remediation: string;
  suppressed: boolean;
  suppressionReason?: string | null;
  pilotVerification?: "CONFIRMED" | "FALSE_POSITIVE" | null;
  pilotVerifiedAt?: string | null;
  pilotNotes?: string | null;
};

export type ReviewRunDetail = ReviewRun & {
  findings: Finding[];
};

export type Metrics = {
  totalRuns: number;
  byState: Record<string, number>;
  retryRate: number;
  githubFailureCount: number;
  averageProcessingMilliseconds: number | null;
  suppressionRate: number;
  skippedFileCount: number;
};

export type EvidencePreview = {
  filename: string;
  markdown: string;
  sha256: string;
};

export type RulePrecision = {
  ruleId: string;
  ruleVersion: string;
  totalFindings: number;
  confirmedCount: number;
  falsePositiveCount: number;
  unverifiedCount: number;
  precision: number;
};

export type PilotStatus = {
  status: "COLLECTING" | "READY";
  readyForEnforcement: boolean;
  canEnableEnforcing: boolean;
  developmentBypass: {
    enabled: boolean;
    active: boolean;
  };
  thresholds: {
    minimumReviewedPullRequests: number;
    minimumReliability: number;
    minimumPrecision: number;
    minimumVerifiedFindings: number;
  };
  reviewedPullRequestCount: number;
  completedRunCount: number;
  successfulRunCount: number;
  partialRunCount: number;
  failedRunCount: number;
  skippedRunCount: number;
  reliability: number;
  eligibleRuleIds: string[];
  eligibleRules: Array<{ ruleId: string; ruleVersion: string }>;
  effectiveEnforceableRules: Array<{ ruleId: string; ruleVersion: string }>;
  blockers: string[];
  rules: Array<RulePrecision & {
    verifiedFindingCount: number;
    eligibleForEnforcement: boolean;
  }>;
};

export type AiReviewTestResult = {
  ok: boolean;
  status: string;
  model: string;
  message: string;
};
