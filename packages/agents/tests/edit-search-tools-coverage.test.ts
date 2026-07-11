/**
 * Coverage tests for edit-search-tools: EditFileTool, GlobTool, GrepTool.
 *
 * Exercises validation branches (malformed args), error paths (path
 * resolution failure, not-found, write failure), no-match cases, and the
 * glob/grep matching branches (braces, ?, include filter, binary skip,
 * context lines, truncation, case-insensitivity).
 *
 * Uses a real temp workspace like the sibling edit-search-tools.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import {
  EditFileTool,
  GlobTool,
  GrepTool
} from "../src/tools/edit-search-tools.js";

let workspace: string;

function ctxFor(dir: string) {
  return {
    resolveWorkspacePath: (p: string) => (isAbsolute(p) ? p : join(dir, p))
  } as any;
}

/** A context whose path resolution always throws — simulates escape attempts. */
function throwingCtx(message = "path escapes workspace") {
  return {
    resolveWorkspacePath: () => {
      throw new Error(message);
    }
  } as any;
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "cc-cov-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("EditFileTool — validation and error paths", () => {
  const tool = new EditFileTool();

  it("rejects a non-string path", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      path: 123,
      old_string: "a",
      new_string: "b"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path must be a string/);
  });

  it("rejects a non-string old_string", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: 5,
      new_string: "b"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/old_string must be a string/);
  });

  it("rejects a non-string new_string", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "a",
      new_string: null
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/new_string must be a string/);
  });

  it("rejects when old_string equals new_string", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "same",
      new_string: "same"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/must be different/);
  });

  it("returns the error when path resolution throws", async () => {
    const res: any = await tool.process(throwingCtx("bad path"), {
      path: "../escape",
      old_string: "a",
      new_string: "b"
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("bad path");
  });

  it("returns File not found for a non-empty old_string on a missing file", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      path: "missing.txt",
      old_string: "x",
      new_string: "y"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/File not found: missing\.txt/);
  });

  it("reports when old_string is not present in the file", async () => {
    await writeFile(join(workspace, "f.txt"), "hello world");
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "absent",
      new_string: "z"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/old_string not found/);
  });

  it("refuses ambiguous edits with match_count when replace_all is false", async () => {
    await writeFile(join(workspace, "f.txt"), "x x x");
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "x",
      new_string: "y"
    });
    expect(res.success).toBe(false);
    expect(res.match_count).toBe(3);
    expect(res.error).toMatch(/matches 3 locations/);
  });

  it("replaces all occurrences when replace_all is true", async () => {
    await writeFile(join(workspace, "f.txt"), "x x x");
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "x",
      new_string: "y",
      replace_all: true
    });
    expect(res.success).toBe(true);
    expect(res.replacements).toBe(3);
    expect(await readFile(join(workspace, "f.txt"), "utf-8")).toBe("y y y");
  });

  it("reports failure when creating a file at an invalid path", async () => {
    // A path whose parent directory does not exist → writeFile rejects.
    const res: any = await tool.process(ctxFor(workspace), {
      path: "no/such/dir/file.txt",
      old_string: "",
      new_string: "content"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Failed to create file/);
  });

  it("reports failure when editing but writing back fails", async () => {
    // Create a subdir, then target the directory itself as a file: readFile of
    // a directory rejects, hitting the outer catch.
    await mkdir(join(workspace, "adir"));
    const res: any = await tool.process(ctxFor(workspace), {
      path: "adir",
      old_string: "x",
      new_string: "y"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Failed to edit file/);
  });

  it("only replaces the first occurrence when replace_all is false and unique context differs", async () => {
    await writeFile(join(workspace, "f.txt"), "alpha beta alpha");
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "alpha beta",
      new_string: "X"
    });
    expect(res.success).toBe(true);
    expect(res.replacements).toBe(1);
    expect(await readFile(join(workspace, "f.txt"), "utf-8")).toBe("X alpha");
  });

  it("userMessage names the path", () => {
    expect(tool.userMessage({ path: "some/file.ts" })).toMatch("some/file.ts");
    expect(tool.userMessage({})).toBe("Editing file ");
  });
});

describe("GlobTool", () => {
  const tool = new GlobTool();

  it("rejects a non-string pattern", async () => {
    const res: any = await tool.process(ctxFor(workspace), { pattern: 42 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/pattern must be a string/);
  });

  it("returns the error when path resolution throws", async () => {
    const res: any = await tool.process(throwingCtx("nope"), {
      pattern: "*.ts",
      path: "../x"
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("nope");
  });

  it("matches brace-expansion patterns", async () => {
    await writeFile(join(workspace, "a.ts"), "1");
    await writeFile(join(workspace, "b.tsx"), "2");
    await writeFile(join(workspace, "c.js"), "3");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "*.{ts,tsx}"
    });
    expect(res.success).toBe(true);
    expect(res.files.sort()).toEqual(["a.ts", "b.tsx"]);
  });

  it("matches a single '?' wildcard", async () => {
    await writeFile(join(workspace, "a.ts"), "1");
    await writeFile(join(workspace, "ab.ts"), "2");
    const res: any = await tool.process(ctxFor(workspace), { pattern: "?.ts" });
    expect(res.success).toBe(true);
    expect(res.files).toEqual(["a.ts"]);
  });

  it("returns an empty result when nothing matches", async () => {
    await writeFile(join(workspace, "a.txt"), "1");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "**/*.nomatch"
    });
    expect(res.success).toBe(true);
    expect(res.files).toEqual([]);
    expect(res.match_count).toBe(0);
  });

  it("skips node_modules and hidden dirs", async () => {
    await mkdir(join(workspace, "node_modules"), { recursive: true });
    await writeFile(join(workspace, "node_modules", "dep.ts"), "x");
    await mkdir(join(workspace, ".hidden"), { recursive: true });
    await writeFile(join(workspace, ".hidden", "h.ts"), "x");
    await writeFile(join(workspace, "top.ts"), "x");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "**/*.ts"
    });
    expect(res.success).toBe(true);
    expect(res.files).toEqual(["top.ts"]);
  });

  it("truncates results at the 100-file limit", async () => {
    await mkdir(join(workspace, "many"), { recursive: true });
    for (let i = 0; i < 120; i++) {
      await writeFile(join(workspace, "many", `f${i}.ts`), "x");
    }
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "**/*.ts"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(120);
    expect(res.truncated).toBe(true);
    expect(res.files.length).toBe(100);
  });

  it("treats an unclosed brace literally", async () => {
    await writeFile(join(workspace, "a{b.ts"), "x");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "a{b.ts"
    });
    expect(res.success).toBe(true);
    expect(res.files).toEqual(["a{b.ts"]);
  });

  it("userMessage names the pattern", () => {
    expect(tool.userMessage({ pattern: "**/*.ts" })).toMatch("**/*.ts");
    expect(tool.userMessage({})).toBe("Searching for files: ");
  });
});

