import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { midiClipNoteEvents } from "../src/midi/events.js";
import { midiClipVoiceEvents, renderMidiClip } from "../src/midi/voice.js";
import { midiRenderKey } from "../src/midi/cacheKey.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import {
  applyMidiRegionParams,
  hasMidiRegionParams
} from "../src/midi/regionParams.js";
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
      { id: `${id}_a`, pitch: 60, velocity: 90, startTick: 0, durationTick: 480 },
      { id: `${id}_b`, pitch: 126, velocity: 5, startTick: 1010, durationTick: 480 }
    ],
    ...over
  });

async function run(s: TimelineOpState, tool: string, op: Record<string, unknown>) {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}

describe("CE6 region parameters: applyMidiRegionParams", () => {
  it("returns the clip unchanged without parameters", () => {
    const c = midi("m", 0);
    expect(hasMidiRegionParams(c)).toBe(false);
    expect(applyMidiRegionParams(c, 120)).toBe(c);
  });

  it("transposes, clamps to 0..127 and leaves the stored notes alone", () => {
    const c = midi("m", 0, { transpose: 12 });
    const out = applyMidiRegionParams(c, 120);
    expect(out.notes!.map((n) => n.pitch)).toEqual([72, 127]);
    expect(c.notes!.map((n) => n.pitch)).toEqual([60, 126]);
    expect(out.transpose).toBeUndefined();
  });

  it("offsets velocity and clamps to 1..127", () => {
    const out = applyMidiRegionParams(midi("m", 0, { velocityOffset: -20 }), 120);
    expect(out.notes!.map((n) => n.velocity)).toEqual([70, 1]);
    const up = applyMidiRegionParams(midi("m", 0, { velocityOffset: 60 }), 120);
    expect(up.notes!.map((n) => n.velocity)).toEqual([127, 65]);
  });

  it("quantizes onsets with a strength in percent", () => {
    // 1/16 = 240 ticks. Tick 1010 is 4.2 steps, so it snaps to 960.
    const full = applyMidiRegionParams(
      midi("m", 0, { quantize: { grid: "1/16", strength: 100 } }),
      120
    );
    expect(full.notes!.map((n) => n.startTick)).toEqual([0, 960]);
    const half = applyMidiRegionParams(
      midi("m", 0, { quantize: { grid: "1/16", strength: 50 } }),
      120
    );
    expect(half.notes!.map((n) => n.startTick)).toEqual([0, 985]);
  });
});

describe("CE6 playback and render follow the parameters", () => {
  const base = midi("m", 0);
  const shifted = midi("m", 0, { transpose: 7, velocityOffset: 10 });

  it("note events carry the transposed pitch and velocity", () => {
    const events = midiClipNoteEvents(shifted, 120).filter((e) => e.on);
    expect(events.map((e) => e.pitch)).toEqual([67, 127]);
    expect(events.map((e) => e.velocity)).toEqual([100, 15]);
  });

  it("voice events carry the quantized onset", () => {
    const q = midi("m", 0, { quantize: { grid: "1/16", strength: 100 } });
    const a = midiClipVoiceEvents(base, 120, 48000);
    const b = midiClipVoiceEvents(q, 120, 48000);
    expect(b[1]!.startFrame).not.toBe(a[1]!.startFrame);
    expect(b[1]!.startFrame).toBe(24000);
  });

  it("renders different audio for a transposed clip", () => {
    const input = { bpm: 120, instrument: DEFAULT_MIDI_INSTRUMENT, sampleRate: 8000 };
    const a = renderMidiClip({ clip: base, ...input });
    const b = renderMidiClip({ clip: shifted, ...input });
    expect(Array.from(b)).not.toEqual(Array.from(a));
  });

  it("the render cache key reads every parameter", () => {
    const input = { bpm: 120, instrument: DEFAULT_MIDI_INSTRUMENT, sampleRate: 8000 };
    const key = (c: TimelineClip) => midiRenderKey({ clip: c, ...input });
    const k0 = key(base);
    expect(key(midi("m", 0, { transpose: 1 }))).not.toBe(k0);
    expect(key(midi("m", 0, { velocityOffset: 1 }))).not.toBe(k0);
    expect(key(midi("m", 0, { quantize: { grid: "1/8", strength: 100 } }))).not.toBe(k0);
    expect(key(midi("m", 0, { transpose: 0 }))).toBe(k0);
  });

  it("a looped clip repeats the parameter-adjusted notes", () => {
    const looped = midi("m", 0, { transpose: 5, loopLengthMs: 1000, durationMs: 2000 });
    const events = midiClipNoteEvents(looped, 120).filter((e) => e.on);
    expect(events.length).toBeGreaterThan(1);
    expect(events.every((e) => e.pitch === 65 || e.pitch === 127)).toBe(true);
    expect(events.filter((e) => e.pitch === 65).length).toBe(2);
  });
});

