import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { describe, it, expect } from "vitest";
import {
  collectChangedFiles,
  readChangedFiles,
  isGateRelevantCodeFile
} from "../src/harness/changed-files.js";

describe("collectChangedFiles", () => {
  it.each([" M", "M ", "A ", "D ", " D", "??", "UU"])(
    "reads status %s",
    (status) => {
      expect(
        collectChangedFiles({
          statusOutput: `${status} packages/cli/src/file.ts\0`
        })
      ).toEqual(["packages/cli/src/file.ts"]);
    }
  );

  it.each(["R ", "RM", " C", "C "])(
    "consumes the source record for status %s",
    (status) => {
      expect(
        collectChangedFiles({
          statusOutput: `${status} new.ts\0old.ts\0 M next.ts\0`
        })
      ).toEqual(["new.ts", "old.ts", "next.ts"]);
    }
  );

  it("deduplicates a large diff against the working tree", () => {
    const paths = Array.from(
      { length: 10_000 },
      (_, index) => `packages/agents/src/file-${index}.ts`
    );
    expect(
      collectChangedFiles({
        base: "main",
        diffOutput: paths.join("\0") + "\0",
        statusOutput: paths.map((path) => ` M ${path}\0`).join("")
      })
    ).toEqual(paths);
  });

  it("preserves both surfaces of a staged rename", () => {
    expect(
      collectChangedFiles({
        statusOutput: "R  packages/cli/src/new.ts\0packages/agents/src/old.ts\0"
      })
    ).toEqual(["packages/cli/src/new.ts", "packages/agents/src/old.ts"]);
  });

  it("preserves unusual filenames without interpreting arrows or escapes", () => {
    const paths = [
      "packages/agents/src/café.ts",
      "packages/cli/src/a -> b.ts",
      'packages/cli/src/a"b.ts',
      "packages/cli/src/a\nb.ts",
      "packages/cli/src/a\\t.ts"
    ];
    expect(
      collectChangedFiles({
        statusOutput: paths.map((path) => `?? ${path}\0`).join("")
      })
    ).toEqual(paths);
  });

  it("merges committed and working changes without duplicates", () => {
    expect(
      collectChangedFiles({
        base: "main",
        diffOutput: "packages/agents/src/café.ts\0packages/cli/src/a.ts\0",
        statusOutput: " M packages/cli/src/a.ts\0 D packages/cli/src/gone.ts\0"
      })
    ).toEqual([
      "packages/agents/src/café.ts",
      "packages/cli/src/a.ts",
      "packages/cli/src/gone.ts"
    ]);
  });

  it("handles empty output", () => {
    expect(
      collectChangedFiles({ statusOutput: "", base: "main", diffOutput: "" })
    ).toEqual([]);
  });
});

describe("isGateRelevantCodeFile", () => {
  it("accepts each recognized code extension", () => {
    for (const f of [
      "packages/cli/src/harness.ts",
      "web/src/App.tsx",
      "scripts/build.js",
      "scripts/build.mjs",
      "scripts/build.cjs",
      "packages/cli/src/x.mts"
    ]) {
      expect(isGateRelevantCodeFile(f)).toBe(true);
    }
  });

  it("rejects a test file by *.test.* / *.spec.*", () => {
    expect(isGateRelevantCodeFile("packages/cli/src/harness.test.ts")).toBe(
      false
    );
    expect(isGateRelevantCodeFile("web/src/App.spec.tsx")).toBe(false);
  });

  it("rejects a file under a __tests__ or tests directory", () => {
    expect(
      isGateRelevantCodeFile("packages/cli/src/__tests__/harness.ts")
    ).toBe(false);
    expect(isGateRelevantCodeFile("packages/cli/tests/harness.ts")).toBe(false);
  });

  it("rejects a file under docs/", () => {
    expect(isGateRelevantCodeFile("docs/example.ts")).toBe(false);
  });

  it("rejects markdown", () => {
    expect(isGateRelevantCodeFile("AGENTS.md")).toBe(false);
    expect(isGateRelevantCodeFile("docs/notes.markdown")).toBe(false);
  });

  it("rejects an extension outside the recognized code set", () => {
    expect(isGateRelevantCodeFile("packages/cli/README.txt")).toBe(false);
    expect(isGateRelevantCodeFile("packages/cli/package.json")).toBe(false);
  });
});

describe("Git file selection", () => {
  it("includes renamed source paths and files inside new directories", () => {
    const root = mkdtempSync(join(tmpdir(), "harness-git-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" });
    const write = (path: string): void => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "export const value = 1;\n");
    };
    try {
      git("init", "-q");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "Harness test");
      const oldPath = "packages/agents/src/old.ts";
      const newPath = "packages/cli/src/new.ts";
      write(oldPath);
      git("add", ".");
      git("commit", "-qm", "initial");
      const base = git("rev-parse", "HEAD").trim();
      mkdirSync(dirname(join(root, newPath)), { recursive: true });
      git("mv", oldPath, newPath);
      const untracked = "packages/new-surface/src/hidden.ts";
      write(untracked);
      expect(readChangedFiles(root)).toEqual(
        expect.arrayContaining([oldPath, newPath, untracked])
      );
      git("commit", "-qm", "rename");
      const unicode = "packages/agents/src/café.ts";
      write(unicode);
      git("add", unicode);
      git("commit", "-qm", "unicode");
      expect(readChangedFiles(root, base)).toEqual(
        expect.arrayContaining([oldPath, newPath, untracked, unicode])
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
