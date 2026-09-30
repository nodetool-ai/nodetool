import { describe, expect, it, vi } from "vitest";
import { makeClip, makeSequence, makeTrack } from "@nodetool-ai/timeline";
import type { FrameSample } from "@nodetool-ai/timeline/render";

vi.mock("@nodetool-ai/gpu/node", () => ({
  getNodeGPUDevice: async () => ({})
}));
vi.mock("@nodetool-ai/timeline/render", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nodetool-ai/timeline/render")>();
  class Compositor {
    setReferenceSize(): void {}
    dispose(): void {}
    async renderFrameSamples(_samples: FrameSample[]): Promise<Uint8Array> {
      return new Uint8Array(16 * 16 * 4);
    }
  }
  return { ...original, HeadlessFrameCompositor: Compositor };
});
vi.mock("../src/nodes/timeline/rawFrames.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/nodes/timeline/rawFrames.js")>();
  return {
    ...original,
    probeVideoSize: async () => ({ width: 16, height: 16 }),
    probeVideoFrameRate: async () => 30,
    openVideoFrameStream: () => ({
      width: 16,
      height: 16,
      frameAt: async () => null,
      close: () => {}
    }),
    openSourceFrameStream: () => ({
      width: 16,
      height: 16,
      frameAtSourceSec: async () => null,
      close: () => {}
    })
  };
});
import { computeActiveLayersWithHorizon } from "@nodetool-ai/timeline/render";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";

const track = makeTrack({ type: "video", id: "visual", index: 0 });
const clip = () =>
  makeClip({
    id: "required-logo",
    name: "Logo",
    trackId: track.id,
    startMs: 0,
    durationMs: 100,
    mediaType: "image",
    status: "generated"
  });

async function render(
  clips: ReturnType<typeof makeClip>[],
  resolveAssetPath = async (): Promise<string | null> => "controlled-media"
) {
  const sequence = makeSequence({
    width: 16,
    height: 16,
    fps: 30,
    durationMs: 100,
    tracks: [track],
    clips
  });
  return renderTimelineComposited({
    sequence,
    width: 16,
    height: 16,
    fps: 30,
    durationMs: 100,
    resolveAssetPath,
    outPath: "unused",
    writeFrame: async () => {}
  });
}

describe("timeline export required-content diagnostics", () => {
  it("reports an unavailable owned asset without calling its decoder", async () => {
    const missing = makeClip({ ...clip(), currentAssetId: "missing" });
    const result = await render([missing], async () => null);
    expect(result).toMatchObject({
      complete: false,
      diagnostics: [
        {
          clipId: missing.id,
          startMs: 0,
          endMs: 100,
          reason: "unavailable_media"
        }
      ]
    });
  });
  it("allows an intentionally empty sequence", async () => {
    expect(await render([])).toMatchObject({
      complete: true,
      diagnostics: [],
      skippedClips: []
    });
  });
  it("retains a real scene-resolver drop for an inactive matte", async () => {
    const logo = clip();
    logo.currentAssetId = "logo";
    logo.matte = { sourceClipId: "matte", mode: "alpha" };
    const matte = makeClip({
      ...logo,
      id: "matte",
      startMs: 1000,
      matte: undefined
    });
    expect(
      computeActiveLayersWithHorizon([track], [logo, matte], 0).droppedLayers
    ).toEqual([{ clipId: logo.id, reason: "matte_source_inactive" }]);
    const result = await render([logo, matte]);
    expect(result).toMatchObject({
      complete: false,
      diagnostics: [
        {
          clipId: logo.id,
          startMs: 0,
          endMs: 100,
          reason: "scene_drop",
          detail: "matte_source_inactive"
        }
      ]
    });
  });
  it("reports an active draft without an asset", async () => {
    const result = await render([makeClip({ ...clip(), status: "draft" })]);
    expect(result).toMatchObject({
      complete: false,
      diagnostics: [
        {
          clipId: "required-logo",
          startMs: 0,
          endMs: 100,
          reason: "missing_asset"
        }
      ]
    });
    expect(result.skippedClips).toEqual(["Logo"]);
  });
  it("reports a video decoder that never returns a frame", async () => {
    const video = makeClip({
      ...clip(),
      mediaType: "video",
      currentAssetId: "video"
    });
    const result = await render([video]);
    expect(result).toMatchObject({
      complete: false,
      diagnostics: [
        { clipId: video.id, startMs: 0, endMs: 100, reason: "decode_failure" }
      ]
    });
  });
});