describe("CE6 set_clip_params", () => {
  it("sets and clears the parameters", async () => {
    const s = state([midi("m", 0)]);
    const out = await run(s, "set_clip_params", {
      target: "m",
      transpose: -5,
      velocityOffset: 12,
      quantize: { grid: "1/8", strength: 75 }
    });
    const c = out.state.clips[0]!;
    expect(c.transpose).toBe(-5);
    expect(c.velocityOffset).toBe(12);
    expect(c.quantize).toEqual({ grid: "1/8", strength: 75 });
    expect(c.notes![0]!.pitch).toBe(60);
    const cleared = await run(out.state, "set_clip_params", {
      target: "m",
      transpose: null,
      velocityOffset: null,
      quantize: null
    });
    const d = cleared.state.clips[0]!;
    expect(d.transpose).toBeUndefined();
    expect(d.velocityOffset).toBeUndefined();
    expect(d.quantize).toBeUndefined();
  });

  it("refuses out of range values and non midi clips", async () => {
    const s = state([
      midi("m", 0),
      makeClip({ id: "au", trackId: "aud", name: "au", startMs: 0, durationMs: 1000, mediaType: "audio" })
    ]);
    await expect(run(s, "set_clip_params", { target: "m", transpose: 49 })).rejects.toThrow();
    await expect(run(s, "set_clip_params", { target: "m", velocityOffset: 128 })).rejects.toThrow();
    await expect(
      run(s, "set_clip_params", { target: "m", quantize: { grid: "1/16", strength: 101 } })
    ).rejects.toThrow();
    await expect(run(s, "set_clip_params", { target: "au", transpose: 2 })).rejects.toThrow(/midi/i);
  });

  it("get_state shows the parameters", async () => {
    const s = state([midi("m", 0, { transpose: 3, quantize: { grid: "1/16", strength: 50 } })]);
    const out = await run(s, "set_clip_params", { target: "m", velocityOffset: 4 });
    const shown = out.result.clip as Record<string, unknown>;
    expect(shown.transpose).toBe(3);
    expect(shown.velocityOffset).toBe(4);
    expect(shown.quantize).toEqual({ grid: "1/16", strength: 50 });
  });
});

