/**
 * Tests for the Edit and Glob tools, focusing on file creation via empty
 * old_string, trailing-newline consumption on deletion, and modification-time
 * glob sorting.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  utimes,
  symlink
} from "node:fs/promises";
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

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "cc-tools-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("EditFileTool", () => {
  it("creates a new file when old_string is empty", async () => {
    const tool = new EditFileTool();
    const res: any = await tool.process(ctxFor(workspace), {
      path: "new.txt",
      old_string: "",
      new_string: "hello world\n"
    });
    expect(res.success).toBe(true);
    expect(res.created).toBe(true);
    expect(await readFile(join(workspace, "new.txt"), "utf-8")).toBe(
      "hello world\n"
    );
  });

  it("refuses to create when the file already exists", async () => {
    await writeFile(join(workspace, "exists.txt"), "old");
    const tool = new EditFileTool();
    const res: any = await tool.process(ctxFor(workspace), {
      path: "exists.txt",
      old_string: "",
      new_string: "new"
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already exists/);
  });

  it("consumes the trailing newline when deleting a line", async () => {
    await writeFile(join(workspace, "list.txt"), "a\nb\nc\n");
    const tool = new EditFileTool();
    const res: any = await tool.process(ctxFor(workspace), {
      path: "list.txt",
      old_string: "b",
      new_string: ""
    });
    expect(res.success).toBe(true);
    expect(await readFile(join(workspace, "list.txt"), "utf-8")).toBe("a\nc\n");
  });

  it("deletes all occurrences with replace_all even when only some have a trailing newline", async () => {
    // Regression: switching the whole search string to "foo\n" (because ONE
    // match had a newline) left the newline-less "foo" inside "foobar" intact
    // while still reporting 2 replacements.
    await writeFile(join(workspace, "d.txt"), "foo\nfoobar");
    const res: any = await new EditFileTool().process(ctxFor(workspace), {
      path: "d.txt",
      old_string: "foo",
      new_string: "",
      replace_all: true
    });
    expect(res.success).toBe(true);
    expect(await readFile(join(workspace, "d.txt"), "utf-8")).toBe("bar");
    expect(res.replacements).toBe(2);
  });

  it("replaces a unique substring in place", async () => {
    await writeFile(join(workspace, "f.txt"), "foo bar baz");
    const tool = new EditFileTool();
    const res: any = await tool.process(ctxFor(workspace), {
      path: "f.txt",
      old_string: "bar",
      new_string: "QUX"
    });
    expect(res.success).toBe(true);
    expect(await readFile(join(workspace, "f.txt"), "utf-8")).toBe("foo QUX baz");
  });
});

describe("GlobTool", () => {
  it("sorts matches by modification time, most recent last", async () => {
    await mkdir(join(workspace, "src"), { recursive: true });
    const older = join(workspace, "src", "old.ts");
    const newer = join(workspace, "src", "new.ts");
    await writeFile(older, "1");
    await writeFile(newer, "2");
    // Force deterministic mtimes: older < newer.
    await utimes(older, new Date(1000), new Date(1000));
    await utimes(newer, new Date(2000), new Date(2000));

    const tool = new GlobTool();
    const res: any = await tool.process(ctxFor(workspace), {
      pattern: "**/*.ts"
    });
    expect(res.success).toBe(true);
    expect(res.files).toEqual(["src/old.ts", "src/new.ts"]);
    expect(res.match_count).toBe(2);
    expect(res.truncated).toBe(false);
    expect(typeof res.duration_ms).toBe("number");
  });
});

