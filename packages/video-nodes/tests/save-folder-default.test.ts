/**
 * Save nodes with an empty `folder` should write into the run's workspace
 * directory, not the server process cwd (`.`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let writtenPaths: string[] = [];
let mkdirPaths: string[] = [];

vi.mock("node:fs", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const promises = {
    mkdir: async (p: string) => {
      mkdirPaths.push(p);
    },
    writeFile: async (p: string) => {
      writtenPaths.push(p);
    },
    // Nothing exists → uniqueTargetPath keeps the first candidate.
    access: async () => {
      throw new Error("ENOENT");
    }
  };
  return { ...original, promises };
});

const { SaveVideoNode, SaveVideoFileVideoNode, FrameToVideoNode } =
  await import("@nodetool-ai/video-nodes");

function inlineVideo() {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString("base64")
  };
}

beforeEach(() => {
  writtenPaths = [];
  mkdirPaths = [];
});

describe("save-folder default", () => {
  it("SaveVideo writes under the workspace dir when folder is empty", async () => {
    const node = new SaveVideoNode();
    node.assign({ video: inlineVideo(), name: "clip.mp4" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await node.process({ workspaceDir: "/ws" } as any);

    expect(writtenPaths).toHaveLength(1);
    expect(writtenPaths[0].startsWith("/ws/")).toBe(true);
    expect(mkdirPaths[0]).toBe("/ws");
  });

  it("SaveVideoFile writes under the workspace dir when folder is empty", async () => {
    const node = new SaveVideoFileVideoNode();
    node.assign({ video: inlineVideo(), filename: "clip.mp4" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await node.process({ workspaceDir: "/ws" } as any);

    expect(writtenPaths).toHaveLength(1);
    expect(writtenPaths[0].startsWith("/ws/")).toBe(true);
  });

  it("an explicit folder still wins over the workspace dir", async () => {
    const node = new SaveVideoNode();
    node.assign({ video: inlineVideo(), name: "clip.mp4", folder: "/out" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await node.process({ workspaceDir: "/ws" } as any);

    expect(writtenPaths[0].startsWith("/out/")).toBe(true);
  });

  it("falls back to cwd when no workspace is set", async () => {
    const node = new SaveVideoNode();
    node.assign({ video: inlineVideo(), name: "clip.mp4" });
    await node.process();

    // Resolved against cwd, so not the workspace path.
    expect(writtenPaths[0].startsWith("/ws/")).toBe(false);
  });
});

describe("FrameToVideo fps input", () => {
  it("exposes fps as a wireable input handle", () => {
    expect(FrameToVideoNode.inputFields).toContain("fps");
  });
});
