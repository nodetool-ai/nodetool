/**
 * Pins the behavior of `trim_clip` and `move_clip` (OpScope.applyTrim and
 * applyMove) across single clips, linked partners and groups.
 */

import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOp } from "../src/ops/op.js";
import type { TimelineOpState } from "../src/ops/types.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

const tracks = (): TimelineTrack[] => [
  makeTrack({ id: "tv", type: "video", name: "Video", index: 0 }),
  makeTrack({ id: "tv2", type: "video", name: "Video 2", index: 1 }),
  makeTrack({ id: "ta", type: "audio", name: "Audio", index: 2 }),
  makeTrack({
    id: "tl",
    type: "video",
    name: "Locked",
    index: 3,
    locked: true
  })
];

function clip(overrides: Partial<TimelineClip>): TimelineClip {
  return makeClip({
    id: "v",
    trackId: "tv",
    name: "Shot",
    startMs: 1000,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_v",
    ...overrides
  });
}

function state(clips: TimelineClip[]): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: tracks(),
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

async function run(s: TimelineOpState, op: TimelineOp) {
  let n = 0;
  return applyTimelineOp(s, op, { newId: (kind) => `${kind}_${++n}` });
}

const get = (s: TimelineOpState, id: string) =>
  s.clips.find((c) => c.id === id)!;

describe("move_clip", () => {
  it("is a no-op with neither startMs nor trackId", async () => {
    const out = await run(state([clip({})]), { op: "move_clip", target: "v" });
    expect(out.error).toBeUndefined();
    expect(out.changedClipIds).toEqual([]);
    expect(get(out.state, "v").startMs).toBe(1000);
  });

  it("clamps a single clip's start at zero", async () => {
    const out = await run(state([clip({})]), {
      op: "move_clip",
      target: "v",
      startMs: -50
    });
    expect(get(out.state, "v").startMs).toBe(0);
    expect(out.changedClipIds).toEqual(["v"]);
  });

  it("changes only the track when no start is given", async () => {
    const out = await run(state([clip({})]), {
      op: "move_clip",
      target: "v",
      trackId: "tv2"
    });
    expect(get(out.state, "v")).toMatchObject({
      startMs: 1000,
      trackId: "tv2"
    });
    expect(out.changedClipIds).toEqual(["v"]);
  });

  it("moves start and track together", async () => {
    const out = await run(state([clip({})]), {
      op: "move_clip",
      target: "v",
      startMs: 4000,
      trackId: "Video 2"
    });
    expect(get(out.state, "v")).toMatchObject({
      startMs: 4000,
      trackId: "tv2"
    });
  });

  it("refuses a locked destination and leaves the clip alone", async () => {
    const out = await run(state([clip({})]), {
      op: "move_clip",
      target: "v",
      startMs: 5000,
      trackId: "tl"
    });
    expect(out.error).toMatch(/locked/);
    expect(get(out.state, "v").startMs).toBe(1000);
  });

  it("refuses a track the clip type cannot sit on", async () => {
    const out = await run(state([clip({})]), {
      op: "move_clip",
      target: "v",
      trackId: "ta"
    });
    expect(out.error).toMatch(/cannot go on audio track "Audio"/);
  });

  it("shifts linked partners by one delta, clamped by the earliest", async () => {
    const s = state([
      clip({ linkId: "l", startMs: 1000 }),
      clip({
        id: "a",
        trackId: "ta",
        mediaType: "audio",
        linkId: "l",
        startMs: 400
      })
    ]);
    const out = await run(s, {
      op: "move_clip",
      target: "v",
      startMs: 100,
      trackId: "tv2"
    });
    expect(get(out.state, "v")).toMatchObject({ startMs: 600, trackId: "tv2" });
    expect(get(out.state, "a")).toMatchObject({ startMs: 0, trackId: "ta" });
    expect(new Set(out.changedClipIds)).toEqual(new Set(["v", "a"]));
  });

  it("moves a group and its children by the same delta", async () => {
    const s = state([
      clip({
        id: "g",
        mediaType: "group",
        startMs: 1000,
        currentAssetId: undefined
      }),
      clip({ id: "c1", parentId: "g", startMs: 1200 }),
      clip({ id: "c2", parentId: "g", startMs: 1500 })
    ]);
    const out = await run(s, { op: "move_clip", target: "g", startMs: 3000 });
    expect(get(out.state, "g").startMs).toBe(3000);
    expect(get(out.state, "c1").startMs).toBe(3200);
    expect(get(out.state, "c2").startMs).toBe(3500);
    expect(new Set(out.changedClipIds)).toEqual(new Set(["g", "c1", "c2"]));
  });

  it("moves a group to a new track without moving its children's tracks", async () => {
    const s = state([
      clip({ id: "g", mediaType: "group", currentAssetId: undefined }),
      clip({ id: "c1", parentId: "g" })
    ]);
    const out = await run(s, { op: "move_clip", target: "g", trackId: "tv2" });
    expect(get(out.state, "g")).toMatchObject({
      trackId: "tv2",
      startMs: 1000
    });
    expect(get(out.state, "c1")).toMatchObject({
      trackId: "tv",
      startMs: 1000
    });
    expect(out.changedClipIds).toEqual(["g"]);
  });
});

