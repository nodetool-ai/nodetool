/**
 * Tests for WorkspaceReadTool, WorkspaceWriteTool, WorkspaceListTool.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  WorkspaceReadTool,
  WorkspaceWriteTool,
  WorkspaceListTool
} from "../../src/tools/workspace-tools.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const mockContext = {} as ProcessingContext;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-tools-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  WorkspaceWriteTool                                                */
/* ------------------------------------------------------------------ */

describe("WorkspaceWriteTool", () => {
  it("has correct name", () => {
    expect(new WorkspaceWriteTool(tmpDir).name).toBe("workspace_write");
  });

  it("has a description", () => {
    expect(new WorkspaceWriteTool(tmpDir).description).toBeTruthy();
  });

  it("writes a file inside the workspace", async () => {
    const tool = new WorkspaceWriteTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "hello.txt",
      content: "Hello, workspace!"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.path).toBe("hello.txt");

    const stored = await fs.readFile(path.join(tmpDir, "hello.txt"), "utf-8");
    expect(stored).toBe("Hello, workspace!");
  });

  it("creates intermediate directories", async () => {
    const tool = new WorkspaceWriteTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "sub/dir/file.txt",
      content: "nested"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const stored = await fs.readFile(
      path.join(tmpDir, "sub", "dir", "file.txt"),
      "utf-8"
    );
    expect(stored).toBe("nested");
  });

  it("returns error when path is not a string", async () => {
    const tool = new WorkspaceWriteTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: 42,
      content: "hi"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path/);
  });

  it("returns error when content is not a string", async () => {
    const tool = new WorkspaceWriteTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "file.txt",
      content: 99
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/content/);
  });

  it("rejects path traversal attempts", async () => {
    const tool = new WorkspaceWriteTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "../outside.txt",
      content: "evil"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/traversal/i);
  });

  it("toProviderTool returns correct shape", () => {
    const pt = new WorkspaceWriteTool(tmpDir).toProviderTool();
    expect(pt.name).toBe("workspace_write");
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  WorkspaceReadTool                                                 */
/* ------------------------------------------------------------------ */

describe("WorkspaceReadTool", () => {
  it("has correct name", () => {
    expect(new WorkspaceReadTool(tmpDir).name).toBe("workspace_read");
  });

  it("reads a file that exists in the workspace", async () => {
    await fs.writeFile(path.join(tmpDir, "notes.txt"), "important notes");

    const tool = new WorkspaceReadTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "notes.txt"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.content).toBe("important notes");
    expect(result.path).toBe("notes.txt");
  });

  it("returns error for a missing file", async () => {
    const tool = new WorkspaceReadTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "nonexistent.txt"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns error when path is not a string", async () => {
    const tool = new WorkspaceReadTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: 123
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path/);
  });

  it("rejects path traversal attempts", async () => {
    const tool = new WorkspaceReadTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "../../etc/passwd"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/traversal/i);
  });

  it("toProviderTool returns correct shape", () => {
    const pt = new WorkspaceReadTool(tmpDir).toProviderTool();
    expect(pt.name).toBe("workspace_read");
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  WorkspaceListTool                                                 */
/* ------------------------------------------------------------------ */

describe("WorkspaceListTool", () => {
  it("has correct name", () => {
    expect(new WorkspaceListTool(tmpDir).name).toBe("workspace_list");
  });

  it("lists files in the workspace root", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "aaa");
    await fs.writeFile(path.join(tmpDir, "b.txt"), "bbb");
    await fs.mkdir(path.join(tmpDir, "subdir"));

    const tool = new WorkspaceListTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "."
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const entries = result.entries as Array<{
      name: string;
      size: number;
      is_dir: boolean;
    }>;
    const names = entries.map((e) => e.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.txt");
    expect(names).toContain("subdir");
  });

  it("marks directories correctly", async () => {
    await fs.mkdir(path.join(tmpDir, "mydir"));
    await fs.writeFile(path.join(tmpDir, "file.txt"), "x");

    const tool = new WorkspaceListTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "."
    })) as Record<string, unknown>;

    const entries = result.entries as Array<{
      name: string;
      size: number;
      is_dir: boolean;
    }>;
    const dir = entries.find((e) => e.name === "mydir");
    const file = entries.find((e) => e.name === "file.txt");
    expect(dir?.is_dir).toBe(true);
    expect(file?.is_dir).toBe(false);
  });

  it("returns error for a non-existent directory", async () => {
    const tool = new WorkspaceListTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "missing_dir"
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns error when path is not a string", async () => {
    const tool = new WorkspaceListTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: 0
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/path/);
  });

  it("rejects path traversal attempts", async () => {
    const tool = new WorkspaceListTool(tmpDir);
    const result = (await tool.process(mockContext, {
      path: "../.."
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/traversal/i);
  });

  it("toProviderTool returns correct shape", () => {
    const pt = new WorkspaceListTool(tmpDir).toProviderTool();
    expect(pt.name).toBe("workspace_list");
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Round-trip: write then read                                       */
/* ------------------------------------------------------------------ */

describe("WorkspaceWriteTool + WorkspaceReadTool round-trip", () => {
  it("writes and reads back the same content", async () => {
    const write = new WorkspaceWriteTool(tmpDir);
    const read = new WorkspaceReadTool(tmpDir);

    const written = (await write.process(mockContext, {
      path: "round-trip.txt",
      content: "round-trip value 42"
    })) as Record<string, unknown>;

    expect(written.success).toBe(true);

    const loaded = (await read.process(mockContext, {
      path: "round-trip.txt"
    })) as Record<string, unknown>;

    expect(loaded.success).toBe(true);
    expect(loaded.content).toBe("round-trip value 42");
  });
});
