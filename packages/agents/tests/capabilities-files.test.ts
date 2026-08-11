/**
 * The `files` capability module: the seven workspace capabilities that used to
 * be seven `Tool` subclasses.
 *
 * Three things are checked. The registry stays drift-free with the module in
 * it. Every spec's category equals what the classification map says for that
 * wire name, and every spec still matches the deprecated class that now wraps
 * it — a port that changed a name, a description, or a schema would be a
 * behavior change nobody asked for. And each capability is driven end to end
 * through `run.invoke` against a real temp workspace, so the implementation is
 * exercised on the path PR 10 makes the only one.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import {
  FILE_CAPABILITIES,
  _resetTodoStoreForTests,
  getThreadTodos
} from "../src/capabilities/files.js";
import {
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { Tool } from "../src/tools/base-tool.js";
import {
  ListDirectoryTool,
  ReadFileTool,
  WriteFileTool
} from "../src/tools/filesystem-tools.js";
import {
  EditFileTool,
  GlobTool,
  GrepTool
} from "../src/tools/edit-search-tools.js";
import { TodoWriteTool } from "../src/tools/todo-tools.js";

let workspace: string;
let posted: unknown[];

/**
 * One context serving both halves of the module: `workspaceStorage` for the
 * storage-backed file tools, `resolveWorkspacePath` for the path-backed edit
 * and search tools, over the same temp directory.
 */
function contextFor(dir: string): ProcessingContext {
  const variables = new Map<string, unknown>();
  return {
    workspaceStorage: new FileStorageAdapter(dir),
    threadId: "thread-files",
    workflowId: null,
    get<T>(key: string): T | undefined {
      return variables.get(key) as T | undefined;
    },
    set(key: string, value: unknown): void {
      variables.set(key, value);
    },
    resolveWorkspacePath(path: string): string {
      return isAbsolute(path) ? path : join(dir, path);
    },
    postMessage(msg: unknown): void {
      posted.push(msg);
    }
  } as unknown as ProcessingContext;
}

function runFor(dir: string): CapabilityRun {
  return createCapabilityRun({ context: contextFor(dir), gate: UNGATED });
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "capabilities-files-"));
  posted = [];
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
  _resetTodoStoreForTests();
});

describe("the files capability module", () => {
  it("registers without drift and exports the seven wire names", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const mod = await loadCapabilityModule("files");
    expect(mod.exports.map((e) => e.spec.name)).toEqual([
      "read_file",
      "write_file",
      "list_directory",
      "edit_file",
      "glob",
      "grep",
      "todo_write"
    ]);
  });

  it("classes every capability exactly as the permission map does", () => {
    for (const entry of FILE_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("leaves the deprecated classes with the surface they had", () => {
    const classes: Record<string, Tool> = {
      read_file: new ReadFileTool(),
      write_file: new WriteFileTool(),
      list_directory: new ListDirectoryTool(),
      edit_file: new EditFileTool(),
      glob: new GlobTool(),
      grep: new GrepTool(),
      todo_write: new TodoWriteTool()
    };
    for (const entry of FILE_CAPABILITIES) {
      const tool = classes[entry.spec.name];
      expect(tool).toBeDefined();
      expect(tool.name).toBe(entry.spec.name);
      expect(tool.description).toBe(entry.spec.description);
      expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
    }
  });

  it("renders the message templates the classes rendered", () => {
    expect(new ReadFileTool().userMessage({ file_path: "a.txt" })).toBe(
      "Reading a.txt"
    );
    expect(new WriteFileTool().userMessage({ file_path: "a.txt" })).toBe(
      "Writing a.txt"
    );
    expect(new ListDirectoryTool().userMessage({})).toBe("Listing .");
    expect(new EditFileTool().userMessage({ path: "a.txt" })).toBe(
      "Editing file a.txt"
    );
    expect(new GlobTool().userMessage({ pattern: "**/*.ts" })).toBe(
      "Searching for files: **/*.ts"
    );
    expect(new GrepTool().userMessage({ pattern: "TODO" })).toBe(
      "Searching for: TODO"
    );
    expect(
      new TodoWriteTool().userMessage({
        todos: [{ content: "Ship it", status: "in_progress" }]
      })
    ).toBe("Working on: Ship it");
  });
});

describe("files capabilities over a real workspace", () => {
  it("writes a file, reads it back numbered, and lists the directory", async () => {
    const run = runFor(workspace);

    expect(await run.invoke("write_file", {
      file_path: "notes.txt",
      content: "alpha\nbeta\n"
    })).toBe("Created notes.txt");

    expect(await run.invoke("read_file", { file_path: "notes.txt" })).toBe(
      "1\talpha\n2\tbeta"
    );

    const listing = await run.invoke("list_directory", { path: "." });
    expect(listing).toContain("notes.txt");
  });

  it("refuses to overwrite a file this session has not read", async () => {
    await writeFile(join(workspace, "existing.txt"), "old");
    const result = await runFor(workspace).invoke("write_file", {
      file_path: "existing.txt",
      content: "new"
    });
    expect(result).toContain("has not been read in this session");
    expect(await readFile(join(workspace, "existing.txt"), "utf-8")).toBe(
      "old"
    );
  });

  it("edits an existing file by exact replacement", async () => {
    await writeFile(join(workspace, "code.ts"), "const a = 1;\n");
    const result = (await runFor(workspace).invoke("edit_file", {
      path: "code.ts",
      old_string: "const a = 1;",
      new_string: "const a = 2;"
    })) as { success: boolean; replacements: number };

    expect(result.success).toBe(true);
    expect(result.replacements).toBe(1);
    expect(await readFile(join(workspace, "code.ts"), "utf-8")).toBe(
      "const a = 2;\n"
    );
  });

  it("globs by pattern and greps file contents", async () => {
    await mkdir(join(workspace, "src"));
    await writeFile(join(workspace, "src/one.ts"), "// TODO: wire it up\n");
    await writeFile(join(workspace, "src/two.md"), "no marker here\n");
    const run = runFor(workspace);

    const globbed = (await run.invoke("glob", { pattern: "**/*.ts" })) as {
      success: boolean;
      files: string[];
    };
    expect(globbed.success).toBe(true);
    expect(globbed.files).toEqual(["src/one.ts"]);

    const grepped = (await run.invoke("grep", { pattern: "TODO" })) as {
      success: boolean;
      matches: { file: string; line: number }[];
    };
    expect(grepped.success).toBe(true);
    expect(grepped.matches).toEqual([
      { file: "src/one.ts", line: 1, content: "// TODO: wire it up" }
    ]);
  });

  it("rejects a grep pattern that can backtrack catastrophically", async () => {
    const result = (await runFor(workspace).invoke("grep", {
      pattern: "(a+)+$"
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("catastrophic backtracking");
  });

  it("stores the todo list per thread and posts the update", async () => {
    const result = (await runFor(workspace).invoke("todo_write", {
      todos: [
        { content: "Read the design", status: "completed" },
        { content: "Port the module", status: "in_progress" }
      ]
    })) as { ok: boolean; counts: Record<string, number> };

    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      pending: 0,
      in_progress: 1,
      completed: 1
    });
    expect(getThreadTodos("thread-files")).toEqual([
      { content: "Read the design", status: "completed" },
      { content: "Port the module", status: "in_progress" }
    ]);
    expect(posted).toEqual([
      {
        type: "todo_update",
        thread_id: "thread-files",
        workflow_id: null,
        todos: [
          { content: "Read the design", status: "completed" },
          { content: "Port the module", status: "in_progress" }
        ]
      }
    ]);
  });
});
