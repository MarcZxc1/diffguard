import crypto from "node:crypto";
import { z } from "zod";
import type { ChangedLine } from "../lib/diff-parser";

export const findingSeveritySchema = z.enum([
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

const suppressionSchema = z.object({
  ruleId: z.string().min(1),
  path: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500),
}).strict();

const pathNamingConventionSchema = z.enum([
  "OFF",
  "KEBAB_CASE",
  "CAMEL_CASE",
  "SNAKE_CASE",
]);

const maintainabilityPolicySchema = z.object({
  enabled: z.boolean().default(false),
  identifierNaming: z.enum(["OFF", "CAMEL_PASCAL"]).default("CAMEL_PASCAL"),
  fileNaming: pathNamingConventionSchema.default("OFF"),
  folderNaming: pathNamingConventionSchema.default("OFF"),
}).strict().default({
  enabled: false,
  identifierNaming: "CAMEL_PASCAL",
  fileNaming: "OFF",
  folderNaming: "OFF",
});

export const repositoryRuleConfigurationSchema = z.object({
  enabledRuleIds: z.array(z.string().min(1)).max(100).optional(),
  severityThreshold: findingSeveritySchema.default("LOW"),
  ignoredPaths: z.array(z.string().min(1).max(300)).max(100).default([]),
  suppressions: z.array(suppressionSchema).max(200).default([]),
  maintainability: maintainabilityPolicySchema,
}).strict();

export type FindingSeverity = z.infer<typeof findingSeveritySchema>;
export type RepositoryRuleConfiguration = z.infer<
  typeof repositoryRuleConfigurationSchema
>;

export type ScanFile = {
  filename: string;
  status: string;
};

export type RuleContext = {
  headSha: string;
  files: ScanFile[];
  changedLines: ChangedLine[];
  maintainability?: RepositoryRuleConfiguration["maintainability"];
};

export type RuleCandidate = {
  filePath: string;
  lineNumber: number;
  title: string;
  evidence: string;
  explanation: string;
  remediation: string;
  severity?: FindingSeverity;
  confidence?: number;
};

export type DeterministicRule = {
  id: string;
  version: string;
  category: "SECURITY" | "POLICY";
  supportedFiles: readonly string[];
  severity: FindingSeverity;
  confidence: number;
  scan(context: RuleContext): RuleCandidate[];
};

export type RuleFinding = Required<
  Pick<RuleCandidate, "filePath" | "lineNumber" | "title" | "evidence" | "explanation" | "remediation">
> & {
  ruleId: string;
  ruleVersion: string;
  source: "DETERMINISTIC" | "LLM";
  category: "SECURITY" | "POLICY";
  severity: FindingSeverity;
  confidence: number;
  fingerprint: string;
  suppressed: boolean;
  suppressionReason?: string;
};

export class RuleConfigurationError extends Error {}

const sourceFilePattern = /\.(?:[cm]?[jt]sx?|py|rb|php|java|go|rs|cs)$/i;
const configurationFilePattern = /(?:^|\/)(?:\.env(?:\.[^/]+)?|[^/]*(?:config|settings)[^/]*)$|\.(?:json|ya?ml|toml|ini|conf)$/i;
const testFilePattern = /(?:^|\/)(?:test|tests|__tests__|fixtures?)(?:\/|$)|(?:\.|_)(?:spec|test)\.[^.]+$/i;
const javascriptFilePattern = /\.[cm]?[jt]sx?$/i;

function addedLines(context: RuleContext) {
  return context.changedLines.filter((line) => line.changeType === "added");
}

function supportsLine(rule: Omit<DeterministicRule, "scan">, filePath: string) {
  return rule.supportedFiles.some((supported) => {
    if (supported === "source") return sourceFilePattern.test(filePath);
    if (supported === "configuration") return configurationFilePattern.test(filePath);
    if (supported === "JavaScript" || supported === "TypeScript") {
      return /\.[cm]?[jt]sx?$/i.test(filePath);
    }
    if (supported === "Python") return /\.py$/i.test(filePath);
    return false;
  });
}

function lineRule(params: Omit<DeterministicRule, "scan"> & {
  detect(line: ChangedLine): RuleCandidate | undefined;
}): DeterministicRule {
  return {
    ...params,
    scan(context) {
      return addedLines(context)
        .filter((line) => supportsLine(params, line.filePath))
        .map((line) => params.detect(line))
        .filter((candidate): candidate is RuleCandidate => Boolean(candidate));
    },
  };
}

function hasUsefulEntropy(value: string) {
  if (value.length < 12 || /^(.)\1+$/.test(value)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  const normalized = value.toLowerCase();
  const placeholder = /^(?:example|sample|test|dummy|fake|changeme|replace|your[_-]|xxx|todo)/.test(normalized);
  return classes >= 2 && !placeholder;
}

const providerSecretPattern = /\b(?:AKIA[0-9A-Z]{16}|gh[opsu]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,})\b/;
const assignedSecretPattern = /\b(api[_-]?key|client[_-]?secret|access[_-]?token|secret|token|password)\b\s*[:=]\s*["']([^"']+)["']/i;

const hardcodedSecretRule = lineRule({
  id: "security.hardcoded-secret",
  version: "2.0.0",
  category: "SECURITY",
  supportedFiles: ["source", "configuration"],
  severity: "HIGH",
  confidence: 0.95,
  detect(line) {
    if (testFilePattern.test(line.filePath)) return undefined;

    const providerMatch = line.content.match(providerSecretPattern);
    const assignment = line.content.match(assignedSecretPattern);
    if (!providerMatch && !(assignment?.[2] && hasUsefulEntropy(assignment[2]))) {
      return undefined;
    }

    const identifier = assignment?.[1]?.replace(/[^A-Za-z0-9_-]/g, "") ?? "provider credential";
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Possible hardcoded credential",
      evidence: `Added a credential-like value for ${identifier}; the value was redacted.`,
      explanation:
        "This line matches a focused credential pattern. The rule does not prove that the value is active, but committing reusable credentials can expose systems to unauthorized access.",
      remediation:
        "Move the value to an environment variable or secret manager and rotate it if it was ever active.",
    };
  },
});

