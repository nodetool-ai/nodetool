import { describe, it, expect, vi, beforeEach } from "vitest";

import { mediaCalls, resetFakeMedia } from "./_fixtures/fake-media.js";
import { atempoChain } from "../src/nodes/video-helpers.js";

vi.mock("@nodetool-ai/runtime/media", async (importOriginal) =>
  (await import("./_fixtures/fake-media.js")).fakeMediaModule(await importOriginal(), { edits: true })
);

const {
  AddSubtitlesVideoNode,
  ChromaKeyVideoNode,
  SetSpeedVideoNode,
  TransitionVideoNode
} = await import("@nodetool-ai/video-nodes");

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

function lastTransformArgs(): string {
  const call = [...mediaCalls].reverse().find((c) => c.fn === "transformMedia");
  if (!call || call.fn !== "transformMedia") return "";
  return call.args;
}

beforeEach(() => {
  resetFakeMedia();
});

describe("FFmpeg filtergraph injection and numeric bounds", () => {
  it("prevents filtergraph injection via AddSubtitles font_color and falls back when font name strips empty", async () => {
    const node = new AddSubtitlesVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      font: { type: "font", name: "':;,[]%" },
      font_color: { type: "color", value: "white:text='injected',movie=/etc/passwd" },
      font_size: Number.NaN,
      chunks: [{ text: "hello", timestamp: [0, 1] }]
    });
    await node.process().catch(() => undefined);

    const args = lastTransformArgs();
    expect(args).not.toContain("movie=");
    expect(args).not.toContain("text='injected'");
    expect(args).toContain("font='Sans'");
    expect(args).not.toContain("fontsize=NaN");
  });

  it("prevents filtergraph injection via ChromaKey key_color", async () => {
    const node = new ChromaKeyVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      key_color: { type: "color", value: "0x00FF00:0.3:0.1,movie=/etc/passwd" },
      similarity: 0.3,
      blend: 0.1
    });
    await node.process().catch(() => undefined);

    const args = lastTransformArgs();
    expect(args).not.toContain("movie=");
    expect(args).not.toContain(",");
  });

  it("rejects non-allowlisted TransitionVideoNode transition_type values", async () => {
    const node = new TransitionVideoNode();
    node.assign({
      video_a: videoRef([1, 2, 3, 4]),
      video_b: videoRef([5, 6, 7, 8]),
      transition_type: "fade:duration=1,movie=/etc/passwd[x]",
      duration: 1
    });

    await expect(node.process()).rejects.toThrow(/transition/i);
    expect(mediaCalls.some((c) => c.fn === "transformMedia")).toBe(false);
  });

  it("rejects non-finite and non-positive rates in atempoChain and SetSpeedVideoNode", async () => {
    expect(() => atempoChain(Number.NaN)).toThrow(RangeError);
    expect(() => atempoChain(0)).toThrow(RangeError);
    expect(() => atempoChain(-1)).toThrow(RangeError);
    expect(() => atempoChain(Number.POSITIVE_INFINITY)).toThrow(RangeError);

    const node = new SetSpeedVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      speed_factor: Number.NaN
    });
    await expect(node.process()).rejects.toThrow(/speed/i);

    const infNode = new SetSpeedVideoNode();
    infNode.assign({
      video: videoRef([1, 2, 3, 4]),
      speed_factor: Number.POSITIVE_INFINITY
    });
    await expect(infNode.process()).rejects.toThrow(/speed/i);
  });
});
