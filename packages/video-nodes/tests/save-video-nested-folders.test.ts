/**
 * The legacy Save Video and Save 3D Model nodes write to a host folder with `node:fs`.
 * In a run with a workspace it must not write into the reserved `.nodetool/`
 * directory or into the folder of another project inside the workspace.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceReservedPathError, createLocalWorkspace } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { SaveVideoNode, SaveModel3DNode } from "@nodetool-ai/video-nodes";


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

const VIDEO = { type: "video", uri: "", data: Buffer.from([1, 2, 3, 4]).toString("base64") };
const MODEL = { type: "model3d", uri: "", format: "glb", data: Buffer.from([5, 6, 7, 8]).toString("base64") };

describe.each([
  ["SaveVideo", () => new SaveVideoNode(), VIDEO, "video", "name"],
  ["SaveModel3D", () => new SaveModel3DNode(), MODEL, "model", "name"]
] as const)("%s in a run with a workspace", (_label, make, media, slot, nameProp) => {
  it.each([
    [path.join("projects", "abc"), "clip.bin"],
    [".nodetool", "project.json"],
    [path.join("projects", "abc", "deep"), "x.mp4"]
  ])("refuses to write into %s", async (folder, name) => {
    const node = make();
    node.assign({ [slot]: media, folder: { type: "folder", uri: path.join(dir, folder) }, [nameProp]: name });
    await expect(node.process(context)).rejects.toThrow(WorkspaceReservedPathError);
    await intact();
  });

  it("writes in the project's own folder", async () => {
    const node = make();
    node.assign({ [slot]: media, folder: { type: "folder", uri: path.join(dir, "out") }, [nameProp]: "a.bin" });
    await node.process(context);
    expect((await readFile(path.join(dir, "out", "a.bin"))).length).toBe(4);
  });
});
