/**
 * `render_model3d_reference` through `applyTimelineOp`: what the op checks,
 * what it hands the host, and what it writes on the clip.
 */

import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import {
  computeModel3DBakeHash,
  computeModel3DReferenceHash,
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeTrack,
  model3dReferenceStatus
} from "../src/index.js";

const SEQUENCE = { fps: 30, width: 1920, height: 1080 };
/** A generated asset id, full length, as a host returns it. */
const REFERENCE_ASSET = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

function context(): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}` };
}

function withClip(
  style: Partial<typeof DEFAULT_MODEL3D_STYLE> = {}
): TimelineOpState {
  return {
    ...SEQUENCE,
    tracks: [makeTrack({ id: "track_o", type: "overlay", name: "Overlay", index: 0 })],
    clips: [
      makeClip({
        id: "clip_m",
        trackId: "track_o",
        name: "Set",
        startMs: 0,
        durationMs: 2000,
        mediaType: "model3d",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "asset_glb",
        model3dStyle: { ...DEFAULT_MODEL3D_STYLE, ...style }
      })
    ],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

const render = { op: "render_model3d_reference" as const, target: "clip_m" };

describe("render_model3d_reference", () => {
  it("stores the asset, the hash and the pass when a host can render", async () => {
    const before = withClip();
    const requests: unknown[] = [];
    const ctx: TimelineOpContext = {
      ...context(),
      renderModel3DReference: async (request) => {
        requests.push(request);
        expect(request.sequence).toEqual(SEQUENCE);
        expect(request.pass).toBe("depth");
        expect(request.dependencyHash).toBe(
          computeModel3DReferenceHash(before.clips[0], SEQUENCE, "depth")
        );
        return { assetId: REFERENCE_ASSET, jobId: "job_1" };
      }
    };
    const out = await applyTimelineOp(before, { ...render, pass: "depth" }, ctx);

    expect(out.error).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(out.result.referenceRendered).toBe(true);
    const clip = out.state.clips[0];
    expect(clip.model3dStyle?.reference).toEqual({
      assetId: REFERENCE_ASSET,
      dependencyHash: computeModel3DReferenceHash(clip, SEQUENCE, "depth"),
      pass: "depth"
    });
    expect(out.result.reference).toEqual(clip.model3dStyle?.reference);
    expect(model3dReferenceStatus(clip, SEQUENCE)).toBe("current");
    expect(out.result.cameraMove).toMatch(/^The camera /);
    expect(out.changedClipIds).toContain("clip_m");
    // The clip still draws its glTF and gains no take.
    expect(clip.currentAssetId).toBe("asset_glb");
    expect(clip.versions ?? []).toHaveLength(0);
  });

  it("defaults to the clay pass", async () => {
    const out = await applyTimelineOp(withClip(), render, {
      ...context(),
      renderModel3DReference: async (request) => {
        expect(request.pass).toBe("clay");
        return { assetId: REFERENCE_ASSET };
      }
    });
    expect(out.state.clips[0].model3dStyle?.reference?.pass).toBe("clay");
  });

  it("renders nothing when the stored reference is current", async () => {
    let calls = 0;
    const ctx: TimelineOpContext = {
      ...context(),
      renderModel3DReference: async () => {
        calls += 1;
        return { assetId: REFERENCE_ASSET };
      }
    };
    const first = await applyTimelineOp(withClip(), render, ctx);
    const second = await applyTimelineOp(first.state, render, ctx);
    expect(calls).toBe(1);
    expect(second.result.referenceRendered).toBe(false);
    expect(second.result.reference).toEqual(
      first.state.clips[0].model3dStyle?.reference
    );

    // Another pass of the same clip is a different video.
    const depth = await applyTimelineOp(first.state, { ...render, pass: "depth" }, ctx);
    expect(calls).toBe(2);
    expect(depth.result.referenceRendered).toBe(true);
  });

  it("leaves a stored bake current", async () => {
    const before = withClip({ background: { transparent: false, color: "#101010" } });
    const bakeHash = computeModel3DBakeHash(before.clips[0], SEQUENCE);
    const out = await applyTimelineOp(before, render, {
      ...context(),
      renderModel3DReference: async () => ({ assetId: REFERENCE_ASSET })
    });
    expect(computeModel3DBakeHash(out.state.clips[0], SEQUENCE)).toBe(bakeHash);
  });

  it("says so on a surface with no renderer", async () => {
    const out = await applyTimelineOp(withClip(), render, context());
    expect(out.error).toBeUndefined();
    expect(out.result.referenceRendered).toBe(false);
    expect(out.result.note).toMatch(/no 3D renderer/);
    expect(out.state.clips[0].model3dStyle?.reference).toBeUndefined();
  });

  it("refuses a clip that is not 3D, has no style, or has no asset", async () => {
    const notModel = withClip();
    notModel.clips[0] = { ...notModel.clips[0], mediaType: "video" };
    expect((await applyTimelineOp(notModel, render, context())).error).toMatch(
      /not a 3D clip/
    );

    const noStyle = withClip();
    noStyle.clips[0] = { ...noStyle.clips[0], model3dStyle: undefined };
    expect((await applyTimelineOp(noStyle, render, context())).error).toMatch(
      /no model3dStyle/
    );

    const noAsset = withClip();
    noAsset.clips[0] = { ...noAsset.clips[0], currentAssetId: undefined };
    expect((await applyTimelineOp(noAsset, render, context())).error).toMatch(
      /no glTF asset/
    );
  });
});
