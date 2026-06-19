/**
 * Tests for the Edit and Glob tools, focusing on file creation via empty
 * old_string, trailing-newline consumption on deletion, and modification-time
 * glob sorting.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { EditFileTool, GlobTool } from "../src/tools/edit-search-tools.js";

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
