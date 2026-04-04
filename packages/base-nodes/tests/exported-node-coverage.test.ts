import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function testsRoot(): string {
  return path.resolve(__dirname);
}

function sourceRoot(): string {
  return path.resolve(__dirname, "../src");
}

function walkTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTestFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function exportedNodeNames(): string[] {
  const indexSource = fs.readFileSync(
    path.join(sourceRoot(), "index.ts"),
    "utf8"
  );
  const exportBlocks = [
    ...indexSource.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];/g)
  ];

  return [
    ...new Set(
      exportBlocks
        .flatMap((match) => match[1].split(","))
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const aliasMatch = entry.match(
            /^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/
          );
          return aliasMatch ? aliasMatch[2] : entry;
        })
        .filter((name) => name.endsWith("Node"))
    )
  ].sort();
}

describe("exported base node coverage audit", () => {
  it("references every exported node class from at least one behavior test", () => {
    const files = walkTestFiles(testsRoot()).filter((file) => {
      const base = path.basename(file);
      return (
        base !== "metadata-parity.test.ts" &&
        base !== "exported-node-coverage.test.ts"
      );
    });
    const contents = files.map((file) => fs.readFileSync(file, "utf8"));

    const missing = exportedNodeNames().filter(
      (name) => !contents.some((source) => source.includes(name))
    );

    expect(missing).toEqual([]);
  });
});
