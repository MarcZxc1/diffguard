export type ChangedLine = {
  filePath: string;
  lineNumber: number;
  content: string;
  changeType: "added" | "removed" | "context";
};

const hunkHeaderPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(filePath: string, patch: string): ChangedLine[] {
  const lines = patch.split("\n");
  const changedLines: ChangedLine[] = [];
  let newLineNumber = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkHeader = line.match(hunkHeaderPattern);

    if (hunkHeader) {
      newLineNumber = Number(hunkHeader[1]);
      inHunk = true;
      continue;
    }

    if (!inHunk || line === "\\ No newline at end of file") {
      continue;
    }

    if (line.startsWith("+")) {
      changedLines.push({
        filePath,
        lineNumber: newLineNumber,
        content: line.slice(1),
        changeType: "added",
      });
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith("-")) {
      changedLines.push({
        filePath,
        lineNumber: newLineNumber,
        content: line.slice(1),
        changeType: "removed",
      });
      continue;
    }

    if (line.startsWith(" ")) {
      changedLines.push({
        filePath,
        lineNumber: newLineNumber,
        content: line.slice(1),
        changeType: "context",
      });
      newLineNumber += 1;
    }
  }

  return changedLines;
}
