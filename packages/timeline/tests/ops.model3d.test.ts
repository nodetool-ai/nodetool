/**
 * `add_model3d_clip` and `set_model3d_style` through `applyTimelineOp`.
 *
 * The op module is the one implementation the three hosts share (I11), so
 * placement, the defaults an under-specified call gets, and the merge depth of
 * a style patch are pinned here rather than in any host's own suite.
 */

import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_CLIP_DURATION_MS,
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeTrack
} from "../src/index.js";
import type { TimelineTrack } from "../src/types.js";

function context(): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}` };
}

function state(tracks: TimelineTrack[]): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips: [],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

const video = () =>
  makeTrack({ id: "track_v", type: "video", name: "Video 1", index: 0 });
const overlay = (id = "track_o", index = 1) =>
  makeTrack({ id, type: "overlay", name: `Overlay ${index}`, index });

describe("add_model3d_clip", () => {
  it("lands on the first overlay track", async () => {
    const before = state([
      video(),
      overlay("track_o1", 1),
      overlay("track_o2", 2)
    ]);
    const out = await applyTimelineOp(
      before,
      { op: "add_model3d_clip", assetId: "asset_glb" },
      context()
    );
    expect(out.error).toBeUndefined();
    expect(out.state.clips).toHaveLength(1);
    expect(out.state.clips[0].trackId).toBe("track_o1");
  });

  it("creates an overlay track when the sequence has none", async () => {
    const before = state([video()]);
    const out = await applyTimelineOp(
      before,
      { op: "add_model3d_clip", assetId: "asset_glb" },
      context()
    );
    expect(out.error).toBeUndefined();
    const created = out.state.tracks.at(-1)!;
    expect(created.type).toBe("overlay");
    expect(out.state.clips[0].trackId).toBe(created.id);
  });

  it("puts the clip on the track the caller named", async () => {
    const before = state([video(), overlay()]);
    const out = await applyTimelineOp(
      before,
      { op: "add_model3d_clip", assetId: "asset_glb", trackId: "track_v" },
      context()
    );
    expect(out.error).toBeUndefined();
    expect(out.state.clips[0].trackId).toBe("track_v");
  });

  it("defaults the duration and the whole style, and keeps the asset", async () => {
    const before = state([overlay()]);
    const out = await applyTimelineOp(
      before,
      { op: "add_model3d_clip", assetId: "asset_glb" },
      context()
    );
    const clip = out.state.clips[0];
    expect(clip.durationMs).toBe(DEFAULT_MODEL3D_CLIP_DURATION_MS);
    expect(clip.mediaType).toBe("model3d");
    expect(clip.currentAssetId).toBe("asset_glb");
    expect(clip.model3dStyle).toEqual(DEFAULT_MODEL3D_STYLE);
  });

  it("merges the caller's style over the defaults", async () => {
    const before = state([overlay()]);
    const out = await applyTimelineOp(
      before,
      {
        op: "add_model3d_clip",
        assetId: "asset_glb",
        style: { camera: { azimuthDeg: 200 }, lighting: "flat" }
      },
      context()
    );
    const style = out.state.clips[0].model3dStyle!;
    expect(style.camera.azimuthDeg).toBe(200);
    expect(style.camera.elevationDeg).toBe(
      DEFAULT_MODEL3D_STYLE.camera.elevationDeg
    );
    expect(style.lighting).toBe("flat");
  });

  it("refuses a call with no asset to draw", async () => {
    const before = state([overlay()]);
    const out = await applyTimelineOp(
      before,
      { op: "add_model3d_clip", assetId: "   " },
      context()
    );
    expect(out.error).toContain("asset id");
    expect(out.state.clips).toHaveLength(0);
  });
});

describe("set_model3d_style", () => {
  const seeded = (): TimelineOpState => {
    const s = state([overlay()]);
    s.clips.push(
      makeClip({
        id: "clip_m",
        trackId: "track_o",
        name: "3D model",
        startMs: 0,
        durationMs: 4000,
        mediaType: "model3d",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "asset_glb",
        model3dStyle: {
          ...DEFAULT_MODEL3D_STYLE,
          camera: { ...DEFAULT_MODEL3D_STYLE.camera, zoom: 1.5 },
          lightIntensity: 2
        }
      })
    );
    return s;
  };

  it("patches the named fields and leaves the rest of the camera alone", async () => {
    const out = await applyTimelineOp(
      seeded(),
      {
        op: "set_model3d_style",
        target: "clip_m",
        patch: { camera: { azimuthDeg: 90 } }
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const style = out.state.clips[0].model3dStyle!;
    expect(style.camera).toEqual({
      ...DEFAULT_MODEL3D_STYLE.camera,
      azimuthDeg: 90,
      zoom: 1.5
    });
    expect(style.lightIntensity).toBe(2);
    expect(style.animation).toEqual(DEFAULT_MODEL3D_STYLE.animation);
    expect(style.background).toEqual(DEFAULT_MODEL3D_STYLE.background);
  });

  it("patches the animation block without touching the camera", async () => {
    const out = await applyTimelineOp(
      seeded(),
      {
        op: "set_model3d_style",
        target: "clip_m",
        patch: { animation: { loop: false } }
      },
      context()
    );
    const style = out.state.clips[0].model3dStyle!;
    expect(style.animation).toEqual({
      ...DEFAULT_MODEL3D_STYLE.animation,
      loop: false
    });
    expect(style.camera.zoom).toBe(1.5);
  });

  it("replaces the background whole, since half of one is not a background", async () => {
    const out = await applyTimelineOp(
      seeded(),
      {
        op: "set_model3d_style",
        target: "clip_m",
        patch: { background: { transparent: false, color: "#101418" } }
      },
      context()
    );
    expect(out.state.clips[0].model3dStyle!.background).toEqual({
      transparent: false,
      color: "#101418"
    });
  });

  it("refuses a clip that is not 3D", async () => {
    const s = state([overlay()]);
    s.clips.push(
      makeClip({
        id: "clip_t",
        trackId: "track_o",
        name: "Title",
        startMs: 0,
        durationMs: 2000,
        mediaType: "text",
        sourceType: "imported",
        status: "generated",
        textStyle: { text: "Hi" }
      })
    );
    const out = await applyTimelineOp(
      s,
      {
        op: "set_model3d_style",
        target: "clip_t",
        patch: { lighting: "soft" }
      },
      context()
    );
    expect(out.error).toContain("not a 3D clip");
    expect(out.state.clips[0].model3dStyle).toBeUndefined();
  });
});

describe("bake_model3d_clip", () => {
  /** A sequence holding one opaque 3D clip, ready to bake. */
  function withClip(
    style: Partial<typeof DEFAULT_MODEL3D_STYLE> = {}
  ): TimelineOpState {
    const before = state([overlay()]);
    before.clips.push(
      makeClip({
        id: "clip_m",
        trackId: "track_o",
        name: "Model",
        startMs: 0,
        durationMs: 2000,
        mediaType: "model3d",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "asset_glb",
        model3dStyle: {
          ...DEFAULT_MODEL3D_STYLE,
          background: { transparent: false, color: "#101010" },
          ...style
        }
      })
    );
    return before;
  }

  const bake = { op: "bake_model3d_clip" as const, target: "clip_m" };

  it("stores the bake, its hash and a version when a host can render", async () => {
    const before = withClip();
    const ctx: TimelineOpContext = {
      ...context(),
      now: () => "2026-01-01T00:00:00.000Z",
      bakeModel3DClip: async (request) => {
        // The op hands over the hash it checked, so the host cannot store one
        // taken from a clip that has moved on.
        expect(request.sequence).toEqual({ fps: 30, width: 1920, height: 1080 });
        expect(request.dependencyHash).toBe(
          computeModel3DBakeHash(before.clips[0], request.sequence)
        );
        return { assetId: "asset_mp4", jobId: "job_1" };
      }
    };
    const out = await applyTimelineOp(before, bake, ctx);

    expect(out.error).toBeUndefined();
    expect(out.result.bakeStarted).toBe(true);
    const clip = out.state.clips[0];
    expect(clip.model3dStyle?.bake).toEqual({
      assetId: "asset_mp4",
      dependencyHash: computeModel3DBakeHash(clip, {
        fps: 30,
        width: 1920,
        height: 1080
      })
    });
    expect(clip.versions).toHaveLength(1);
    expect(clip.versions?.[0]).toMatchObject({
      assetId: "asset_mp4",
      jobId: "job_1",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(out.changedClipIds).toContain("clip_m");
  });

  it("says so instead of pretending, on a surface with no renderer", async () => {
    const out = await applyTimelineOp(withClip(), bake, context());
    expect(out.error).toBeUndefined();
    expect(out.result.bakeStarted).toBe(false);
    expect(out.result.note).toMatch(/no Blender renderer/);
    expect(out.state.clips[0].model3dStyle?.bake).toBeUndefined();
  });

  it("bakes a transparent style too, now that alpha has an encode (T13)", async () => {
    const out = await applyTimelineOp(
      withClip({ background: { transparent: true } }),
      bake,
      {
        ...context(),
        bakeModel3DClip: async () => ({ assetId: "asset_webm" })
      }
    );
    expect(out.error).toBeUndefined();
    expect(out.result.bakeStarted).toBe(true);
    expect(out.state.clips[0].model3dStyle?.bake?.assetId).toBe("asset_webm");
  });

  it("refuses a clip that is not 3D, and one with no model", async () => {
    const notThreeD = state([overlay()]);
    notThreeD.clips.push(
      makeClip({
        id: "clip_m",
        trackId: "track_o",
        name: "Title",
        startMs: 0,
        durationMs: 1000,
        mediaType: "text",
        sourceType: "imported",
        status: "generated"
      })
    );
    expect((await applyTimelineOp(notThreeD, bake, context())).error).toMatch(
      /not a 3D clip/
    );

    const noModel = withClip();
    noModel.clips[0].currentAssetId = undefined;
    expect((await applyTimelineOp(noModel, bake, context())).error).toMatch(
      /no glTF asset/
    );
  });
});

describe("list_animation_presets", () => {
  it("offers orbit from the catalog rather than a hand-written list", async () => {
    const out = await applyTimelineOp(
      state([]),
      { op: "list_animation_presets" },
      context()
    );
    const presets = out.result.presets as Array<{
      id: string;
      roles: string[];
      params: Array<{ name: string; default?: unknown }>;
    }>;
    const orbit = presets.find((p) => p.id === "orbit");
    expect(orbit?.roles).toContain("loop");
    expect(orbit?.params.map((p) => p.name)).toEqual(["degrees", "direction"]);
  });
});
