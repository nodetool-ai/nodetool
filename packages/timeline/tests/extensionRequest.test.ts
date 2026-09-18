import { describe, expect, it } from "vitest";
import { makeClip } from "../src/defaults.js";
import {
  applyExtensionRequest,
  createExtensionRequest,
  extensionGenerateMediaData,
  landExtensionCandidate
} from "../src/extensionRequest.js";

function setup(direction: "start" | "end" = "end") {
  const clip = makeClip({
    id: "clip",
    trackId: "video",
    mediaType: "video",
    startMs: 5000,
    durationMs: 4000,
    inPointMs: 40000,
    outPointMs: 48000,
    speedMultiplier: 2,
    currentAssetId: "source",
    status: "generated"
  });
  const input = {
    clip,
    requestId: "request",
    sequenceId: "sequence",
    model: {
      id: "extension-model",
      provider: "fal_ai",
      supportedTasks: ["extend_video"]
    },
    direction,
    addedSourceDurationMs: 2000,
    prompt: "Continue the motion"
  };
  return { clip, input, request: createExtensionRequest(input) };
}

describe("extension request and candidate mapping", () => {
  it("requires a genuine extension task instead of video editing or image continuation", () => {
    const { input } = setup();
    for (const supportedTasks of [[], ["video_to_video"], ["image_to_video"]]) {
      expect(() =>
        createExtensionRequest({
          ...input,
          model: { ...input.model, supportedTasks }
        })
      ).toThrow(/extend_video/);
    }
  });

  it("rejects a direction that an extension model does not support", () => {
    const { input } = setup();
    expect(() =>
      createExtensionRequest({
        ...input,
        direction: "start",
        model: {
          ...input.model,
          supportedTasks: ["extend_video", "extend_video_end"]
        }
      })
    ).toThrow(/does not support start extension/);
  });

  it.each(["start", "end"] as const)(
    "captures source time and explicit %s extension inputs",
    (direction) => {
      const { clip, request } = setup(direction);
      clip.inPointMs = 0;
      expect(extensionGenerateMediaData(request)).toMatchObject({
        mode: "video_extend",
        extension_mode: direction,
        duration: 2,
        source_asset_id: "source",
        source_context: {
          source_start_ms: 40000,
          source_end_ms: 48000,
          timeline_duration_ms: 4000,
          speed_multiplier: 2
        }
      });
      expect(Object.isFrozen(request.source)).toBe(true);
    }
  );

  it("lands once, retains submitted provenance, and refuses applying to a changed source", () => {
    const { clip, request } = setup();
    const changed = { ...clip, currentAssetId: "new-source" };
    const result = {
      assetId: "extended",
      durationMs: 10000,
      createdAt: "2026-01-01"
    };
    const landed = landExtensionCandidate(changed, request, result);
    expect(landed.currentAssetId).toBe("new-source");
    expect(landed.inPointMs).toBe(40000);
    expect(
      landed.versions?.find((take) => take.id === "request")
        ?.paramOverridesSnapshot
    ).toEqual({ extension: request });
    expect(landExtensionCandidate(landed, request, result)).toBe(landed);
    expect(applyExtensionRequest([landed], request, "keep-cut")).toMatchObject({
      ok: false,
      code: "stale"
    });
  });

  it("rejects an output containing only the generated continuation", () => {
    const { clip, request } = setup();
    expect(() =>
      landExtensionCandidate(clip, request, {
        assetId: "continuation-only",
        durationMs: 2000,
        createdAt: "2026-01-01"
      })
    ).toThrow(/source window/);
  });

  it.each(["keep-cut", "available-space", "ripple"] as const)(
    "applies %s with the submitted source rate",
    (timing) => {
      const { clip, request } = setup();
      const candidate = landExtensionCandidate(clip, request, {
        assetId: "extended",
        durationMs: 10000,
        createdAt: "2026-01-01"
      });
      const result = applyExtensionRequest([candidate], request, timing);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.clips[0]).toMatchObject({
          currentAssetId: "extended",
          inPointMs: 0,
          durationMs: timing === "keep-cut" ? 4000 : 5000
        });
      }
    }
  );
});
