import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOp } from "../src/ops/op.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";

function context(): TimelineOpContext {
  let n = 0;
  return {
    newId: (kind) => `${kind}_${++n}`,
    resolveAsset: async () => ({
      id: "asset1",
      name: "Loop",
      contentType: "audio/wav",
      durationMs: 1000
    })
  } as TimelineOpContext;
}

// 120 BPM 4/4 at offset 0: a bar is 2000 ms, a beat 500 ms.
function stateWith(clips = [riff()]): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 })],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: []
  };
}

function riff() {
  return makeClip({
    id: "riff",
    trackId: "keys",
    name: "Riff",
    startMs: 2000,
    durationMs: 4000,
    inPointMs: 0,
    mediaType: "midi",
    notes: [
      { id: "n1", pitch: 60, velocity: 100, startTick: 0, durationTick: MIDI_PPQ },
      { id: "n2", pitch: 62, velocity: 100, startTick: 3 * MIDI_PPQ, durationTick: 2 * MIDI_PPQ },
      { id: "n3", pitch: 64, velocity: 100, startTick: 5 * MIDI_PPQ, durationTick: MIDI_PPQ }
    ]
  });
}

async function run(op: TimelineOp, state = stateWith()) {
  return applyTimelineOp(state, op, context());
}

describe("split_clip on a midi clip", () => {
  it("partitions the notes and shortens a crossing note by default", async () => {
    // Bar 3 = 4000 ms = clip content 2000 ms = tick 3840.
    const out = await run({ op: "split_clip", target: "riff", atBar: 3 });
    expect(out.error).toBeUndefined();
    const [l, r] = out.state.clips;
    expect(l!.startMs).toBe(2000);
    expect(r!.startMs).toBe(4000);
    expect(l!.notes!.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(l!.notes![1]!.durationTick).toBe(MIDI_PPQ);
    expect(r!.notes!.map((n) => n.startTick)).toEqual([MIDI_PPQ]);
  });

  it("crossing split adds the rest of the note to the right clip", async () => {
    const out = await run({ op: "split_clip", target: "riff", atMs: 4000, crossing: "split" });
    const r = out.state.clips[1]!;
    expect(r.notes!.map((n) => [n.startTick, n.durationTick])).toEqual([
      [0, MIDI_PPQ],
      [MIDI_PPQ, MIDI_PPQ]
    ]);
  });

  it("resolves beat inside the bar and refuses ms together with a bar", async () => {
    const out = await run({ op: "split_clip", target: "riff", atBar: 2, beat: 3 });
    expect(out.state.clips[1]!.startMs).toBe(3000);
    const bad = await run({ op: "split_clip", target: "riff", atMs: 3000, atBar: 2 });
    expect(bad.error).toMatch(/atMs.*atBar|atBar.*atMs/);
  });
});

describe("duplicate_clip", () => {
  it("makes count copies back to back", async () => {
    const out = await run({ op: "duplicate_clip", target: "riff", count: 3 });
    expect(out.error).toBeUndefined();
    expect(out.state.clips.map((c) => c.startMs)).toEqual([2000, 6000, 10000, 14000]);
    expect((out.result as { clips?: unknown[] }).clips).toHaveLength(3);
  });

  it("places the first copy at a bar", async () => {
    const out = await run({ op: "duplicate_clip", target: "riff", count: 2, atBar: 5 });
    expect(out.state.clips.map((c) => c.startMs)).toEqual([2000, 8000, 12000]);
  });

  it("refuses a count outside 1..64", async () => {
    expect((await run({ op: "duplicate_clip", target: "riff", count: 65 })).error).toMatch(/count/);
    expect((await run({ op: "duplicate_clip", target: "riff", count: 0 })).error).toMatch(/count/);
  });
});

describe("bar addressing on clip ops", () => {
  it("move_clip atBar", async () => {
    const out = await run({ op: "move_clip", target: "riff", atBar: 4, beat: 2 });
    expect(out.state.clips[0]!.startMs).toBe(6500);
  });

  it("trim_clip atBar ends the clip at the bar", async () => {
    const out = await run({ op: "trim_clip", target: "riff", atBar: 3 });
    expect(out.state.clips[0]!.durationMs).toBe(2000);
  });

  it("add_media_clip atBar sets the start", async () => {
    const state = stateWith([]);
    state.tracks.push(makeTrack({ id: "aud", type: "audio", name: "Audio", index: 1 }));
    const out = await run({ op: "add_media_clip", asset: "asset1", trackId: "aud", atBar: 2 }, state);
    expect(out.error).toBeUndefined();
    expect(out.state.clips[0]!.startMs).toBe(2000);
  });
});