describe("CE6 parameters survive loop, split, join and paste_range", () => {
  const params = {
    transpose: 2,
    velocityOffset: -3,
    quantize: { grid: "1/16", strength: 80 }
  } as const;

  it("split keeps transpose and velocity on both halves and writes quantize into the notes", async () => {
    const out = await run(state([midi("m", 0, params)]), "split_clip", {
      target: "m",
      atMs: 1000
    });
    expect(out.state.clips).toHaveLength(2);
    for (const c of out.state.clips) {
      expect(c.transpose).toBe(2);
      expect(c.velocityOffset).toBe(-3);
      expect(c.quantize).toBeUndefined();
    }
  });

  it("splitting a looped clip keeps them on every copy", async () => {
    const out = await run(
      state([midi("m", 0, { ...params, loopLengthMs: 1000 })]),
      "split_clip",
      { target: "m", atMs: 500 }
    );
    expect(out.state.clips.length).toBeGreaterThan(2);
    for (const c of out.state.clips) expect(c.transpose).toBe(2);
  });

  it("loop_clip keeps them", async () => {
    const out = await run(state([midi("m", 0, params)]), "loop_clip", {
      clip: "m",
      times: 2
    });
    expect(out.state.clips[0]!.transpose).toBe(2);
    expect(out.state.clips[0]!.loopLengthMs).toBe(2000);
  });

  it("join keeps shared transpose and velocity and writes quantize into the notes", async () => {
    const out = await run(state([midi("a", 0, params), midi("b", 2000, params)]), "join_clips", {
      clips: ["a", "b"]
    });
    const j = out.state.clips[0]!;
    expect(j.transpose).toBe(2);
    expect(j.velocityOffset).toBe(-3);
    expect(j.quantize).toBeUndefined();
    expect(j.notes!.map((n) => n.pitch)).toEqual([60, 126, 60, 126]);
  });

  it("join of clips with different parameters keeps what each one sounds like", async () => {
    const out = await run(
      state([midi("a", 0, { transpose: 2 }), midi("b", 2000)]),
      "join_clips",
      { clips: ["a", "b"] }
    );
    const j = out.state.clips[0]!;
    expect(j.transpose).toBeUndefined();
    expect(j.notes!.map((n) => n.pitch)).toEqual([62, 127, 60, 126]);
  });

  it("paste_range keeps them", async () => {
    const out = await run(state([]), "paste_range", {
      atMs: 4000,
      mode: "insert",
      content: { lengthMs: 2000, clips: [midi("src", 0, params)] }
    });
    const pasted = out.state.clips[0]!;
    expect(pasted.transpose).toBe(2);
    expect(pasted.quantize).toEqual({ grid: "1/16", strength: 80 });
  });
});

describe("CE6 round 2: quantize overlap trimming", () => {
  const q = { grid: "1/16" as const, strength: 100 };
  const note = (id: string, startTick: number, durationTick: number, over: Record<string, unknown> = {}) => ({
    id, pitch: 60, velocity: 90, startTick, durationTick, ...over
  });

  it("F21: a muted note does not shorten an audible note", () => {
    const c = midi("m", 0, { quantize: q, notes: [note("a", 0, 300), note("m", 305, 100, { muted: true })] });
    const out = applyMidiRegionParams(c, 120).notes!;
    expect(out.find((n) => n.id === "a")!.durationTick).toBe(300);
  });

  it("F22: a trimmed note keeps no expression point past its end", () => {
    const c = midi("m", 0, {
      quantize: q,
      notes: [
        note("a", 0, 300, { expression: { volume: [{ tick: 0, value: 1 }, { tick: 300, value: 0.5 }] } }),
        note("b", 305, 100)
      ]
    });
    const a = applyMidiRegionParams(c, 120).notes!.find((n) => n.id === "a")!;
    expect(a.durationTick).toBe(240);
    expect(a.expression!.volume!.every((p) => p.tick <= 240)).toBe(true);
  });

  it("F16: two notes quantized onto one tick do not overlap", () => {
    const c = midi("m", 0, { quantize: q, notes: [note("a", 0, 10), note("b", 20, 100)] });
    const out = applyMidiRegionParams(c, 120).notes!;
    expect(out.every((n) => n.durationTick > 0)).toBe(true);
    const sorted = [...out].sort((x, y) => x.startTick - y.startTick);
    for (let i = 0; i + 1 < sorted.length; i += 1) {
      expect(sorted[i]!.startTick + sorted[i]!.durationTick).toBeLessThanOrEqual(sorted[i + 1]!.startTick);
    }
  });
});
