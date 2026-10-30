/**
 * A terminal failure on an effect node must throw — never silently pass the
 * unchanged input through (a no-op effect indistinguishable from a real one).
 * Bytes that are no video make every edit fail for real.
 */
import { describe, it, expect } from "vitest";

const { AddAudioVideoNode, DenoiseVideoNode, ResizeVideoNode, SetSpeedVideoNode } = await import(
  "@nodetool-ai/video-nodes"
);

const garbage = Buffer.from(new Uint8Array(4096).fill(7)).toString("base64");
const notVideo = { type: "video", uri: "", data: garbage };

describe("effect nodes throw on a terminal failure", () => {
  it("DenoiseVideoNode rejects instead of returning its input", async () => {
    const node = new DenoiseVideoNode();
    node.assign({ video: notVideo, strength: 5 });
    await expect(node.process()).rejects.toThrow(/Video processing failed/);
  });

  it("ResizeVideoNode rejects instead of returning its input", async () => {
    const node = new ResizeVideoNode();
    node.assign({ video: notVideo, width: 32, height: 24 });
    await expect(node.process()).rejects.toThrow(/Video processing failed/);
  });

  it("SetSpeedVideoNode throws when even the video-only fallback fails", async () => {
    // The audio+video attempt is allowed to fall back; the video-only attempt is
    // terminal and must surface the failure, not return the input unchanged.
    const node = new SetSpeedVideoNode();
    node.assign({ video: notVideo, speed_factor: 2 });
    await expect(node.process()).rejects.toThrow(/Video processing failed/);
  });

  it("AddAudioVideoNode throws when even the replace fallback fails", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: notVideo,
      audio: { type: "audio", uri: "", data: garbage },
      mix: true
    });
    await expect(node.process()).rejects.toThrow(/Video processing failed/);
  });
});
