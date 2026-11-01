import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/media/index.js", () => {
  throw new Error("Cannot find package 'node-av' imported from /lean/node_modules/@nodetool-ai/runtime/dist/media/av.js");
});
vi.mock("../../src/media/probe.js", () => {
  throw new Error("Cannot find package 'node-av' imported from /lean/node_modules/@nodetool-ai/runtime/dist/media/probe.js");
});

describe("probeVideoDurationSeconds without media-codecs", () => {
  it("names the install command", async () => {
    const { probeVideoDurationSeconds } = await import("../../src/providers/video-frames.js");
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    await expect(probeVideoDurationSeconds(webm, new AbortController().signal))
      .rejects.toThrow(/packs add media-codecs --yes/);
  });
});
