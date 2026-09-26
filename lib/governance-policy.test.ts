import { describe, expect, test } from "vitest";
import {
  activeGovernanceRuleIds,
  configurationWithGovernance,
  defaultGovernancePolicy,
  governanceSeverityWarning,
} from "./governance-policy";

describe("governance policy configuration", () => {
  test("adds only active governance rules to an explicit allowlist", () => {
    const governance = {
      ...defaultGovernancePolicy,
      enabled: true,
      minimumDescriptionLength: 80,
      maxChangedFiles: 20,
    };

    expect(activeGovernanceRuleIds(governance)).toEqual([
      "policy.pull-request-metadata",
      "policy.pull-request-size",
    ]);
    expect(configurationWithGovernance({
      enabledRuleIds: ["security.hardcoded-secret"],
      severityThreshold: "LOW",
    }, governance)).toMatchObject({
      enabledRuleIds: [
        "security.hardcoded-secret",
        "policy.pull-request-metadata",
        "policy.pull-request-size",
      ],
      severityThreshold: "LOW",
      governance,
    });
  });

  test("preserves the implicit all-rules mode when no allowlist exists", () => {
    const governance = {
      ...defaultGovernancePolicy,
      enabled: true,
      requireIssueReference: true,
    };
    const configuration = configurationWithGovernance(
      { ignoredPaths: ["vendor/**"] },
      governance,
    );

    expect(configuration.enabledRuleIds).toBeUndefined();
    expect(configuration.ignoredPaths).toEqual(["vendor/**"]);
  });

  test("warns when the repository severity threshold filters advisory governance", () => {
    const governance = {
      ...defaultGovernancePolicy,
      enabled: true,
      requireIssueReference: true,
    };

    expect(governanceSeverityWarning({ severityThreshold: "MEDIUM" }, governance))
      .toContain("filters LOW advisory governance findings");
    expect(governanceSeverityWarning({ severityThreshold: "LOW" }, governance)).toBeNull();
  });
});
