import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ReadFileTool } from "../src/tools/filesystem-tools.js";
import { WriteFileTool } from "../src/tools/filesystem-tools.js";
import { ListDirectoryTool } from "../src/tools/filesystem-tools.js";
import {
  registerTool,
  resolveTool,
  listTools,
  getAllTools
} from "../src/tools/tool-registry.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter,
  type StorageListResult,
  type StorageStat
} from "@nodetool-ai/storage";

let tempDir: string;

function makeMockContext(workspaceDir: string): ProcessingContext {
  // The new file-tool surface routes everything through context.workspaceStorage.
  // Tests use a real FileStorageAdapter rooted at the tmpdir so files
  // written via fs.writeFileSync (test setup) round-trip through the same
  // root storage adapter sees.
  const workspaceStorage = new FileStorageAdapter(workspaceDir);
  const variables = new Map<string, unknown>();
  return {
    workspaceStorage,
    // get/set back the read-before-write tracker used by WriteFileTool.
    get<T>(key: string): T | undefined {
      return variables.get(key) as T | undefined;
    },
    set(key: string, value: unknown): void {
      variables.set(key, value);
    },
    // Some tests still call resolveWorkspacePath for path-traversal probes;
    // keep the legacy resolver for those (it's only consulted by the test).
    resolveWorkspacePath(path: string): string {
      return join(workspaceDir, path);
    }
  } as unknown as ProcessingContext;
}

let mockContext: ProcessingContext;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "fs-tools-test-"));
  mockContext = makeMockContext(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});


// ---------------------------------------------------------------------------
// ReadFileTool
// ---------------------------------------------------------------------------

describe("ReadFileTool", () => {
  const tool = new ReadFileTool();

  it("declares the read_file name and required field", () => {
    expect(tool.name).toBe("read_file");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("read_file");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toEqual(["file_path"]);
  });

  it("returns line-numbered text on success", async () => {
    writeFileSync(
      join(tempDir, "lines.txt"),
      "alpha\nbeta\ngamma",
      "utf-8"
    );

    const result = (await tool.process(mockContext, {
      file_path: "lines.txt"
    })) as string;

    expect(typeof result).toBe("string");
    expect(result).toContain("\talpha");
    expect(result).toContain("\tbeta");
    expect(result).toContain("\tgamma");
    // Numbering is right-aligned with tab separator (cat -n style)
    expect(result.split("\n")[0]).toMatch(/^\s*1\t/);
  });

  it("respects offset and limit", async () => {
    writeFileSync(
      join(tempDir, "many.txt"),
      "one\ntwo\nthree\nfour\nfive",
      "utf-8"
    );

    const result = (await tool.process(mockContext, {
      file_path: "many.txt",
      offset: 2,
      limit: 2
    })) as string;

    expect(result).toContain("two");
    expect(result).toContain("three");
    expect(result).not.toContain("one");
    expect(result).not.toContain("four");
    // Continuation hint when the window doesn't reach EOF
    expect(result).toMatch(/showing lines 2-3 of 5/);
  });

  it("returns an error string when path is not a string", async () => {
    const result = await tool.process(mockContext, { file_path: 123 });
    expect(result).toBe("Error: file_path must be a string");
  });

  it("returns an error string for a missing file", async () => {
    const result = (await tool.process(mockContext, {
      file_path: "nope.txt"
    })) as string;
    expect(result).toMatch(/^Error: nope\.txt does not exist/);
  });

  it("returns an error string for binary files", async () => {
    writeFileSync(
      join(tempDir, "blob.bin"),
      Buffer.from([0x00, 0x01, 0x02, 0x03])
    );
    const result = (await tool.process(mockContext, {
      file_path: "blob.bin"
    })) as string;
    expect(result).toMatch(/^Error:.*binary/);
  });

  it("returns an error when offset is beyond EOF", async () => {
    writeFileSync(join(tempDir, "short.txt"), "a\nb", "utf-8");
    const result = (await tool.process(mockContext, {
      file_path: "short.txt",
      offset: 99
    })) as string;
    expect(result).toMatch(/^Error: offset 99 is beyond end of file/);
  });

  it("rejects path traversal outside the workspace", async () => {
    const result = (await tool.process(mockContext, {
      file_path: "../escape.txt"
    })) as string;
    expect(result).toMatch(/^Error: Path .* is outside the workspace/);
  });

  it("userMessage uses file_path", () => {
    expect(tool.userMessage({ file_path: "src/foo.ts" })).toBe(
      "Reading src/foo.ts"
    );
  });
});

// ---------------------------------------------------------------------------
// WriteFileTool
// ---------------------------------------------------------------------------

