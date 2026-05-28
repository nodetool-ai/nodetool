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
    // Scan tests across base-nodes AND every domain-split package
    // (core-nodes, llm-nodes, image-nodes, etc.) so the audit reflects
    // the post-split test layout.
    const packagesRoot = path.resolve(__dirname, "../..");
    const testDirs = fs
      .readdirSync(packagesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(packagesRoot, e.name, "tests"))
      .filter((d) => {
        try {
          return fs.statSync(d).isDirectory();
        } catch {
          return false;
        }
      });
    const files = testDirs
      .flatMap(walkTestFiles)
      .filter((file) => {
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
