import { describe, expect, it } from "bun:test";
import type { ChangedLine } from "../lib/diff-parser";
import {
  deterministicRules,
  RuleConfigurationError,
  scanPullRequest,
} from "./rule-engine";

function scan(lines: ChangedLine[], configuration: unknown = {}) {
  return scanPullRequest({
    context: {
      headSha: "abc123",
      files: [...new Set(lines.map((line) => line.filePath))].map((filename) => ({
        filename,
        status: "modified",
      })),
      changedLines: lines,
    },
    configuration,
  });
}

const fixtures = [
  {
    ruleId: "security.hardcoded-secret",
    positive: 'const apiKey = "AbC123-secret-value";',
    negative: 'const apiKey = process.env.API_KEY;',
  },
  {
    ruleId: "security.unsafe-sql-construction",
    positive: "await prisma.$queryRawUnsafe(query);",
    negative: "await prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;",
  },
  {
    ruleId: "security.dynamic-command-execution",
    positive: "exec(`convert ${req.body.name}`);",
    negative: 'spawn("convert", [validatedName]);',
  },
  {
    ruleId: "security.untrusted-path",
    positive: "return sendFile(path.join(base, req.params.name));",
    negative: "return sendFile(knownSafePath);",
  },
  {
    ruleId: "security.explicit-auth-bypass",
    positive: "const skipAuth = true;",
    negative: "const authenticationRequired = true;",
  },
  {
    ruleId: "security.permissive-cors",
    positive: 'app.use(cors({ origin: "*" }));',
    negative: 'app.use(cors({ origin: "https://app.example" }));',
  },
  {
    ruleId: "security.unvalidated-request-write",
    positive: "await prisma.user.create({ data: req.body });",
    negative: "await prisma.user.create({ data: parsed.data });",
  },
] as const;

