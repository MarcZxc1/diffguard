import type { ChangedLine } from "../lib/diff-parser";

export type RuleFinding = {
  category: "hardcoded_secret";
  severity: "high";
  filePath: string;
  lineNumber: number;
  confidence: number;
  title: string;
  explanation: string;
  recommendation: string;
};

const secretPattern =
  /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"']{8,}["']/i;
const providerSecretPattern = /\b(?:sk_live|sk_test)_[A-Za-z0-9_-]{8,}\b/;

export function scanChangedLines(lines: ChangedLine[]): RuleFinding[] {
  return lines
    .filter((line) => line.changeType === "added")
    .filter((line) => secretPattern.test(line.content) || providerSecretPattern.test(line.content))
    .map((line) => ({
      category: "hardcoded_secret" as const,
      severity: "high" as const,
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      confidence: 0.98,
      title: "Possible hardcoded secret",
      explanation:
        "This change appears to place a credential directly in source code. Anyone with repository access could reuse it, and rotating it later becomes difficult.",
      recommendation:
        "Move the value to a secret manager or environment variable, then rotate the exposed credential.",
    }));
}
