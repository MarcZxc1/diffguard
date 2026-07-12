// intentionally vulnerable teaching fixture

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export async function runUserCommand(userInput: string) {
  // Command execution using user input
  return new Promise((resolve, reject) => {
    exec(`ls -la ${userInput}`, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export async function readUserFile(userFilename: string) {
  // Path traversal using user input
  const filePath = path.join("/var/data/", userFilename);
  return await fs.readFile(filePath, "utf-8");
}
