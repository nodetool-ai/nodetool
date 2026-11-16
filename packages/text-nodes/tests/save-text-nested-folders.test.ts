/**
 * The legacy Save Text node writes to a host folder with `node:fs`. In a run
 * with a workspace it must not write into the reserved `.nodetool/` directory
 * or into the folder of another project inside the workspace.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceReservedPathError, createLocalWorkspace } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { SaveTextNode } from "@nodetool-ai/text-nodes";

let dir: string;
let context: ProcessingContext;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nodetool-savetext-"));
  await mkdir(path.join(dir, ".nodetool"));
  await writeFile(path.join(dir, ".nodetool", "project.json"), "manifest");
  await mkdir(path.join(dir, "projects", "abc", ".nodetool"), { recursive: true });
  await writeFile(path.join(dir, "projects", "abc", "note.txt"), "theirs");
  context = {
    workspace: createLocalWorkspace(dir),
    workspaceDir: dir
  } as unknown as ProcessingContext;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("SaveText in a run with a workspace", () => {
  it.each([
    [path.join("projects", "abc"), "note.txt"],
    [".nodetool", "project.json"],
    [path.join("projects", "abc", "deep"), "x.txt"]
  ])("refuses to write into %s", async (folder, name) => {
    const node = new SaveTextNode();
    node.assign({ text: "new", folder: path.join(dir, folder), name });
    await expect(node.process(context)).rejects.toThrow(WorkspaceReservedPathError);
    expect(await readFile(path.join(dir, "projects/abc/note.txt"), "utf8")).toBe("theirs");
    expect(await readFile(path.join(dir, ".nodetool/project.json"), "utf8")).toBe("manifest");
  });

  it("writes in the project's own folder", async () => {
    const node = new SaveTextNode();
    node.assign({ text: "mine", folder: path.join(dir, "out"), name: "a.txt" });
    const { output } = await node.process(context);
    expect(await readFile(path.join(dir, "out", "a.txt"), "utf8")).toBe("mine");
    expect(output.data).toBe("mine");
  });
});
