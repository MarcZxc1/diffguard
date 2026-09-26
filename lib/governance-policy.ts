export type PathNamingConvention = "OFF" | "KEBAB_CASE" | "CAMEL_CASE" | "SNAKE_CASE";

export type MaintainabilityPolicy = {
  enabled: boolean;
  identifierNaming: "OFF" | "CAMEL_PASCAL";
  fileNaming: PathNamingConvention;
  folderNaming: PathNamingConvention;
};

export type GovernancePolicy = {
  enabled: boolean;
  minimumDescriptionLength: number;
  requiredSections: string[];
  requireIssueReference: boolean;
  maxChangedFiles: number;
  protectedPaths: string[];
  requireTestsForProtectedPaths: boolean;
  testPaths: string[];
};

export type RuleConfiguration = {
  enabledRuleIds?: string[];
  severityThreshold?: string;
  ignoredPaths?: string[];
  suppressions?: Array<Record<string, unknown>>;
  maintainability?: MaintainabilityPolicy;
  governance?: GovernancePolicy;
};

export const defaultGovernancePolicy: GovernancePolicy = {
  enabled: false,
  minimumDescriptionLength: 0,
  requiredSections: [],
  requireIssueReference: false,
  maxChangedFiles: 0,
  protectedPaths: [],
  requireTestsForProtectedPaths: false,
  testPaths: [
    "**/*.test.*",
    "**/*.spec.*",
    "tests/**",
    "**/tests/**",
    "__tests__/**",
    "**/__tests__/**",
  ],
};

const metadataRuleId = "policy.pull-request-metadata";
const sizeRuleId = "policy.pull-request-size";
const protectedTestsRuleId = "policy.protected-change-without-tests";

export function activeGovernanceRuleIds(policy: GovernancePolicy) {
  if (!policy.enabled) return [];

  const ruleIds: string[] = [];
  if (
    policy.minimumDescriptionLength > 0 ||
    policy.requiredSections.length > 0 ||
    policy.requireIssueReference
  ) {
    ruleIds.push(metadataRuleId);
  }
  if (policy.maxChangedFiles > 0) {
    ruleIds.push(sizeRuleId);
  }
  if (policy.requireTestsForProtectedPaths && policy.protectedPaths.length > 0) {
    ruleIds.push(protectedTestsRuleId);
  }
  return ruleIds;
}

export function configurationWithGovernance(
  configuration: RuleConfiguration | undefined,
  governance: GovernancePolicy,
): RuleConfiguration {
  const next: RuleConfiguration = {
    ...configuration,
    governance,
  };
  if (configuration?.enabledRuleIds) {
    next.enabledRuleIds = Array.from(new Set([
      ...configuration.enabledRuleIds,
      ...activeGovernanceRuleIds(governance),
    ]));
  }
  return next;
}

export function governanceSeverityWarning(
  configuration: RuleConfiguration | undefined,
  governance: GovernancePolicy,
) {
  if (
    governance.enabled &&
    activeGovernanceRuleIds(governance).length > 0 &&
    configuration?.severityThreshold &&
    configuration.severityThreshold !== "LOW"
  ) {
    return `The current ${configuration.severityThreshold} severity threshold filters LOW advisory governance findings. Set the repository threshold to LOW for these findings to appear.`;
  }
  return null;
}
