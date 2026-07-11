import { describe, expect, it } from "bun:test";
import { parseUnifiedDiff } from "./diff-parser";

describe("parseUnifiedDiff", () => {
  it("maps added, removed, and context lines to new-file line numbers", () => {
    const lines = parseUnifiedDiff(
      "src/auth.ts",
      "@@ -2,3 +2,4 @@\n const user = getUser();\n-password = old;\n+const apiKey = \"secret-value\";\n return user;\n",
    );

    expect(lines).toEqual([
      { filePath: "src/auth.ts", lineNumber: 2, content: "const user = getUser();", changeType: "context" },
      { filePath: "src/auth.ts", lineNumber: 3, content: "password = old;", changeType: "removed" },
      { filePath: "src/auth.ts", lineNumber: 3, content: 'const apiKey = "secret-value";', changeType: "added" },
      { filePath: "src/auth.ts", lineNumber: 4, content: "return user;", changeType: "context" },
    ]);
  });

  it("handles multiple hunks and files independently", () => {
    const first = parseUnifiedDiff("one.ts", "@@ -1 +1,2 @@\n+const one = 1;\n one();\n@@ -8 +9 @@\n+const two = 2;\n");
    const second = parseUnifiedDiff("two.ts", "@@ -4 +4 @@\n+const three = 3;\n");

    expect(first.filter((line) => line.changeType === "added").map((line) => line.lineNumber)).toEqual([1, 9]);
    expect(second[0]?.filePath).toBe("two.ts");
  });
});