describe("deterministic security rules", () => {
  for (const fixture of fixtures) {
    it(`${fixture.ruleId} has positive and negative fixtures`, () => {
      const findings = scan([
        {
          filePath: "src/example.ts",
          lineNumber: 10,
          content: fixture.positive,
          changeType: "added",
        },
        {
          filePath: "src/safe.ts",
          lineNumber: 4,
          content: fixture.negative,
          changeType: "added",
        },
      ]);
      expect(findings.some((finding) => finding.ruleId === fixture.ruleId)).toBe(true);
      expect(
        findings.some(
          (finding) => finding.ruleId === fixture.ruleId && finding.filePath === "src/safe.ts",
        ),
      ).toBe(false);
      const removed = scan([{
        filePath: "src/removed.ts",
        lineNumber: 8,
        content: fixture.positive,
        changeType: "removed",
      }]);
      expect(removed.some((finding) => finding.ruleId === fixture.ruleId)).toBe(false);
    });
  }

  it("registers each expected Phase 2 rule exactly once", () => {
    const ruleIds = deterministicRules.map((rule) => rule.id);
    expect(new Set(ruleIds).size).toBe(10);
    expect(ruleIds).toContain("policy.source-change-without-tests");
    expect(ruleIds).toContain("policy.identifier-naming");
    expect(ruleIds).toContain("policy.repository-path-naming");
  });

  it("enforces each rule's supported file metadata", () => {
    const findings = scan([{
      filePath: "docs/query.md",
      lineNumber: 2,
      content: "await prisma.$queryRawUnsafe(query);",
      changeType: "added",
    }]);
    expect(
      findings.some((finding) => finding.ruleId === "security.unsafe-sql-construction"),
    ).toBe(false);
  });

  it("redacts suspected secret values from evidence", () => {
    const secret = "AbC123-super-private-value";
    const findings = scan([{
      filePath: "src/config.ts",
      lineNumber: 1,
      content: `const apiKey = "${secret}";`,
      changeType: "added",
    }]);
    const finding = findings.find((item) => item.ruleId === "security.hardcoded-secret");
    expect(finding?.evidence).not.toContain(secret);
    expect(JSON.stringify(finding)).not.toContain(secret);
  });

  it("ignores generic credential fixtures and placeholders", () => {
    const findings = scan([
      {
        filePath: "tests/config.fixture.ts",
        lineNumber: 1,
        content: 'const apiKey = "AbC123-real-shaped-value";',
        changeType: "added",
      },
      {
        filePath: "src/config.ts",
        lineNumber: 2,
        content: 'const apiKey = "example-value";',
        changeType: "added",
      },
    ]);
    expect(findings.some((finding) => finding.ruleId === "security.hardcoded-secret")).toBe(false);
  });

  it("separates repository policy findings from security findings", () => {
    const findings = scan([{
      filePath: "src/feature.ts",
      lineNumber: 1,
      content: "export const feature = true;",
      changeType: "added",
    }]);
    const policy = findings.find(
      (finding) => finding.ruleId === "policy.source-change-without-tests",
    );
    expect(policy?.category).toBe("POLICY");
  });

  it("does not raise the missing-tests policy when a test file changes", () => {
    const findings = scan([
      {
        filePath: "src/feature.ts",
        lineNumber: 1,
        content: "export const feature = true;",
        changeType: "added",
      },
      {
        filePath: "src/feature.test.ts",
        lineNumber: 1,
        content: "test('feature', () => {});",
        changeType: "added",
      },
    ]);
    expect(
      findings.some((finding) => finding.ruleId === "policy.source-change-without-tests"),
    ).toBe(false);
  });

  it("keeps maintainability naming rules opt-in and advisory", () => {
    const line: ChangedLine = {
      filePath: "src/example.ts",
      lineNumber: 3,
      content: "const user_name = 'Ada';",
      changeType: "added",
    };
    expect(
      scan([line]).some((finding) => finding.ruleId === "policy.identifier-naming"),
    ).toBe(false);

    const findings = scan([line], {
      maintainability: {
        enabled: true,
        identifierNaming: "CAMEL_PASCAL",
        fileNaming: "OFF",
        folderNaming: "OFF",
      },
    });
    const naming = findings.find(
      (finding) => finding.ruleId === "policy.identifier-naming",
    );
    expect(naming?.category).toBe("POLICY");
    expect(naming?.title).toContain("camelCase");
  });

  it("accepts camelCase, PascalCase, and upper-snake constants", () => {
    const findings = scan([
      {
        filePath: "src/example.ts",
        lineNumber: 1,
        content: "const userName = 'Ada';",
        changeType: "added",
      },
      {
        filePath: "src/example.ts",
        lineNumber: 2,
        content: "const MAX_RETRIES = 3;",
        changeType: "added",
      },
      {
        filePath: "src/example.ts",
        lineNumber: 3,
        content: "class ReviewWorker {}",
        changeType: "added",
      },
      {
        filePath: "src/example.ts",
        lineNumber: 4,
        content: "// const user_name is retained for migration documentation",
        changeType: "added",
      },
    ], {
      maintainability: {
        enabled: true,
        identifierNaming: "CAMEL_PASCAL",
        fileNaming: "OFF",
        folderNaming: "OFF",
      },
    });
    expect(
      findings.some((finding) => finding.ruleId === "policy.identifier-naming"),
    ).toBe(false);
  });

  it("applies configured naming only to added or renamed source paths", () => {
    const configuration = {
      maintainability: {
        enabled: true,
        identifierNaming: "OFF",
        fileNaming: "KEBAB_CASE",
        folderNaming: "SNAKE_CASE",
      },
    };
    const findings = scanPullRequest({
      context: {
        headSha: "abc123",
        files: [
          { filename: "featureModules/UserProfile.ts", status: "added" },
          { filename: "legacyModules/UserProfile.ts", status: "modified" },
        ],
        changedLines: [{
          filePath: "featureModules/UserProfile.ts",
          lineNumber: 1,
          content: "export const userName = 'Ada';",
          changeType: "added",
        }],
      },
      configuration,
    });
    const pathFindings = findings.filter(
      (finding) => finding.ruleId === "policy.repository-path-naming",
    );
    expect(pathFindings).toHaveLength(1);
    expect(pathFindings[0]?.title).toContain("File name");
    expect(pathFindings[0]?.category).toBe("POLICY");

    const compliant = scanPullRequest({
      context: {
        headSha: "def456",
        files: [{ filename: "feature_modules/user-profile.ts", status: "added" }],
        changedLines: [{
          filePath: "feature_modules/user-profile.ts",
          lineNumber: 1,
          content: "export const userName = 'Ada';",
          changeType: "added",
        }],
      },
      configuration,
    });
    expect(
      compliant.some((finding) => finding.ruleId === "policy.repository-path-naming"),
    ).toBe(false);
  });

  it("supports ignored paths, severity thresholds, and reasoned suppressions", () => {
    const lines: ChangedLine[] = [
      {
        filePath: "generated/config.ts",
        lineNumber: 1,
        content: 'const apiKey = "AbC123-generated-secret";',
        changeType: "added",
      },
      {
        filePath: "src/config.ts",
        lineNumber: 2,
        content: 'const apiKey = "AbC123-application-secret";',
        changeType: "added",
      },
    ];
    const findings = scan(lines, {
      ignoredPaths: ["generated/**"],
      severityThreshold: "HIGH",
      suppressions: [{
        ruleId: "security.hardcoded-secret",
        path: "src/config.ts",
        reason: "Known local-only development credential",
      }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.suppressed).toBe(true);
    expect(findings[0]?.suppressionReason).toContain("local-only");
  });

  it("rejects unknown rule configuration instead of silently weakening coverage", () => {
    expect(() => scan([], { enabledRuleIds: ["unknown.rule"] })).toThrow(
      RuleConfigurationError,
    );
  });

  it("keeps fingerprints stable for a retry and distinct across revisions", () => {
    const line: ChangedLine = {
      filePath: "src/config.ts",
      lineNumber: 7,
      content: 'const apiKey = "AbC123-application-secret";',
      changeType: "added",
    };
    const first = scan([line]).find((finding) => finding.ruleId === "security.hardcoded-secret");
    const second = scan([line]).find((finding) => finding.ruleId === "security.hardcoded-secret");
    const nextRevision = scanPullRequest({
      context: {
        headSha: "def456",
        files: [{ filename: line.filePath, status: "modified" }],
        changedLines: [line],
      },
    }).find((finding) => finding.ruleId === "security.hardcoded-secret");
    expect(first?.fingerprint).toBe(second?.fingerprint);
    expect(first?.fingerprint).not.toBe(nextRevision?.fingerprint);
  });
});
