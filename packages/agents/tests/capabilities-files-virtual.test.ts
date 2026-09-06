/**
 * The file capabilities over a *virtual* workspace — an object store with no
 * directory behind it, which is what a cloud deployment gives a run.
 *
 * `capabilities-files.test.ts` drives the same tools over a real folder and
 * checks the bytes on disk. This file checks the behavior a user sees, and the
 * two together are the claim the abstraction makes: a run does the same thing
 * on either deployment. Before this change every one of these tools called
 * `node:fs` and none of them worked here at all.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { StorageWorkspace, type ProcessingContext, type Workspace } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";

import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

let workspace: Workspace;
let run: CapabilityRun;

function contextFor(ws: Workspace): ProcessingContext {
  const variables = new Map<string, unknown>();
  return {
    workspace: ws,
    threadId: "thread-files-virtual",
    workflowId: null,
    get<T>(key: string): T | undefined {
      return variables.get(key) as T | undefined;
    },
    set(key: string, value: unknown): void {
      variables.set(key, value);
    },
    postMessage(): void {}
  } as unknown as ProcessingContext;
}

beforeEach(() => {
  workspace = new StorageWorkspace(new InMemoryStorageAdapter());
  run = createCapabilityRun({ context: contextFor(workspace), gate: UNGATED });
});

/** Invoke a capability by its wire name, as the model would. */
async function invoke(
  name: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return run.invoke(name, params);
}

describe("file capabilities on a workspace with no directory", () => {
  it("writes and reads a file back", async () => {
    expect(await invoke("write_file", { file_path: "notes.md", content: "hi" }))
      .toBe("Created notes.md");
    expect(await invoke("read_file", { file_path: "notes.md" })).toContain("hi");
  });

  it("reports a missing file instead of throwing", async () => {
    expect(await invoke("read_file", { file_path: "nope.md" })).toContain(
      "does not exist"
    );
  });

  it("refuses to overwrite a file the session has not read", async () => {
    await workspace.write("existing.md", "on the server");
    const result = await invoke("write_file", {
      file_path: "existing.md",
      content: "clobber"
    });
    expect(String(result)).toContain("has not been read in this session");
    expect(await workspace.readText("existing.md")).toBe("on the server");
  });

  it("lists a directory, marking subdirectories", async () => {
    await workspace.write("a.txt", "a");
    await workspace.write("out/b.txt", "b");
    const listing = String(await invoke("list_directory", { path: "." }));
    expect(listing).toContain("out/");
    expect(listing).toContain("a.txt");
  });

  it("reports a listing of a path that is not there", async () => {
    expect(String(await invoke("list_directory", { path: "ghost" }))).toContain(
      "not found"
    );
  });

  it("edits a file in place", async () => {
    await invoke("write_file", { file_path: "code.ts", content: "const a = 1;" });
    const result = (await invoke("edit_file", {
      path: "code.ts",
      old_string: "1",
      new_string: "2"
    })) as { success: boolean };
    expect(result.success).toBe(true);
    expect(await workspace.readText("code.ts")).toBe("const a = 2;");
  });

  it("creates a file through edit_file with an empty old_string", async () => {
    const result = (await invoke("edit_file", {
      path: "new.txt",
      old_string: "",
      new_string: "fresh"
    })) as { success: boolean; created?: boolean };
    expect(result).toMatchObject({ success: true, created: true });
    expect(await workspace.readText("new.txt")).toBe("fresh");
  });

  it("globs by pattern across subdirectories", async () => {
    await workspace.write("src/a.ts", "a");
    await workspace.write("src/deep/b.ts", "b");
    await workspace.write("src/notes.md", "m");
    const result = (await invoke("glob", { pattern: "**/*.ts" })) as {
      files: string[];
    };
    expect(result.files.sort()).toEqual(["src/a.ts", "src/deep/b.ts"]);
  });

  it("greps file contents and reports line numbers", async () => {
    await workspace.write("one.txt", "alpha\nbeta\n");
    await workspace.write("two.txt", "gamma\n");
    const result = (await invoke("grep", { pattern: "beta" })) as {
      matches: Array<{ file: string; line: number; content: string }>;
    };
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      file: "one.txt",
      line: 2,
      content: "beta"
    });
  });

  it("refuses a path that climbs out of the workspace", async () => {
    const result = await invoke("read_file", { file_path: "../../etc/passwd" });
    expect(String(result)).toContain("outside the workspace");
  });

  it("says plainly when the run has no workspace at all", async () => {
    const bare = createCapabilityRun({
      context: contextFor(null as unknown as Workspace),
      gate: UNGATED
    });
    expect(String(await bare.invoke("read_file", { file_path: "a.txt" })))
      .toContain("No workspace");
  });
});
