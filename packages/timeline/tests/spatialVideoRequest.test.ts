import { describe, expect, it } from "vitest";
import { makeClip } from "../src/defaults.js";
import {
  createSpatialVideoRequest,
  landSpatialVideoCandidate,
  spatialVideoProviderRequest
} from "../src/spatialVideoRequest.js";
import { applyTakeToClip, previewTake } from "../src/takes.js";
import { clipSourceMsAt } from "../src/timeRemap.js";

const clip = () =>
  makeClip({
    id: "clip",
    trackId: "video",
    mediaType: "video",
    currentAssetId: "source",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 10000,
    outPointMs: 14000,
    width: 1280,
    height: 720,
    aspectRatio: "16:9",
    resolution: "720p",
    transform: {
      position: { x: 12, y: -8 },
      scale: { x: 1.2, y: 0.8 },
      rotation: 0.2,
      anchor: { x: 0.25, y: 0.75 }
    },
    status: "generated"
  });

const model = (task: string) => ({
  id: `${task}-model`,
  provider: "fal_ai",
  supportedTasks: [task]
});

describe("spatial video requests", () => {
  it("requires exact outpaint and upscale model capabilities", () => {
    const base = {
      clip: clip(),
      sequenceId: "sequence",
      requestId: "request"
    };
    expect(() =>
      createSpatialVideoRequest({
        ...base,
        action: "expand_frame",
        model: model("video_to_video"),
        targetAspectRatio: "9:16",
        padding: { top: 320, bottom: 320 }
      })
    ).toThrow(/outpaint_video/);
    expect(() =>
      createSpatialVideoRequest({
        ...base,
        action: "upscale",
        model: model("image_to_video"),
        targetResolution: "2160p"
      })
    ).toThrow(/upscale_video/);
  });

  it("captures explicit generated sides and maps only to outpaint_video", () => {
    const request = createSpatialVideoRequest({
      clip: clip(),
      sequenceId: "sequence",
      requestId: "expand-request",
      action: "expand_frame",
      model: model("outpaint_video"),
      targetAspectRatio: "9:16",
      padding: { top: 320, bottom: 320 },
      prompt: " continue the studio ",
      expandRatio: 0.25
    });
    expect(request).toMatchObject({
      action: "expand_frame",
      modelTask: "outpaint_video",
      candidateOnly: true,
      targetAspectRatio: "9:16",
      padding: { top: 320, bottom: 320 },
      prompt: "continue the studio"
    });
    expect(spatialVideoProviderRequest(request)).toEqual({
      capability: "outpaint_video",
      provider: "fal_ai",
      model: "outpaint_video-model",
      sourceAssetId: "source",
      sourceContext: request.sourceContext,
      params: {
        prompt: "continue the studio",
        negative_prompt: undefined,
        padding: { top: 320, bottom: 320 },
        expand_ratio: 0.25,
        aspect_ratio: "9:16",
        resolution: undefined
      }
    });
  });

  it("rejects missing generated sides and invalid target framing", () => {
    const base = {
      clip: clip(),
      sequenceId: "sequence",
      requestId: "request",
      action: "expand_frame" as const,
      model: model("outpaint_video")
    };
    expect(() =>
      createSpatialVideoRequest({
        ...base,
        targetAspectRatio: "9:16",
        padding: {}
      })
    ).toThrow(/generated side/);
    expect(() =>
      createSpatialVideoRequest({
        ...base,
        targetAspectRatio: "wide",
        padding: { left: 100 }
      })
    ).toThrow(/aspect ratio/);
  });

  it("captures the upscale operation and result resolution separately", () => {
    const request = createSpatialVideoRequest({
      clip: clip(),
      sequenceId: "sequence",
      requestId: "upscale-request",
      action: "upscale",
      model: model("upscale_video"),
      targetResolution: "2160p",
      scale: 4,
      creativity: 0.25
    });
    expect(request).toMatchObject({
      action: "upscale",
      modelTask: "upscale_video",
      candidateOnly: true,
      targetResolution: "2160p"
    });
    expect(spatialVideoProviderRequest(request)).toEqual({
      capability: "upscale_video",
      provider: "fal_ai",
      model: "upscale_video-model",
      sourceAssetId: "source",
      sourceContext: request.sourceContext,
      params: {
        scale: 4,
        target_resolution: "2160p",
        prompt: undefined,
        creativity: 0.25
      }
    });
  });

  it("rejects incomplete or invalid upscale controls", () => {
    const base = {
      clip: clip(),
      sequenceId: "sequence",
      requestId: "upscale-request",
      action: "upscale" as const,
      model: model("upscale_video")
    };
    expect(() =>
      createSpatialVideoRequest({ ...base, targetResolution: "" })
    ).toThrow(/target resolution/);
    expect(() =>
      createSpatialVideoRequest({
        ...base,
        targetResolution: "2160p",
        scale: 1
      })
    ).toThrow(/greater than 1/);
    expect(() =>
      createSpatialVideoRequest({
        ...base,
        targetResolution: "2160p",
        creativity: 1.1
      })
    ).toThrow(/between 0 and 1/);
  });

  it("lands both operations as candidates without changing accepted framing", () => {
    for (const request of [
      createSpatialVideoRequest({
        clip: clip(),
        sequenceId: "sequence",
        requestId: "expand-request",
        action: "expand_frame",
        model: model("outpaint_video"),
        targetAspectRatio: "9:16",
        padding: { top: 320, bottom: 320 }
      }),
      createSpatialVideoRequest({
        clip: clip(),
        sequenceId: "sequence",
        requestId: "upscale-request",
        action: "upscale",
        model: model("upscale_video"),
        targetResolution: "2160p"
      })
    ]) {
      const original = clip();
      const landed = landSpatialVideoCandidate(original, request, {
        assetId: `${request.action}-asset`,
        createdAt: "2026-09-16",
        durationMs: 4000
      });
      expect(landed.currentAssetId).toBe("source");
      expect(landed.activeTakeId).toBeUndefined();
      expect(landed.width).toBe(1280);
      expect(landed.height).toBe(720);
      expect(landed.aspectRatio).toBe("16:9");
      expect(landed.resolution).toBe("720p");
      expect(landed.versions?.at(-1)).toMatchObject({
        id: request.requestId,
        assetId: `${request.action}-asset`,
        paramOverridesSnapshot: { spatialVideoAction: request },
        sourceMapping: {
          inPointMs: 0,
          outPointMs: 4000,
          speedMultiplier: 1,
          speedBaked: true
        }
      });

      const preview = previewTake(landed, request.requestId);
      expect(preview?.currentAssetId).toBe(`${request.action}-asset`);
      expect(clipSourceMsAt(preview!, 2250)).toBe(1250);
      expect(preview).toMatchObject({
        durationMs: original.durationMs,
        width: original.width,
        height: original.height,
        aspectRatio: original.aspectRatio,
        resolution: original.resolution,
        transform: original.transform
      });

      const applied = applyTakeToClip(landed, request.requestId);
      expect(applied.error).toBeUndefined();
      expect(clipSourceMsAt(applied.clip, 2250)).toBe(1250);
      expect(applied.clip).toMatchObject({
        durationMs: original.durationMs,
        width: original.width,
        height: original.height,
        aspectRatio: original.aspectRatio,
        resolution: original.resolution,
        transform: original.transform
      });
      expect(
        landSpatialVideoCandidate(landed, request, {
          assetId: `${request.action}-asset`,
          createdAt: "2026-09-16"
        })
      ).toBe(landed);
    }
  });

  it("keeps a newer accepted asset while retaining submitted-source ancestry", () => {
    const original = clip();
    const request = createSpatialVideoRequest({
      clip: original,
      sequenceId: "sequence",
      requestId: "upscale-request",
      action: "upscale",
      model: model("upscale_video"),
      targetResolution: "2160p"
    });
    const changed = { ...original, currentAssetId: "newer-source" };
    const landed = landSpatialVideoCandidate(changed, request, {
      assetId: "upscaled",
      createdAt: "2026-09-16"
    });
    expect(landed.currentAssetId).toBe("newer-source");
    expect(landed.versions?.map((take) => take.assetId)).toEqual([
      "source",
      "upscaled"
    ]);
    expect(landed.versions?.at(-1)?.parentTakeId).toBe(
      landed.versions?.[0]?.id
    );
  });
});