describe("trim_clip", () => {
  it("is a no-op with no fields", async () => {
    const out = await run(state([clip({})]), { op: "trim_clip", target: "v" });
    expect(out.error).toBeUndefined();
    expect(out.changedClipIds).toEqual([]);
  });

  it("rejects a negative in-point", async () => {
    const out = await run(state([clip({})]), {
      op: "trim_clip",
      target: "v",
      inPointMs: -1
    });
    expect(out.error).toBe("inPointMs cannot be negative.");
  });

  it("rejects an out-point not after the in-point", async () => {
    const out = await run(state([clip({})]), {
      op: "trim_clip",
      target: "v",
      inPointMs: 500,
      outPointMs: 500
    });
    expect(out.error).toBe("outPointMs must be greater than inPointMs.");
  });

  it("rejects an out-point past a known source end", async () => {
    const s = state([clip({})]);
    let n = 0;
    const out = await applyTimelineOp(
      s,
      { op: "trim_clip", target: "v", outPointMs: 3000 },
      {
        newId: (k) => `${k}_${++n}`,
        resolveAsset: async () => ({ durationMs: 2500 }) as never
      }
    );
    expect(out.error).toBe(
      "outPointMs 3000 is past the end of the source (2500ms)."
    );
  });

  it("rejects in/out points on a group", async () => {
    const out = await run(
      state([clip({ id: "g", mediaType: "group", currentAssetId: undefined })]),
      { op: "trim_clip", target: "g", inPointMs: 10 }
    );
    expect(out.error).toBe(
      "Groups carry no source media; trim their duration instead."
    );
  });

  it("rejects a zero duration", async () => {
    const out = await run(state([clip({})]), {
      op: "trim_clip",
      target: "v",
      durationMs: 0
    });
    expect(out.error).toBe("trimClip would result in a non-positive duration");
  });

  it("shortens a single clip and its source out-point", async () => {
    const out = await run(state([clip({})]), {
      op: "trim_clip",
      target: "v",
      durationMs: 1000
    });
    expect(get(out.state, "v")).toMatchObject({
      durationMs: 1000,
      outPointMs: 1000
    });
    expect(out.changedClipIds).toEqual(["v"]);
  });

  it("applies explicit in and out points alongside a duration", async () => {
    const out = await run(state([clip({})]), {
      op: "trim_clip",
      target: "v",
      durationMs: 1000,
      inPointMs: 200,
      outPointMs: 1200
    });
    expect(get(out.state, "v")).toMatchObject({
      durationMs: 1000,
      inPointMs: 200,
      outPointMs: 1200
    });
  });

  it("sets an out-point alone", async () => {
    const out = await run(state([clip({})]), {
      op: "trim_clip",
      target: "v",
      outPointMs: 1500
    });
    expect(get(out.state, "v")).toMatchObject({
      durationMs: 2000,
      inPointMs: 0,
      outPointMs: 1500
    });
    expect(out.changedClipIds).toEqual(["v"]);
  });

  it("trims linked partners' ends by the same delta", async () => {
    const s = state([
      clip({ linkId: "l" }),
      clip({ id: "a", trackId: "ta", mediaType: "audio", linkId: "l" })
    ]);
    const out = await run(s, {
      op: "trim_clip",
      target: "v",
      durationMs: 1500
    });
    expect(get(out.state, "v").durationMs).toBe(1500);
    expect(get(out.state, "a").durationMs).toBe(1500);
    expect(new Set(out.changedClipIds)).toEqual(new Set(["v", "a"]));
  });

  it("refuses a linked trim that would remove a partner", async () => {
    const s = state([
      clip({ linkId: "l" }),
      clip({
        id: "a",
        trackId: "ta",
        mediaType: "audio",
        linkId: "l",
        durationMs: 300,
        outPointMs: 300
      })
    ]);
    const out = await run(s, {
      op: "trim_clip",
      target: "v",
      durationMs: 1500
    });
    expect(out.error).toMatch(/Linked trim would remove a clip/);
    expect(get(out.state, "v").durationMs).toBe(2000);
  });

  it("slips an in-point alone and refuses a partner with no source to slip into", async () => {
    const s = state([
      clip({ linkId: "l", inPointMs: 500, outPointMs: 2500 }),
      clip({
        id: "a",
        trackId: "ta",
        mediaType: "audio",
        linkId: "l",
        inPointMs: 100,
        outPointMs: 2100
      })
    ]);
    const out = await run(s, { op: "trim_clip", target: "v", inPointMs: 0 });
    expect(out.error).toMatch(/Linked clip "Shot" has no source before/);
  });

  it("shortens a group and pulls its children inside", async () => {
    const s = state([
      clip({ id: "g", mediaType: "group", currentAssetId: undefined }),
      clip({ id: "c1", parentId: "g", startMs: 1000, durationMs: 2000 })
    ]);
    const out = await run(s, {
      op: "trim_clip",
      target: "g",
      durationMs: 1000
    });
    expect(get(out.state, "g").durationMs).toBe(1000);
    expect(get(out.state, "c1").durationMs).toBe(1000);
    expect(new Set(out.changedClipIds)).toEqual(new Set(["g", "c1"]));
  });
});
