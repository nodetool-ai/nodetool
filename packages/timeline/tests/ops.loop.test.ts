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

function state(clips: TimelineClip[]): TimelineOpState {
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
    ...({} as object)
  };
}

const midi = (over: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "m",
    trackId: "keys",
    name: "m",
    startMs: 2000,
    durationMs: 2000,
    mediaType: "midi",
    notes: [{ id: "n", pitch: 60, velocity: 90, startTick: 0, durationTick: 960 }],
    ...over
  });

async function run(s: TimelineOpState, op: Record<string, unknown>, tool = "loop_clip") {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}

describe("loop_clip", () => {
  it("times extends the clip by whole windows and sets loopLengthMs", async () => {
    const out = await run(state([midi()]), { clip: "m", times: 4 });
    expect(out.state.clips[0]!.durationMs).toBe(8000);
    expect(out.state.clips[0]!.loopLengthMs).toBe(2000);
    expect(out.result.loopRepeats).toBe(4);
  });

  it("untilBar resolves through the tempo map", async () => {
    // 120 BPM 4/4: bar 5 starts at 8000, the clip starts at 2000.
    const out = await run(state([midi()]), { clip: "m", untilBar: 5 });
    expect(out.state.clips[0]!.durationMs).toBe(6000);
    expect(out.state.clips[0]!.loopLengthMs).toBe(2000);
  });

  it("untilMs with an explicit window", async () => {
    const out = await run(state([midi()]), { clip: "m", loopLengthMs: 1000, untilMs: 5000 });
    expect(out.state.clips[0]!.durationMs).toBe(3000);
    expect(out.state.clips[0]!.loopLengthMs).toBe(1000);
  });

  it("loopLengthMs: null removes the loop and keeps the length", async () => {
    const out = await run(state([midi({ durationMs: 8000, loopLengthMs: 2000 })]), {
      clip: "m",
      loopLengthMs: null
    });
    expect(out.state.clips[0]!.loopLengthMs).toBeUndefined();
    expect(out.state.clips[0]!.durationMs).toBe(8000);
  });

  it("refuses a clip that cannot loop and conflicting ends", async () => {
    const image = makeClip({ id: "t", trackId: "keys", name: "t", startMs: 0, durationMs: 1000, mediaType: "image" });
    await expect(run(state([image]), { clip: "t", times: 2 })).rejects.toThrow(/Only a midi or audio/);
    await expect(run(state([midi()]), { clip: "m", times: 2, untilBar: 3 })).rejects.toThrow(/not several/);
  });

  it("get_state shows loopLengthMs and the repeat count", async () => {
    const out = await run(state([midi({ durationMs: 6000, loopLengthMs: 2000 })]), {}, "get_state");
    const clips = (out.result as { clips: Array<Record<string, unknown>> }).clips;
    expect(clips[0]!.loopLengthMs).toBe(2000);
    expect(clips[0]!.loopRepeats).toBe(3);
  });

  it("split unrolls a looped clip into plain copies and cuts one", async () => {
    const out = await run(
      state([midi({ durationMs: 6000, loopLengthMs: 2000 })]),
      { target: "m", atMs: 5000 },
      "split_clip"
    );
    expect(out.state.clips.map((c) => [c.startMs, c.durationMs, c.loopLengthMs])).toEqual([
      [2000, 2000, undefined],
      [4000, 1000, undefined],
      [5000, 1000, undefined],
      [6000, 2000, undefined]
    ]);
  });
});
