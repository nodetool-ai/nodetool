/**
 * Save Document File with a pinned `path` writes with `node:fs`.
 * In a run with a workspace it must not write into the reserved `.nodetool/`
 * directory or into the folder of another project inside the workspace.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceReservedPathError, createLocalWorkspace } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { SaveDocumentFileNode } from "../src/nodes/document.js";


let dir: string;
let context: ProcessingContext;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nodetool-save-nested-"));
  await mkdir(path.join(dir, ".nodetool"));
  await writeFile(path.join(dir, ".nodetool", "project.json"), "manifest");
  await mkdir(path.join(dir, "projects", "abc", ".nodetool"), { recursive: true });
  await writeFile(path.join(dir, "projects", "abc", "clip.bin"), "theirs");
  context = {
    workspace: createLocalWorkspace(dir),
    workspaceDir: dir,
    hasModelInterface: () => false,
  } as unknown as ProcessingContext;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const intact = async (): Promise<void> => {
  expect(await readFile(path.join(dir, "projects/abc/clip.bin"), "utf8")).toBe("theirs");
  expect(await readFile(path.join(dir, ".nodetool/project.json"), "utf8")).toBe("manifest");
};

describe("SaveDocumentFile with a pinned path in a run with a workspace", () => {
  it.each([
    path.join("projects", "abc", "clip.bin"),
    path.join(".nodetool", "project.json"),
    path.join("projects", "abc", "deep", "x.txt")
  ])("refuses to write %s", async (target) => {
    const node = new SaveDocumentFileNode();
    node.assign({ document: { type: "document", text: "new" }, save_to_workspace: false });
    node.path = path.join(dir, target);
    await expect(node.process(context)).rejects.toThrow(WorkspaceReservedPathError);
    await intact();
  });

  it("writes in the project's own folder", async () => {
    const node = new SaveDocumentFileNode();
    node.assign({ document: { type: "document", text: "mine" }, save_to_workspace: false });
    node.path = path.join(dir, "out", "a.txt");
    await node.process(context);
    expect(await readFile(path.join(dir, "out", "a.txt"), "utf8")).toBe("mine");
  });
});
