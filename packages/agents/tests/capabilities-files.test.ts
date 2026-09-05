/**
 * The `files` capability module: the seven workspace capabilities that used to
 * be seven `Tool` subclasses.
 *
 * Three things are checked. The registry stays drift-free with the module in
 * it. Every spec's category equals what the classification map says for that
 * wire name, and every spec still matches the Tool the belt builds from
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
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import {
  FILE_CAPABILITIES,
  _resetTodoStoreForTests,
  getThreadTodos
} from "../src/capabilities/files.js";
import {
  capabilityCategoryFor,
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { Tool } from "../src/tools/base-tool.js";

let workspace: string;
let posted: unknown[];

/**
 * A context over a real temp directory. Every file capability now reads
 * `context.workspace`; the assertions below still check the bytes on disk,
 * which is what makes them a test of the local backend rather than of the
 * interface. `capabilities-files-virtual.test.ts` runs the same tools over an
 * object store and asserts the same behavior.
 */
function contextFor(dir: string): ProcessingContext {
  const variables = new Map<string, unknown>();
  return {
    workspace: createLocalWorkspace(dir),
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
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("renders each capability with the surface the belt offers", () => {
    const belt: Record<string, Tool> = {
      read_file: toolForCapabilityName("read_file"),
      write_file: toolForCapabilityName("write_file"),
      list_directory: toolForCapabilityName("list_directory"),
      edit_file: toolForCapabilityName("edit_file"),
      glob: toolForCapabilityName("glob"),
      grep: toolForCapabilityName("grep"),
      todo_write: toolForCapabilityName("todo_write")
    };
    for (const entry of FILE_CAPABILITIES) {
      const tool = belt[entry.spec.name];
      expect(tool).toBeDefined();
      expect(tool.name).toBe(entry.spec.name);
      expect(tool.description).toBe(entry.spec.description);
      expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
    }
  });

  it("renders the user-facing message templates", () => {
    expect(
      toolForCapabilityName("read_file").userMessage({ file_path: "a.txt" })
    ).toBe("Reading a.txt");
    expect(
      toolForCapabilityName("write_file").userMessage({ file_path: "a.txt" })
    ).toBe("Writing a.txt");
    expect(toolForCapabilityName("list_directory").userMessage({})).toBe(
      "Listing ."
    );
    expect(
      toolForCapabilityName("edit_file").userMessage({ path: "a.txt" })
    ).toBe("Editing file a.txt");
    expect(
      toolForCapabilityName("glob").userMessage({ pattern: "**/*.ts" })
    ).toBe("Searching for files: **/*.ts");
    expect(toolForCapabilityName("grep").userMessage({ pattern: "TODO" })).toBe(
      "Searching for: TODO"
    );
    expect(
      toolForCapabilityName("todo_write").userMessage({
        todos: [{ content: "Ship it", status: "in_progress" }]
      })
    ).toBe("Working on: Ship it");
  });
});

describe("files capabilities over a real workspace", () => {
  it("writes a file, reads it back numbered, and lists the directory", async () => {
    const run = runFor(workspace);

    expect(
      await run.invoke("write_file", {
        file_path: "notes.txt",
        content: "alpha\nbeta\n"
      })
    ).toBe("Created notes.txt");

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

  it("takes a read under any spelling of the same path", async () => {
    const run = runFor(workspace);
    await run.invoke("write_file", { file_path: "notes.txt", content: "one" });

    // Same file, three spellings the model mixes freely. Keying the read
    // tracker on the string made the second and third read as unread files.
    expect(await run.invoke("read_file", { file_path: "./notes.txt" })).toBe(
      "1\tone"
    );
    for (const spelling of [
      "notes.txt",
      "./notes.txt",
      "/workspace/notes.txt"
    ]) {
      expect(
        await run.invoke("write_file", {
          file_path: spelling,
          content: `written as ${spelling}`
        })
      ).toBe(`Updated ${spelling}`);
    }
  });

  it("lets write_file follow edit_file without a re-read", async () => {
    await writeFile(join(workspace, "code.ts"), "const a = 1;\n");
    const run = runFor(workspace);

    await run.invoke("edit_file", {
      path: "code.ts",
      old_string: "const a = 1;",
      new_string: "const a = 2;"
    });
    expect(
      await run.invoke("write_file", {
        file_path: "code.ts",
        content: "const a = 3;\n"
      })
    ).toBe("Updated code.ts");
  });

  it("says a directory is a directory instead of contradicting itself", async () => {
    await mkdir(join(workspace, "prompts"));
    await writeFile(join(workspace, "prompts/one.md"), "hi");
    const run = runFor(workspace);

    // `exists` answers true for a directory and `read` answers null for one, so
    // these two used to report the folder as a file that is there with no
    // contents — the "ghost" an agent then hunted for.
    expect(await run.invoke("read_file", { file_path: "prompts" })).toContain(
      "is a directory"
    );
    expect(
      await run.invoke("write_file", { file_path: "prompts", content: "x" })
    ).toContain("is a directory");
    const edited = (await run.invoke("edit_file", {
      path: "prompts",
      old_string: "a",
      new_string: "b"
    })) as { success: boolean; error: string };
    expect(edited.success).toBe(false);
    expect(edited.error).toContain("is a directory");

    // The folder is untouched and still lists its file.
    expect(await run.invoke("list_directory", { path: "prompts" })).toContain(
      "one.md"
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