describe("GrepTool", () => {
  it("finds matches in a normal workspace file", async () => {
    await writeFile(join(workspace, "a.txt"), "hello\nworld\nhello again\n");
    const res: any = await new GrepTool().process(ctxFor(workspace), {
      pattern: "hello"
    });
    expect(res.success).toBe(true);
    expect(res.match_count).toBe(2);
  });

  it("rejects a nested-quantifier pattern instead of hanging (ReDoS)", async () => {
    // Regression: "(a+)+$" against a modest run of 'a' triggers catastrophic
    // backtracking. The scan must refuse the pattern fast, never compile+run it.
    // Assembled at runtime so static analysis (CodeQL) doesn't flag this
    // deliberate evil-pattern FIXTURE as a real regex — GrepTool never runs it.
    const nestedQuantifier = ["(a+)", "+", "$"].join("");
    await writeFile(join(workspace, "victim.txt"), "a".repeat(50));
    const started = Date.now();
    const res: any = await new GrepTool().process(ctxFor(workspace), {
      pattern: nestedQuantifier
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/nested quantifier|backtracking/i);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("skips files larger than the size cap (OOM guard)", async () => {
    // 11 MB file containing the pattern — must be skipped, not buffered.
    const big = "needle\n".repeat(Math.ceil((11 * 1024 * 1024) / 7));
    await writeFile(join(workspace, "big.log"), big);
    await writeFile(join(workspace, "small.txt"), "needle here\n");
    const res: any = await new GrepTool().process(ctxFor(workspace), {
      pattern: "needle"
    });
    expect(res.success).toBe(true);
    // Only the small file's match is returned; the oversized file is skipped.
    expect(res.matches.every((m: any) => m.file !== "big.log")).toBe(true);
    expect(res.matches.some((m: any) => m.file === "small.txt")).toBe(true);
  });

  it("does not follow a symlink that escapes the workspace", async () => {
    // A secret file outside the workspace, symlinked in, must not be read.
    const outside = await mkdtemp(join(tmpdir(), "cc-secret-"));
    try {
      const secret = join(outside, "id_rsa");
      await writeFile(secret, "SUPER_SECRET_KEY_MATERIAL\n");
      await symlink(secret, join(workspace, "notes"));

      // Directory walk must not surface the symlink's target contents.
      const walk: any = await new GrepTool().process(ctxFor(workspace), {
        pattern: "SUPER_SECRET"
      });
      expect(walk.success).toBe(true);
      expect(walk.match_count).toBe(0);

      // Targeting the symlink directly must be refused as outside the workspace.
      const direct: any = await new GrepTool().process(ctxFor(workspace), {
        pattern: ".",
        path: "notes"
      });
      expect(direct.success).toBe(false);
      expect(String(direct.error)).toMatch(/outside the workspace/i);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects an overlapping-alternation pattern (ReDoS)", async () => {
    // "(a|a)*b" passes the nested-quantifier check but is catastrophic.
    // Assembled at runtime so static analysis doesn't flag this evil-pattern
    // FIXTURE as a real regex — GrepTool rejects it, never runs it.
    const overlappingAlternation = ["(a|a)", "*", "b"].join("");
    await writeFile(join(workspace, "victim.txt"), "a".repeat(50));
    const started = Date.now();
    const res: any = await new GrepTool().process(ctxFor(workspace), {
      pattern: overlappingAlternation
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/backtracking|overlapping|quantifier/i);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("EditFileTool symlink containment", () => {
  it("refuses to edit through a symlink that escapes the workspace", async () => {
    const outside = await mkdtemp(join(tmpdir(), "cc-secret-"));
    try {
      const secret = join(outside, "secret.txt");
      await writeFile(secret, "original secret\n");
      await symlink(secret, join(workspace, "link.txt"));

      const res: any = await new EditFileTool().process(ctxFor(workspace), {
        path: "link.txt",
        old_string: "original secret",
        new_string: "PWNED"
      });
      expect(res.success).toBe(false);
      expect(String(res.error)).toMatch(/outside the workspace/i);
      // The host file must be untouched.
      expect(await readFile(secret, "utf-8")).toBe("original secret\n");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses to create a file under a symlinked-out directory", async () => {
    const outside = await mkdtemp(join(tmpdir(), "cc-outdir-"));
    try {
      await symlink(outside, join(workspace, "outdir"));
      const res: any = await new EditFileTool().process(ctxFor(workspace), {
        path: "outdir/new.txt",
        old_string: "",
        new_string: "should not be written"
      });
      expect(res.success).toBe(false);
      expect(String(res.error)).toMatch(/outside the workspace/i);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses to create through a DANGLING symlink that escapes the workspace", async () => {
    // Regression: access() follows symlinks, so a dangling in-workspace symlink
    // (target outside the root, not yet created) looked absent and the create
    // was allowed, writing the file outside the workspace via the link.
    const outsideTarget = join(
      tmpdir(),
      `cc-nonexistent-${Date.now()}`,
      "evil.txt"
    );
    await symlink(outsideTarget, join(workspace, "link.txt"));
    const res: any = await new EditFileTool().process(ctxFor(workspace), {
      path: "link.txt",
      old_string: "",
      new_string: "should not escape"
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/outside the workspace/i);
  });
});

describe("GlobTool symlink containment", () => {
  it("refuses to list a symlinked search directory that escapes the workspace", async () => {
    const outside = await mkdtemp(join(tmpdir(), "cc-globout-"));
    try {
      await writeFile(join(outside, "leak.txt"), "x");
      await symlink(outside, join(workspace, "out"));
      const res: any = await new GlobTool().process(ctxFor(workspace), {
        pattern: "**/*",
        path: "out"
      });
      expect(res.success).toBe(false);
      expect(String(res.error)).toMatch(/outside the workspace/i);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
