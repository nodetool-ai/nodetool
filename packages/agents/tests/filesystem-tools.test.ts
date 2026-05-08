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
  return {
    workspaceStorage,
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

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("read_file");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("read_file");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toContain("path");
  });

  it("reads an existing file and returns its content with token info", async () => {
    writeFileSync(join(tempDir, "hello.txt"), "hello world", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "hello.txt"
    })) as any;
    expect(result.success).toBe(true);
    expect(result.content).toBe("hello world");
    expect(result.is_binary).toBe(false);
    expect(result.token_info).toBeDefined();
    expect(result.token_info.count).toBeGreaterThan(0);
    expect(result.token_info.model).toBe("gpt-4");
    expect(result.line_info).toBeDefined();
    expect(result.line_info.total_lines).toBe(1);
  });

  it("userMessage returns descriptive string", () => {
    const msg = tool.userMessage({ path: "/some/file.txt" });
    expect(msg).toContain("Reading content from /some/file.txt");
  });

  it("userMessage handles missing path", () => {
    const msg = tool.userMessage({});
    expect(msg).toContain("Reading content from");
  });

  it("reads a range of lines with start_line and end_line", async () => {
    writeFileSync(
      join(tempDir, "lines.txt"),
      "line1\nline2\nline3\nline4\nline5",
      "utf-8"
    );

    const result = (await tool.process(mockContext, {
      path: "lines.txt",
      start_line: 2,
      end_line: 4
    })) as any;
    expect(result.success).toBe(true);
    expect(result.content).toBe("line2\nline3\nline4");
    expect(result.line_info.start_line).toBe(2);
    expect(result.line_info.end_line).toBe(4);
    expect(result.line_info.total_lines).toBe(5);
  });

  it("reads from beginning to end_line when start_line not specified", async () => {
    writeFileSync(join(tempDir, "lines_end.txt"), "a\nb\nc\nd\ne", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "lines_end.txt",
      end_line: 3
    })) as any;
    expect(result.success).toBe(true);
    expect(result.content).toBe("a\nb\nc");
  });

  it("reads from start_line to end of file when end_line not specified", async () => {
    writeFileSync(join(tempDir, "lines2.txt"), "a\nb\nc\nd", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "lines2.txt",
      start_line: 3
    })) as any;
    expect(result.success).toBe(true);
    expect(result.content).toBe("c\nd");
  });

  it("returns error with suggested_ranges when token limit exceeded", async () => {
    // Each unique word is ~1 token. Generate 30k lines of unique words to exceed 25k token limit
    // while staying under the 100k char limit.
    const lines: string[] = [];
    for (let i = 0; i < 30000; i++) {
      lines.push(`word${i}`);
    }
    const bigContent = lines.join("\n");
    writeFileSync(join(tempDir, "big.txt"), bigContent, "utf-8");

    const result = (await tool.process(mockContext, {
      path: "big.txt"
    })) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Token count");
    expect(result.error).toContain("exceeds maximum");
    expect(result.suggested_ranges).toBeDefined();
    expect(result.suggested_ranges.length).toBeGreaterThan(0);
    expect(result.token_info).toBeDefined();
    expect(result.line_info).toBeDefined();
  });

  it("detects binary files", async () => {
    const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00]);
    writeFileSync(join(tempDir, "image.png"), binaryBuf);

    const result = (await tool.process(mockContext, {
      path: "image.png"
    })) as any;
    expect(result.success).toBe(false);
    expect(result.is_binary).toBe(true);
    expect(result.error).toContain("binary data");
  });

  it("returns error when path is not a string", async () => {
    const result = (await tool.process(mockContext, {
      path: 123
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(result.error).toBe("path must be a string");
  });

  it("returns error message for non-existent file", async () => {
    const result = (await tool.process(mockContext, {
      path: "does-not-exist.txt"
    })) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("returns error for invalid line range", async () => {
    writeFileSync(join(tempDir, "small.txt"), "a\nb\nc", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "small.txt",
      start_line: 10,
      end_line: 20
    })) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid line range");
    expect(result.suggested_ranges).toBeDefined();
  });

  it("prevents path traversal outside workspace", async () => {
    const result = (await tool.process(mockContext, {
      path: "../../etc/passwd"
    })) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the workspace");
  });
});

// ---------------------------------------------------------------------------
// WriteFileTool
// ---------------------------------------------------------------------------

describe("WriteFileTool", () => {
  const tool = new WriteFileTool();

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("write_file");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("write_file");
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toEqual(
      expect.arrayContaining(["path", "content"])
    );
  });

  it("writes content to a new file and reports created=true", async () => {
    const result = (await tool.process(mockContext, {
      path: "new-file.txt",
      content: "new content"
    })) as any;
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.append).toBe(false);
    expect(readFileSync(join(tempDir, "new-file.txt"), "utf-8")).toBe(
      "new content"
    );
  });

  it("overwrites existing file and reports created=false", async () => {
    writeFileSync(join(tempDir, "existing.txt"), "old", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "existing.txt",
      content: "updated"
    })) as any;
    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(readFileSync(join(tempDir, "existing.txt"), "utf-8")).toBe(
      "updated"
    );
  });

  it("appends content when append=true", async () => {
    writeFileSync(join(tempDir, "appendable.txt"), "hello", "utf-8");

    const result = (await tool.process(mockContext, {
      path: "appendable.txt",
      content: " world",
      append: true
    })) as any;
    expect(result.success).toBe(true);
    expect(result.append).toBe(true);
    expect(result.created).toBe(false);
    expect(readFileSync(join(tempDir, "appendable.txt"), "utf-8")).toBe(
      "hello world"
    );
  });

  it("creates file when appending to non-existent file", async () => {
    const result = (await tool.process(mockContext, {
      path: "new-append.txt",
      content: "first line",
      append: true
    })) as any;
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.append).toBe(true);
    expect(readFileSync(join(tempDir, "new-append.txt"), "utf-8")).toBe(
      "first line"
    );
  });

  it("userMessage reflects append mode", () => {
    expect(tool.userMessage({ path: "f.txt", append: true })).toContain(
      "Appending to"
    );
    expect(tool.userMessage({ path: "f.txt" })).toContain("Writing to");
  });

  it("returns error when path is not a string", async () => {
    const result = (await tool.process(mockContext, {
      path: 42,
      content: "test"
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(result.error).toBe("path must be a string");
  });

  it("returns error when content is not a string", async () => {
    const result = (await tool.process(mockContext, {
      path: "test.txt",
      content: 123
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(result.error).toBe("content must be a string");
  });

  it("creates parent directories if needed", async () => {
    const result = (await tool.process(mockContext, {
      path: "a/b/c/deep.txt",
      content: "deep file"
    })) as any;
    expect(result.success).toBe(true);
    expect(
      readFileSync(join(tempDir, "a", "b", "c", "deep.txt"), "utf-8")
    ).toBe("deep file");
  });

  it("prevents path traversal outside workspace", async () => {
    const result = (await tool.process(mockContext, {
      path: "../../etc/evil",
      content: "bad"
    })) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the workspace");
  });

  it("infers content type from the file extension instead of always writing text/plain", async () => {
    // Use InMemoryStorageAdapter — it's the only adapter that round-trips
    // contentType through stat(), so we can assert WriteFileTool isn't
    // hard-coding text/plain regardless of extension.
    const memStorage = new InMemoryStorageAdapter();
    const memCtx = {
      workspaceStorage: memStorage
    } as unknown as ProcessingContext;

    const cases: Array<{ path: string; expectedPrefix: string }> = [
      { path: "data.json", expectedPrefix: "application/json" },
      { path: "page.html", expectedPrefix: "text/html" },
      { path: "report.md", expectedPrefix: "text/markdown" },
      { path: "table.csv", expectedPrefix: "text/csv" },
      { path: "config.yaml", expectedPrefix: "application/yaml" },
      { path: "script.js", expectedPrefix: "application/javascript" },
      { path: "notes.txt", expectedPrefix: "text/plain" },
      { path: "no-extension", expectedPrefix: "text/plain" }
    ];

    for (const { path, expectedPrefix } of cases) {
      const result = (await tool.process(memCtx, {
        path,
        content: "x"
      })) as any;
      expect(result.success).toBe(true);
      const stat = await memStorage.stat(memStorage.uriForKey(path));
      expect(stat).not.toBeNull();
      expect(
        stat!.contentType,
        `path=${path}: expected contentType to start with ${expectedPrefix}, got ${stat!.contentType}`
      ).toMatch(new RegExp(`^${expectedPrefix}\\b`));
    }
  });
});

// ---------------------------------------------------------------------------
// ListDirectoryTool
// ---------------------------------------------------------------------------

describe("ListDirectoryTool", () => {
  const tool = new ListDirectoryTool();

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("list_directory");
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("list_directory");
    expect(pt.inputSchema).toBeDefined();
    expect((pt.inputSchema as any).required).toContain("path");
  });

  it("lists files in a directory", async () => {
    writeFileSync(join(tempDir, "a.txt"), "a", "utf-8");
    writeFileSync(join(tempDir, "b.txt"), "b", "utf-8");
    mkdirSync(join(tempDir, "subdir"));

    const result = (await tool.process(mockContext, {
      path: "."
    })) as { entries: Array<{ name: string; isDirectory: boolean }> };

    expect(result.entries).toBeDefined();
    const names = result.entries.map((e) => e.name).sort();
    expect(names).toEqual(["a.txt", "b.txt", "subdir"]);

    const subdir = result.entries.find((e) => e.name === "subdir");
    expect(subdir?.isDirectory).toBe(true);

    const file = result.entries.find((e) => e.name === "a.txt");
    expect(file?.isDirectory).toBe(false);
  });

  it("returns error when path is not a string", async () => {
    const result = (await tool.process(mockContext, {
      path: 42
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(result.error).toBe("path must be a string");
  });

  it("returns error for non-existent directory", async () => {
    const result = (await tool.process(mockContext, {
      path: "nope"
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });

  it("lists files recursively", async () => {
    mkdirSync(join(tempDir, "parent"));
    mkdirSync(join(tempDir, "parent", "child"));
    writeFileSync(join(tempDir, "parent", "p.txt"), "p", "utf-8");
    writeFileSync(join(tempDir, "parent", "child", "c.txt"), "c", "utf-8");

    const result = (await tool.process(mockContext, {
      path: ".",
      recursive: true
    })) as {
      entries: Array<{ name: string; isDirectory: boolean; size: number }>;
    };

    expect(result.entries).toBeDefined();
    const names = result.entries.map((e) => e.name);
    expect(names).toContain("parent");
    expect(names).toContain("parent/p.txt");
    expect(names).toContain("parent/child");
    expect(names).toContain("parent/child/c.txt");
  });

  it("userMessage returns descriptive string", () => {
    const msg = tool.userMessage({ path: "/some/dir" });
    expect(msg).toBe("Listing directory: /some/dir");
  });

  it("userMessage handles missing path", () => {
    const msg = tool.userMessage({});
    expect(msg).toBe("Listing directory: ");
  });

  it("skips broken symlinks (fs-safe rejects them at the storage layer)", async () => {
    // Storage-backed listing routes through `@openclaw/fs-safe`, which
    // rejects symlinks/hardlinks pointing outside the root. Broken links
    // simply don't appear in the listing — safer than the legacy behavior
    // (which returned them as size: 0 entries).
    const { symlinkSync, writeFileSync: wfs } = await import("node:fs");
    wfs(join(tempDir, "real.txt"), "real", "utf-8");
    symlinkSync(
      join(tempDir, "nonexistent-target"),
      join(tempDir, "broken-link")
    );

    const result = (await tool.process(mockContext, {
      path: "."
    })) as {
      entries: Array<{ name: string; size: number; isDirectory: boolean }>;
    };

    expect(result.entries).toBeDefined();
    expect(result.entries.find((e) => e.name === "real.txt")).toBeDefined();
  });

  it("prevents path traversal outside workspace", async () => {
    const result = (await tool.process(mockContext, {
      path: "../../"
    })) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the workspace");
  });

  it("returns success with empty entries for an existing-but-empty directory", async () => {
    // An LLM listing a freshly-created or just-emptied directory should not
    // get back a "not found" error — the directory exists, it's just empty.
    mkdirSync(join(tempDir, "empty-dir"));

    const result = (await tool.process(mockContext, {
      path: "empty-dir"
    })) as any;

    expect(result.entries).toBeDefined();
    expect(result.entries).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  it("does not mislabel non-traversal storage errors as 'outside the workspace'", async () => {
    // A storage backend can throw for many reasons (network, permissions,
    // backend bug). The list tool used to swallow ALL list() errors as
    // traversal — that's misleading. Real path-traversal rejections should
    // still surface as such, but unrelated errors should not be relabeled.
    class FailingListStorage implements StorageAdapter {
      async store(): Promise<string> {
        return "mock://x";
      }
      async retrieve(): Promise<Uint8Array | null> {
        return null;
      }
      async exists(): Promise<boolean> {
        return true;
      }
      uriForKey(key: string): string {
        return `mock://${key}`;
      }
      async list(): Promise<StorageListResult> {
        throw new Error("backend timeout");
      }
      async delete(): Promise<boolean> {
        return false;
      }
      async stat(): Promise<StorageStat | null> {
        return null;
      }
    }
    const failingCtx = {
      workspaceStorage: new FailingListStorage()
    } as unknown as ProcessingContext;

    const result = (await tool.process(failingCtx, {
      path: "some/dir"
    })) as any;

    expect(result.success).toBe(false);
    expect(result.error).not.toContain("outside the workspace");
    expect(result.error).toMatch(/backend timeout/);
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