describe("WriteFileTool", () => {
  const readTool = new ReadFileTool();
  const writeTool = new WriteFileTool();

  it("declares the write_file name and required fields", () => {
    expect(writeTool.name).toBe("write_file");
    const pt = writeTool.toProviderTool();
    expect((pt.inputSchema as any).required).toEqual(["file_path", "content"]);
  });

  it("creates a new file and returns a short confirmation", async () => {
    const result = (await writeTool.process(mockContext, {
      file_path: "new.txt",
      content: "hello"
    })) as string;

    expect(result).toBe("Created new.txt");
    expect(readFileSync(join(tempDir, "new.txt"), "utf-8")).toBe("hello");
  });

  it("refuses to overwrite a file that hasn't been read in this session", async () => {
    writeFileSync(join(tempDir, "existing.txt"), "old", "utf-8");
    const result = (await writeTool.process(mockContext, {
      file_path: "existing.txt",
      content: "new"
    })) as string;
    expect(result).toMatch(/Error:.*has not been read/);
    expect(readFileSync(join(tempDir, "existing.txt"), "utf-8")).toBe("old");
  });

  it("overwrites after a prior read in the same context", async () => {
    writeFileSync(join(tempDir, "existing.txt"), "old", "utf-8");
    await readTool.process(mockContext, { file_path: "existing.txt" });
    const result = (await writeTool.process(mockContext, {
      file_path: "existing.txt",
      content: "new"
    })) as string;
    expect(result).toBe("Updated existing.txt");
    expect(readFileSync(join(tempDir, "existing.txt"), "utf-8")).toBe("new");
  });

  it("allows successive writes without re-reading (write counts as read)", async () => {
    await writeTool.process(mockContext, {
      file_path: "a.txt",
      content: "v1"
    });
    const second = (await writeTool.process(mockContext, {
      file_path: "a.txt",
      content: "v2"
    })) as string;
    expect(second).toBe("Updated a.txt");
  });

  it("returns an error when file_path is not a string", async () => {
    const result = await writeTool.process(mockContext, {
      file_path: 1,
      content: ""
    });
    expect(result).toBe("Error: file_path must be a string");
  });

  it("returns an error when content is not a string", async () => {
    const result = await writeTool.process(mockContext, {
      file_path: "x.txt",
      content: 1
    });
    expect(result).toBe("Error: content must be a string");
  });

  it("rejects path traversal outside the workspace", async () => {
    const result = (await writeTool.process(mockContext, {
      file_path: "../escape.txt",
      content: "boom"
    })) as string;
    expect(result).toMatch(/^Error: Path .* is outside the workspace/);
  });

  it("userMessage uses file_path", () => {
    expect(writeTool.userMessage({ file_path: "x.txt" })).toBe("Writing x.txt");
  });
});

// ---------------------------------------------------------------------------
// ListDirectoryTool
// ---------------------------------------------------------------------------

describe("ListDirectoryTool", () => {
  const tool = new ListDirectoryTool();

  it("declares the list_directory name and required field", () => {
    expect(tool.name).toBe("list_directory");
    const pt = tool.toProviderTool();
    expect((pt.inputSchema as any).required).toEqual(["path"]);
  });

  it("lists files and dirs as text, dirs trailing with /", async () => {
    writeFileSync(join(tempDir, "a.txt"), "x", "utf-8");
    writeFileSync(join(tempDir, "b.txt"), "yy", "utf-8");
    mkdirSync(join(tempDir, "sub"));
    writeFileSync(join(tempDir, "sub/c.txt"), "z", "utf-8");

    const result = (await tool.process(mockContext, { path: "." })) as string;
    expect(typeof result).toBe("string");
    expect(result).toContain("sub/");
    expect(result).toContain("a.txt");
    expect(result).toContain("b.txt");
    // Files include size in bytes after a tab.
    expect(result).toMatch(/a\.txt\t1 bytes/);
    expect(result).toMatch(/b\.txt\t2 bytes/);
  });

  it("returns an error when path is not a string", async () => {
    const result = await tool.process(mockContext, { path: 5 });
    expect(result).toBe("Error: path must be a string");
  });

  it("returns an error for a non-existent directory", async () => {
    const result = (await tool.process(mockContext, {
      path: "nope"
    })) as string;
    expect(result).toMatch(/^Error: 'nope' not found/);
  });

  it("rejects path traversal outside the workspace", async () => {
    const result = (await tool.process(mockContext, {
      path: "../escape"
    })) as string;
    expect(result).toMatch(/^Error: Path .* is outside the workspace/);
  });

  it("lists recursively", async () => {
    mkdirSync(join(tempDir, "a"));
    mkdirSync(join(tempDir, "a/b"));
    writeFileSync(join(tempDir, "a/x.txt"), "1", "utf-8");
    writeFileSync(join(tempDir, "a/b/y.txt"), "22", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "a",
      recursive: true
    })) as string;
    expect(result).toContain("x.txt");
    expect(result).toContain("y.txt");
  });

  it("reports an empty directory cleanly", async () => {
    mkdirSync(join(tempDir, "empty"));
    const result = (await tool.process(mockContext, {
      path: "empty"
    })) as string;
    expect(result).toMatch(/^\(empty\)/);
  });

  it("userMessage uses path", () => {
    expect(tool.userMessage({ path: "src" })).toBe("Listing src");
  });
});

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

describe("ToolRegistry", () => {
  it("registers and resolves tools", () => {
    const tool = new ReadFileTool();
    registerTool(tool);
    expect(resolveTool("read_file")).toBe(tool);
  });

  it("returns null for unknown tool", () => {
    expect(resolveTool("nonexistent_tool_xyz")).toBeNull();
  });

  it("lists registered tool names", () => {
    const tool = new WriteFileTool();
    registerTool(tool);
    const names = listTools();
    expect(names).toContain("write_file");
  });

  it("gets all tools", () => {
    const tool = new ListDirectoryTool();
    registerTool(tool);
    const all = getAllTools();
    expect(all.length).toBeGreaterThan(0);
    const names = all.map((t) => t.name);
    expect(names).toContain("list_directory");
  });
});
