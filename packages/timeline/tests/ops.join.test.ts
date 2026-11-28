import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

function state(
  clips: TimelineClip[],
  extra: Partial<TimelineOpState> = {}
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...extra
  } as TimelineOpState;
}

// 120 BPM: one beat = 500 ms = 960 ticks.
const midi = (id: string, startMs: number, over: Partial<TimelineClip> = {}) =>
  makeClip({
    id,
    trackId: "keys",
    name: id,
    startMs,
    durationMs: 2000,
    mediaType: "midi",
    notes: [
      { id: `${id}_n`, pitch: 60, velocity: 90, startTick: 0, durationTick: 480 }
    ],
    ...over
  });

const audio = (id: string, startMs: number, inPointMs: number, over: Partial<TimelineClip> = {}) =>
  makeClip({
    id,
    trackId: "aud",
    name: id,
    startMs,
    durationMs: 1000,
    inPointMs,
    outPointMs: inPointMs + 1000,
    mediaType: "audio",
    sourceType: "imported",
    currentAssetId: "asset_1",
    ...over
  });

async function run(s: TimelineOpState, op: Record<string, unknown>, tool = "join_clips") {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}

describe("join_clips", () => {
  it("joins midi clips from first start to last end and re-bases notes", async () => {
    const out = await run(state([midi("a", 0), midi("b", 3000)]), {
      clips: ["a", "b"]
    });
    expect(out.state.clips).toHaveLength(1);
    const joined = out.state.clips[0]!;
    expect(joined.startMs).toBe(0);
    expect(joined.durationMs).toBe(5000);
    expect(joined.inPointMs ?? 0).toBe(0);
    // b starts 3000 ms = 5760 ticks after a.
    expect(joined.notes!.map((n) => n.startTick)).toEqual([0, 5760]);
    expect(new Set(joined.notes!.map((n) => n.id)).size).toBe(2);
  });

  it("takes harmony and name from the first clip and orders by start", async () => {
    const harmony = { mode: "off" } as never;
    const out = await run(
      state([midi("b", 3000, { harmony: undefined }), midi("a", 0, { harmony })]),
      { clips: ["b", "a"] }
    );
    const joined = out.state.clips[0]!;
    expect(joined.name).toBe("a");
    expect(joined.harmony).toEqual(harmony);
  });

  it("drops hidden notes outside each clip window", async () => {
    const a = midi("a", 0, {
      inPointMs: 500,
      durationMs: 1000,
      notes: [
        { id: "hid", pitch: 60, velocity: 90, startTick: 0, durationTick: 240 },
        { id: "vis", pitch: 62, velocity: 90, startTick: 960, durationTick: 240 }
      ]
    });
    const out = await run(state([a, midi("b", 1000)]), { clips: ["a", "b"] });
    const ticks = out.state.clips[0]!.notes!.map((n) => [n.id, n.startTick]);
    // vis sits 0 ticks into a's window, b starts at 1000 ms = 1920 ticks.
    expect(ticks).toEqual([
      ["vis", 0],
      ["b_n", 1920]
    ]);
  });

  it("joins the selected clips when clips is omitted", async () => {
    const out = await run(
      state([midi("a", 0), midi("b", 2000)], { selectedClipIds: ["a", "b"] }),
      {}
    );
    expect(out.state.clips).toHaveLength(1);
  });

  it("unrolls a looped clip before it joins (D47)", async () => {
    const looped = midi("a", 0, { durationMs: 4000, loopLengthMs: 2000 });
    const out = await run(state([looped, midi("b", 4000)]), { clips: ["a", "b"] });
    const joined = out.state.clips[0]!;
    expect(joined.loopLengthMs).toBeUndefined();
    expect(joined.durationMs).toBe(6000);
    expect(joined.notes!.map((n) => n.startTick)).toEqual([0, 3840, 7680]);
  });

  it("refuses clips on different tracks, a lone clip and a locked clip", async () => {
    await expect(
      run(state([midi("a", 0), midi("b", 2000, { trackId: "aud" })]), { clips: ["a", "b"] })
    ).rejects.toThrow(/one track/);
    await expect(run(state([midi("a", 0)]), { clips: ["a"] })).rejects.toThrow(/two/);
    await expect(
      run(state([midi("a", 0, { locked: true }), midi("b", 2000)]), { clips: ["a", "b"] })
    ).rejects.toThrow(/locked/);
  });

  it("joins audio pieces of one source with continuous source time", async () => {
    const out = await run(
      state([audio("a", 0, 0, { fadeOutMs: 50 }), audio("b", 1000, 1000, { fadeOutMs: 200 })]),
      { clips: ["a", "b"] }
    );
    const joined = out.state.clips[0]!;
    expect(joined.durationMs).toBe(2000);
    expect(joined.inPointMs).toBe(0);
    expect(joined.outPointMs).toBe(2000);
    expect(joined.fadeOutMs).toBe(200);
  });

  it("refuses other audio joins with needs bounce", async () => {
    await expect(
      run(state([audio("a", 0, 0), audio("b", 1000, 5000)]), { clips: ["a", "b"] })
    ).rejects.toThrow(/needs bounce/);
    await expect(
      run(state([audio("a", 0, 0), audio("b", 1500, 1000)]), { clips: ["a", "b"] })
    ).rejects.toThrow(/needs bounce/);
    await expect(
      run(
        state([audio("a", 0, 0), audio("b", 1000, 1000, { currentAssetId: "asset_2" })]),
        { clips: ["a", "b"] }
      )
    ).rejects.toThrow(/needs bounce/);
  });
});

describe("set_clip_params labelColor and name", () => {
  it("sets and clears labelColor", async () => {
    const set = await run(
      state([midi("a", 0)]),
      { target: "a", patch: { labelColor: "#ff8800" } },
      "set_clip_params"
    );
    expect(set.state.clips[0]!.labelColor).toBe("#ff8800");
    expect(set.result.clip.labelColor).toBe("#ff8800");
    const cleared = await run(
      set.state,
      { target: "a", patch: { labelColor: null } },
      "set_clip_params"
    );
    expect(cleared.state.clips[0]!.labelColor).toBeUndefined();
  });

  it("renames any clip", async () => {
    const out = await run(
      state([audio("a", 0, 0)]),
      { target: "a", patch: { name: "Verse" } },
      "set_clip_params"
    );
    expect(out.state.clips[0]!.name).toBe("Verse");
  });
});

describe("join_clips round 2", () => {
  it("F27: differently transposed poly pressure lanes stay on their own pitch", async () => {
    const lane = (id: string) => ({
      id,
      kind: "polyPressure" as const,
      pitch: 60,
      points: [{ id: `${id}_p`, tick: 0, value: 50 }]
    });
    const out = await run(
      state([
        midi("a", 0, { transpose: 2, controllers: [lane("la")] }),
        midi("b", 3000, { transpose: 7, controllers: [lane("lb")] })
      ]),
      { clips: ["a", "b"] }
    );
    const pitches = out.state.clips[0]!.controllers!
      .filter((l) => l.kind === "polyPressure")
      .map((l) => l.pitch)
      .sort();
    expect(pitches).toEqual([62, 67]);
  });
});
