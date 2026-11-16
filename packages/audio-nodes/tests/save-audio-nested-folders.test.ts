/**
 * The legacy Save Audio node writes to a host folder with `node:fs`.
 * In a run with a workspace it must not write into the reserved `.nodetool/`
 * directory or into the folder of another project inside the workspace.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceReservedPathError, createLocalWorkspace } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { SaveAudioNode } from "@nodetool-ai/audio-nodes";


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

const AUDIO = { type: "audio", uri: "", data: Buffer.from([1, 2, 3, 4]).toString("base64") };

describe("SaveAudio in a run with a workspace", () => {
  it.each([
    [path.join("projects", "abc"), "clip.bin"],
    [".nodetool", "project.json"],
    [path.join("projects", "abc", "deep"), "x.wav"]
  ])("refuses to write into %s", async (folder, name) => {
    const node = new SaveAudioNode();
    node.assign({ audio: AUDIO, folder: { type: "folder", uri: path.join(dir, folder) }, name });
    await expect(node.process(context)).rejects.toThrow(WorkspaceReservedPathError);
    await intact();
  });

  it("writes in the project's own folder", async () => {
    const node = new SaveAudioNode();
    node.assign({ audio: AUDIO, folder: { type: "folder", uri: path.join(dir, "out") }, name: "a.wav" });
    await node.process(context);
    expect(await readFile(path.join(dir, "out", "a.wav"))).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