describe("GrepTool", () => {
  const tool = new GrepTool();

  it("rejects a non-string pattern", async () => {
    const res: any = await tool.process(ctxFor(workspace), { pattern: 1 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/pattern must be a string/);
  });

  it("returns the error when path resolution throws", async () => {
    const res: any = await tool.process(throwingCtx("escape"), {
      pattern: "x",
      path: "../y"
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe("escape");
  });

  it("reports an invalid regex", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "([unclosed"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid regex/);
  });

  it("returns Path not found for a missing directory", async () => {
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "x",
      path: "does-not-exist"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Path not found/);
  });

  it("searches a single file when path is a file", async () => {
    await writeFile(join(workspace, "f.txt"), "one\ntwo\nthree\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "two",
      path: "f.txt"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(1);
    expect(res.matches[0].line).toBe(2);
    expect(res.matches[0].content).toBe("two");
    expect(res.matches[0].file).toBe("");
  });

  it("returns no matches when the pattern is absent", async () => {
    await writeFile(join(workspace, "f.txt"), "alpha\nbeta\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "gamma",
      path: "f.txt"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(0);
    expect(res.matches).toEqual([]);
  });

  it("searches a directory recursively", async () => {
    await mkdir(join(workspace, "sub"), { recursive: true });
    await writeFile(join(workspace, "a.ts"), "needle here\n");
    await writeFile(join(workspace, "sub", "b.ts"), "no match\nneedle again\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "needle"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(2);
    const files = res.matches.map((m: any) => m.file).sort();
    expect(files).toEqual(["a.ts", "sub/b.ts"]);
  });

  it("applies the include filter", async () => {
    await writeFile(join(workspace, "a.ts"), "target\n");
    await writeFile(join(workspace, "b.js"), "target\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "target",
      include: "*.ts"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(1);
    expect(res.matches[0].file).toBe("a.ts");
  });

  it("does case-insensitive search when requested", async () => {
    await writeFile(join(workspace, "f.txt"), "Hello WORLD\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "world",
      path: "f.txt",
      case_insensitive: true
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(1);
  });

  it("is case-sensitive by default", async () => {
    await writeFile(join(workspace, "f.txt"), "Hello WORLD\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "world",
      path: "f.txt"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(0);
  });

  it("includes context lines around a match", async () => {
    await writeFile(join(workspace, "f.txt"), "l1\nl2\nHIT\nl4\nl5\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "HIT",
      path: "f.txt",
      context: 1
    });
    expect(res.success).toBe(true);
    expect(res.matches[0].context_before).toEqual(["l2"]);
    expect(res.matches[0].context_after).toEqual(["l4"]);
  });

  it("omits context arrays at file boundaries", async () => {
    await writeFile(join(workspace, "f.txt"), "HIT\nrest");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "HIT",
      path: "f.txt",
      context: 2
    });
    expect(res.success).toBe(true);
    // First line: no lines before it → no context_before.
    expect(res.matches[0].context_before).toBeUndefined();
    expect(res.matches[0].context_after).toEqual(["rest"]);
  });

  it("truncates at max_results and flags truncated", async () => {
    await writeFile(join(workspace, "f.txt"), "m\nm\nm\nm\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "m",
      path: "f.txt",
      max_results: 2
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(2);
    expect(res.truncated).toBe(true);
  });

  it("skips binary files by extension", async () => {
    await writeFile(join(workspace, "img.png"), "match inside png\n");
    await writeFile(join(workspace, "code.ts"), "match inside ts\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "match"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(1);
    expect(res.matches[0].file).toBe("code.ts");
  });

  it("skips files containing a null byte in the first 512 bytes", async () => {
    await writeFile(
      join(workspace, "bin.dat"),
      Buffer.from([0x6d, 0x00, 0x6d, 0x0a])
    );
    await writeFile(join(workspace, "text.dat"), "m\n");
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "m"
    });
    expect(res.success).toBe(true);
    // Only the text file matches; the null-byte file is skipped.
    expect(res.matches.map((m: any) => m.file)).toEqual(["text.dat"]);
  });

  it("userMessage names the pattern", () => {
    expect(tool.userMessage({ pattern: "foo" })).toMatch("foo");
    expect(tool.userMessage({})).toBe("Searching for: ");
  });
});
