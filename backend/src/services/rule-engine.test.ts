import { describe, expect, it } from "bun:test";
import { scanChangedLines } from "./rule-engine";

describe("scanChangedLines", () => {
  it("finds suspicious credentials only on added lines", () => {
    const findings = scanChangedLines([
      { filePath: "src/config.ts", lineNumber: 4, content: 'const apiKey = "123456789";', changeType: "added" },
      { filePath: "src/config.ts", lineNumber: 5, content: 'const password = "old-secret";', changeType: "removed" },
      { filePath: "src/config.ts", lineNumber: 6, content: "const safe = true;", changeType: "added" },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("hardcoded_secret");
    expect(findings[0]?.lineNumber).toBe(4);
  });
});
