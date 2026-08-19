/**
 * The `save_to_workspace` toggle, across every node that writes a file.
 *
 * Each one answers the same two questions: with the toggle on the file lands
 * in the run's workspace folder, and a name already taken is numbered rather
 * than overwritten.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  SaveTextFileNode,
  SaveDocumentFileNode
} from "@nodetool-ai/base-nodes";
import { SaveAudioFileNode } from "@nodetool-ai/audio-nodes";
import { SaveImageFileImageNode } from "@nodetool-ai/image-nodes";

let workspace: string;
let context: ProcessingContext;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "nodetool-workspace-"));
  context = new ProcessingContext({ jobId: "save-test", workspaceDir: workspace });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("save_to_workspace", () => {
  it("defaults to on for every save node", () => {
    expect(new SaveTextFileNode().serialize()).toMatchObject({
      save_to_workspace: true
    });
    expect(new SaveImageFileImageNode().serialize()).toMatchObject({
      save_to_workspace: true
    });
    expect(new SaveAudioFileNode().serialize()).toMatchObject({
      save_to_workspace: true
    });
    expect(new SaveDocumentFileNode().serialize()).toMatchObject({
      save_to_workspace: true
    });
  });

  it("writes text into the workspace and numbers a repeat save", async () => {
    for (let i = 0; i < 2; i++) {
      const node = new SaveTextFileNode();
      node.assign({ text: `run ${i}`, save_to_workspace: true, name: "out.txt" });
      const result = await node.process(context);
      expect(result.output.uri.startsWith(workspace)).toBe(true);
    }
    expect((await readdir(workspace)).sort()).toEqual(["out.txt", "out_1.txt"]);
  });

  it("writes an image into the workspace", async () => {
    const node = new SaveImageFileImageNode();
    node.assign({
      image: { type: "image", data: PNG.toString("base64") },
      save_to_workspace: true,
      filename: "shot.png"
    });
    const result = await node.process(context);
    expect(path.dirname(result.path)).toBe(workspace);
  });

  it("writes a document into the workspace", async () => {
    const node = new SaveDocumentFileNode();
    node.assign({
      document: { type: "document", text: "hello" },
      save_to_workspace: true,
      filename: "notes.txt"
    });
    const result = await node.process(context);
    expect(result.output).toBe(path.join(workspace, "notes.txt"));
  });

  it("uses the folder property when the toggle is off", async () => {
    const folder = path.join(workspace, "elsewhere");
    const node = new SaveTextFileNode();
    node.assign({
      text: "hi",
      save_to_workspace: false,
      folder,
      name: "out.txt"
    });
    const result = await node.process(context);
    expect(result.output.uri).toBe(path.join(folder, "out.txt"));
  });

  it("falls back to the folder when the run has no workspace", async () => {
    const folder = path.join(workspace, "no-ws");
    const node = new SaveTextFileNode();
    node.assign({ text: "hi", save_to_workspace: true, folder, name: "out.txt" });
    const result = await node.process(
      new ProcessingContext({ jobId: "no-workspace" })
    );
    expect(result.output.uri).toBe(path.join(folder, "out.txt"));
  });

  it("reports a missing destination instead of writing to the process cwd", async () => {
    const node = new SaveTextFileNode();
    node.assign({ text: "hi", save_to_workspace: true, name: "out.txt" });
    await expect(
      node.process(new ProcessingContext({ jobId: "no-workspace" }))
    ).rejects.toThrow(/Save to workspace/);
  });

  it("leaves a file the workspace already holds alone", async () => {
    await writeFile(path.join(workspace, "out.txt"), "existing");
    const node = new SaveTextFileNode();
    node.assign({ text: "new", save_to_workspace: true, name: "out.txt" });
    await node.process(context);
    expect((await readdir(workspace)).sort()).toEqual(["out.txt", "out_1.txt"]);
  });
});