const unsafeSqlRule = lineRule({
  id: "security.unsafe-sql-construction",
  version: "1.0.0",
  category: "SECURITY",
  supportedFiles: ["JavaScript", "TypeScript"],
  severity: "HIGH",
  confidence: 0.9,
  detect(line) {
    const unsafeApi = line.content.match(/(?:\$queryRawUnsafe|\$executeRawUnsafe)\s*\(/);
    const interpolatedSql = /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i.test(line.content) &&
      !/\$queryRaw\s*`/.test(line.content);
    if (!unsafeApi && !interpolatedSql) return undefined;
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Unsafe SQL construction",
      evidence: unsafeApi
        ? `Added a call to ${unsafeApi[0].replace(/\s*\($/, "")}.`
        : "Added string interpolation inside a SQL statement.",
      explanation:
        "Dynamic SQL can allow untrusted values to change query structure when values are not bound as parameters.",
      remediation: "Use the database client's parameterized or tagged-template query API.",
    };
  },
});

const commandExecutionRule = lineRule({
  id: "security.dynamic-command-execution",
  version: "1.0.0",
  category: "SECURITY",
  supportedFiles: ["JavaScript", "TypeScript", "Python"],
  severity: "HIGH",
  confidence: 0.86,
  detect(line) {
    const commandSink = /\b(?:exec|execSync|system|popen)\s*\(/.test(line.content);
    const dynamicInput = /(?:req\.(?:body|query|params)|request\.|input|\$\{)/i.test(line.content);
    if (!commandSink || !dynamicInput) return undefined;
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Dynamic command execution",
      evidence: "Added a command-execution sink with a dynamic input expression.",
      explanation:
        "If the dynamic value is externally controlled, shell parsing may interpret it as additional commands or arguments.",
      remediation:
        "Avoid a shell, use a fixed executable with an argument array, and validate values against a strict allowlist.",
    };
  },
});

const pathHandlingRule = lineRule({
  id: "security.untrusted-path",
  version: "1.0.0",
  category: "SECURITY",
  supportedFiles: ["JavaScript", "TypeScript"],
  severity: "MEDIUM",
  confidence: 0.82,
  detect(line) {
    const pathSink = /\b(?:readFile|writeFile|sendFile|createReadStream|createWriteStream|path\.(?:join|resolve))\s*\(/.test(line.content);
    const requestInput = /\breq\.(?:body|query|params)\b/.test(line.content);
    if (!pathSink || !requestInput) return undefined;
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Request data reaches a filesystem path",
      evidence: "Added request-derived data to a path or filesystem operation.",
      explanation:
        "Untrusted path segments can escape an intended directory when traversal components or absolute paths are accepted.",
      remediation:
        "Resolve against a fixed base directory, reject absolute/traversal paths, and verify the final path remains inside the base.",
    };
  },
});

const authBypassRule = lineRule({
  id: "security.explicit-auth-bypass",
  version: "1.0.0",
  category: "SECURITY",
  supportedFiles: ["source", "configuration"],
  severity: "HIGH",
  confidence: 0.88,
  detect(line) {
    if (!/\b(?:skipAuth|disableAuth)\s*[:=]\s*true|\b(?:authenticationRequired|auth)\s*[:=]\s*false/i.test(line.content)) {
      return undefined;
    }
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Explicit authentication bypass",
      evidence: "Added configuration that appears to disable or skip authentication.",
      explanation:
        "Disabling an authentication guard can expose a route or operation. The exact impact depends on how this flag is consumed.",
      remediation: "Require the normal authentication and authorization middleware, or document and test why the endpoint is intentionally public.",
    };
  },
});

const insecureCorsRule = lineRule({
  id: "security.permissive-cors",
  version: "1.0.0",
  category: "SECURITY",
  supportedFiles: ["JavaScript", "TypeScript", "configuration"],
  severity: "MEDIUM",
  confidence: 0.9,
  detect(line) {
    if (!/\bcors\s*\(\s*\)|\borigin\s*:\s*["']\*["']|Access-Control-Allow-Origin[^\n]*["']\*["']/i.test(line.content)) {
      return undefined;
    }
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Permissive cross-origin policy",
      evidence: "Added a wildcard or default-open CORS configuration.",
      explanation:
        "A broadly open origin policy can let untrusted sites call browser-accessible endpoints, especially when other protections are weak.",
      remediation: "Allow only the trusted frontend origins required by this deployment and test credential behavior explicitly.",
    };
  },
});

const missingValidationRule = lineRule({
  id: "security.unvalidated-request-write",
  version: "1.0.0",
  category: "SECURITY",
  supportedFiles: ["JavaScript", "TypeScript"],
  severity: "MEDIUM",
  confidence: 0.8,
  detect(line) {
    const writeSink = /\b(?:prisma|db)\.[A-Za-z0-9_]+\.(?:create|update|upsert|delete)\s*\(/.test(line.content);
    const directRequest = /\breq\.(?:body|query|params)\b/.test(line.content);
    if (!writeSink || !directRequest) return undefined;
    return {
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      title: "Request data written without an obvious validation boundary",
      evidence: "Added a database write that directly references request data on the same line.",
      explanation:
        "Direct request objects may contain unexpected fields or types. This focused rule cannot see validation performed elsewhere.",
      remediation: "Parse the request with a strict schema and pass only the validated fields into the database call.",
    };
  },
});

const missingTestsPolicyRule: DeterministicRule = {
  id: "policy.source-change-without-tests",
  version: "1.0.0",
  category: "POLICY",
  supportedFiles: ["source"],
  severity: "LOW",
  confidence: 0.72,
  scan(context) {
    const sourceFiles = context.files.filter(
      (file) => sourceFilePattern.test(file.filename) && !testFilePattern.test(file.filename),
    );
    const hasTestChange = context.files.some((file) => testFilePattern.test(file.filename));
    if (sourceFiles.length === 0 || hasTestChange) return [];
    const firstFile = sourceFiles[0]!;
    const firstLine = context.changedLines.find(
      (line) => line.filePath === firstFile.filename && line.changeType === "added",
    );
    return [{
      filePath: firstFile.filename,
      lineNumber: firstLine?.lineNumber ?? 1,
      title: "Source change has no accompanying test change",
      evidence: "This pull request changes source files but no recognized test file.",
      explanation:
        "This is repository-policy feedback, not a vulnerability. Existing tests may already cover the behavior.",
      remediation: "Add or update focused tests, or document why existing coverage is sufficient.",
    }];
  },
};

function identifierCore(identifier: string) {
  return identifier.replace(/^_+/, "");
}

function validCamelCase(identifier: string) {
  const core = identifierCore(identifier);
  return core.length > 0 && /^[a-z][A-Za-z0-9]*$/.test(core);
}

function validPascalCase(identifier: string) {
  const core = identifierCore(identifier);
  return core.length > 0 && /^[A-Z][A-Za-z0-9]*$/.test(core);
}

const identifierNamingPolicyRule: DeterministicRule = {
  id: "policy.identifier-naming",
  version: "1.0.0",
  category: "POLICY",
  supportedFiles: ["JavaScript", "TypeScript"],
  severity: "LOW",
  confidence: 0.9,
  scan(context) {
    if (
      !context.maintainability?.enabled ||
      context.maintainability.identifierNaming !== "CAMEL_PASCAL"
    ) {
      return [];
    }

    return addedLines(context)
      .filter((line) => javascriptFilePattern.test(line.filePath))
      .flatMap((line): RuleCandidate[] => {
        const trimmed = line.content.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
          return [];
        }
        const valueDeclaration = line.content.match(
          /\b(const|let|var|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
        );
        if (valueDeclaration) {
          const declaration = valueDeclaration[1]!;
          const identifier = valueDeclaration[2]!;
          const constantStyle = declaration === "const" && /^_?[A-Z][A-Z0-9_]*$/.test(identifier);
          const frameworkStyle = identifier.includes("$");
          if (!constantStyle && !frameworkStyle && !validCamelCase(identifier)) {
            return [{
              filePath: line.filePath,
              lineNumber: line.lineNumber,
              title: "Identifier does not follow camelCase",
              evidence: `Added ${declaration} identifier ${identifier}, which does not match the configured camelCase policy.`,
              explanation:
                "This is maintainability feedback for JavaScript and TypeScript declarations, not a security finding.",
              remediation:
                "Rename multi-word variables and functions to camelCase, or disable the repository naming policy when another convention is intentional.",
            }];
          }
          return [];
        }

        const typeDeclaration = line.content.match(
          /\b(class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
        );
        if (typeDeclaration) {
          const declaration = typeDeclaration[1]!;
          const identifier = typeDeclaration[2]!;
          if (!identifier.includes("$") && !validPascalCase(identifier)) {
            return [{
              filePath: line.filePath,
              lineNumber: line.lineNumber,
              title: "Type identifier does not follow PascalCase",
              evidence: `Added ${declaration} identifier ${identifier}, which does not match the configured PascalCase policy.`,
              explanation:
                "Consistent type naming makes declarations easier to distinguish, but this remains advisory maintainability feedback.",
              remediation:
                "Rename classes, interfaces, type aliases, and enums to PascalCase, or disable the repository naming policy when another convention is intentional.",
            }];
          }
        }
        return [];
      })
      .slice(0, 20);
  },
};

type PathNamingConvention = z.infer<typeof pathNamingConventionSchema>;

function matchesPathNamingConvention(value: string, convention: PathNamingConvention) {
  if (convention === "OFF") return true;
  if (convention === "KEBAB_CASE") {
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
  }
  if (convention === "SNAKE_CASE") {
    return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value);
  }
  return /^[a-z][A-Za-z0-9]*$/.test(value);
}

const conventionalFileNames = new Set([
  "changelog",
  "dockerfile",
  "index",
  "license",
  "makefile",
  "readme",
]);

function fileStem(fileName: string) {
  return fileName.split(".")[0] ?? fileName;
}

const repositoryPathNamingPolicyRule: DeterministicRule = {
  id: "policy.repository-path-naming",
  version: "1.0.0",
  category: "POLICY",
  supportedFiles: ["source"],
  severity: "LOW",
  confidence: 0.88,
  scan(context) {
    const policy = context.maintainability;
    if (!policy?.enabled || policy.fileNaming === "OFF" && policy.folderNaming === "OFF") {
      return [];
    }

    return context.files
      .filter((file) =>
        (file.status === "added" || file.status === "renamed") &&
        sourceFilePattern.test(file.filename)
      )
      .flatMap((file): RuleCandidate[] => {
        const segments = file.filename.split("/").filter(Boolean);
        const basename = segments.at(-1) ?? file.filename;
        const stem = fileStem(basename);
        const firstAddedLine = context.changedLines.find(
          (line) => line.filePath === file.filename && line.changeType === "added",
        );
        if (
          policy.fileNaming !== "OFF" &&
          !conventionalFileNames.has(stem.toLowerCase()) &&
          !matchesPathNamingConvention(stem, policy.fileNaming)
        ) {
          return [{
            filePath: file.filename,
            lineNumber: firstAddedLine?.lineNumber ?? 1,
            title: "File name does not match repository policy",
            evidence: `Added or renamed file ${basename}, which does not match ${policy.fileNaming}.`,
            explanation:
              "Repository-specific file naming improves discoverability, but this is advisory maintainability feedback.",
            remediation:
              "Rename the file to the configured convention or update the repository policy when the exception is intentional.",
          }];
        }

        const invalidFolder = segments.slice(0, -1).find((segment) =>
          !segment.startsWith(".") &&
          segment !== "__tests__" &&
          !matchesPathNamingConvention(segment, policy.folderNaming)
        );
        if (invalidFolder && policy.folderNaming !== "OFF") {
          return [{
            filePath: file.filename,
            lineNumber: firstAddedLine?.lineNumber ?? 1,
            title: "Folder name does not match repository policy",
            evidence: `Added or renamed a source file under folder ${invalidFolder}, which does not match ${policy.folderNaming}.`,
            explanation:
              "Repository-specific folder naming improves navigation, but this is advisory maintainability feedback.",
            remediation:
              "Rename the folder to the configured convention or update the repository policy when the exception is intentional.",
          }];
        }
        return [];
      })
      .slice(0, 20);
  },
};

export const deterministicRules: readonly DeterministicRule[] = [
  hardcodedSecretRule,
  unsafeSqlRule,
  commandExecutionRule,
  pathHandlingRule,
  authBypassRule,
  insecureCorsRule,
  missingValidationRule,
  missingTestsPolicyRule,
  identifierNamingPolicyRule,
  repositoryPathNamingPolicyRule,
];

const severityRank: Record<FindingSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function pathMatches(pattern: string, filePath: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(filePath);
}

function fingerprintFor(params: {
  headSha: string;
  rule: DeterministicRule;
  candidate: RuleCandidate;
}) {
  return crypto.createHash("sha256").update(JSON.stringify([
    params.headSha,
    params.rule.id,
    params.rule.version,
    params.candidate.filePath,
    params.candidate.lineNumber,
  ])).digest("hex");
}

export function parseRuleConfiguration(input: unknown): RepositoryRuleConfiguration {
  const parsed = repositoryRuleConfigurationSchema.safeParse(input);
  if (!parsed.success) {
    throw new RuleConfigurationError("Repository rule configuration is invalid");
  }
  const knownRuleIds = new Set(deterministicRules.map((rule) => rule.id));
  const unknownRule = parsed.data.enabledRuleIds?.find((id) => !knownRuleIds.has(id));
  if (unknownRule) {
    throw new RuleConfigurationError(`Repository enables unknown rule: ${unknownRule}`);
  }
  const unknownSuppression = parsed.data.suppressions.find(
    (suppression) => !knownRuleIds.has(suppression.ruleId),
  );
  if (unknownSuppression) {
    throw new RuleConfigurationError(
      `Repository suppresses unknown rule: ${unknownSuppression.ruleId}`,
    );
  }
  return parsed.data;
}

export function scanPullRequest(params: {
  context: RuleContext;
  configuration?: unknown;
}): RuleFinding[] {
  const configuration = parseRuleConfiguration(params.configuration ?? {});
  const enabled = configuration.enabledRuleIds
    ? new Set(configuration.enabledRuleIds)
    : undefined;
  const context: RuleContext = {
    ...params.context,
    maintainability: configuration.maintainability,
    files: params.context.files.filter(
      (file) => !configuration.ignoredPaths.some((pattern) => pathMatches(pattern, file.filename)),
    ),
    changedLines: params.context.changedLines.filter(
      (line) => !configuration.ignoredPaths.some((pattern) => pathMatches(pattern, line.filePath)),
    ),
  };

  return deterministicRules.flatMap((rule) => {
    if (enabled && !enabled.has(rule.id)) return [];
    return rule.scan(context).flatMap((candidate) => {
      const severity = candidate.severity ?? rule.severity;
      if (severityRank[severity] < severityRank[configuration.severityThreshold]) {
        return [];
      }
      const suppression = configuration.suppressions.find(
        (entry) => entry.ruleId === rule.id &&
          (!entry.path || pathMatches(entry.path, candidate.filePath)) &&
          (!entry.line || entry.line === candidate.lineNumber),
      );
      return [{
        ...candidate,
        ruleId: rule.id,
        ruleVersion: rule.version,
        source: "DETERMINISTIC",
        category: rule.category,
        severity,
        confidence: candidate.confidence ?? rule.confidence,
        fingerprint: fingerprintFor({
          headSha: params.context.headSha,
          rule,
          candidate,
        }),
        suppressed: Boolean(suppression),
        suppressionReason: suppression?.reason,
      }];
    });
  });
}
