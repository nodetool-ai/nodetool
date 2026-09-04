/**
 * Unit tests for the pure helpers behind `nodetool harness gate`
 * (packages/cli/src/harness/changed-files.ts): changed-file collection from
 * git command output, and the code-file predicate `--strict` uses to fail on
 * an unmapped surface.
 */
import { describe, it, expect } from "vitest";
import {
  collectChangedFiles,
  isGateRelevantCodeFile,
  parsePorcelainLine,
  parsePorcelainStatus
} from "../src/harness/changed-files.js";

describe("parsePorcelainLine", () => {
  it("parses an ordinary modified line", () => {
    expect(parsePorcelainLine(" M packages/cli/src/commands/harness.ts")).toBe(
      "packages/cli/src/commands/harness.ts"
    );
  });

  it("parses an untracked line", () => {
    expect(parsePorcelainLine("?? packages/cli/src/new-file.ts")).toBe(
      "packages/cli/src/new-file.ts"
    );
  });

  it("resolves a staged+unmodified rename to the NEW path", () => {
    expect(parsePorcelainLine("R  old.ts -> new.ts")).toBe("new.ts");
  });

  it("resolves a rename with a modified working copy to the NEW path", () => {
    expect(parsePorcelainLine("RM old.ts -> new.ts")).toBe("new.ts");
  });

  it("resolves a copy to the NEW path", () => {
    expect(parsePorcelainLine("C  a.ts -> b.ts")).toBe("b.ts");
  });

  it("resolves a rename under a directory to the NEW path", () => {
    expect(
      parsePorcelainLine(
        "R  packages/cli/src/old-dir/foo.ts -> packages/cli/src/new-dir/foo.ts"
      )
    ).toBe("packages/cli/src/new-dir/foo.ts");
  });

  it("still reports a staged delete (status 'D ')", () => {
    expect(parsePorcelainLine("D  packages/cli/src/deleted.ts")).toBe(
      "packages/cli/src/deleted.ts"
    );
  });

  it("still reports an unstaged delete (status ' D')", () => {
    expect(parsePorcelainLine(" D packages/cli/src/deleted.ts")).toBe(
      "packages/cli/src/deleted.ts"
    );
  });

  it("returns null for a blank line", () => {
    expect(parsePorcelainLine("")).toBeNull();
  });

  it("returns null for a line with no path", () => {
    expect(parsePorcelainLine(" M ")).toBeNull();
  });
});

describe("parsePorcelainStatus", () => {
  it("parses a multi-line status block, dropping blanks", () => {
    const status = [
      " M packages/cli/src/commands/harness.ts",
      "R  packages/cli/src/old.ts -> packages/cli/src/new.ts",
      "D  packages/cli/src/gone.ts",
      "?? packages/cli/src/added.ts",
      ""
    ].join("\n");
    expect(parsePorcelainStatus(status)).toEqual([
      "packages/cli/src/commands/harness.ts",
      "packages/cli/src/new.ts",
      "packages/cli/src/gone.ts",
      "packages/cli/src/added.ts"
    ]);
  });
});

describe("collectChangedFiles", () => {
  it("without --base, reads only the working tree (git status)", () => {
    const statusOutput = [
      " M packages/cli/src/a.ts",
      "?? packages/cli/src/b.ts"
    ].join("\n");
    expect(collectChangedFiles({ statusOutput })).toEqual([
      "packages/cli/src/a.ts",
      "packages/cli/src/b.ts"
    ]);
  });

  it("with --base, merges the base diff and the working tree, deduped", () => {
    const diffOutput = [
      "packages/cli/src/a.ts",
      "packages/cli/src/shared.ts"
    ].join("\n");
    const statusOutput = [
      " M packages/cli/src/shared.ts", // already in the diff — deduped
      "?? packages/cli/src/uncommitted.ts" // only in the working tree
    ].join("\n");
    expect(
      collectChangedFiles({ base: "origin/main", diffOutput, statusOutput })
    ).toEqual([
      "packages/cli/src/a.ts",
      "packages/cli/src/shared.ts",
      "packages/cli/src/uncommitted.ts"
    ]);
  });

  it("with --base, still surfaces working-tree-only files not in the diff", () => {
    const diffOutput = "";
    const statusOutput = " M packages/cli/src/only-uncommitted.ts";
    expect(
      collectChangedFiles({ base: "origin/main", diffOutput, statusOutput })
    ).toEqual(["packages/cli/src/only-uncommitted.ts"]);
  });

  it("with --base, still resolves renames from the working tree to the NEW path", () => {
    const diffOutput = "";
    const statusOutput = "R  packages/cli/src/old.ts -> packages/cli/src/new.ts";
    expect(
      collectChangedFiles({ base: "origin/main", diffOutput, statusOutput })
    ).toEqual(["packages/cli/src/new.ts"]);
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
    expect(isGateRelevantCodeFile("packages/cli/tests/harness.ts")).toBe(
      false
    );
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
