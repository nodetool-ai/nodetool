/**
 * Clip editing interactions with Step Sequencer pattern regions (SQ23–SQ26).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  midiClipNoteEvents,
  normalizePattern,
  patternFromText,
  splitClip,
  trimClip,
  type StepPattern,
  type StepRow,
  type TimelineClip
} from "../src/index.js";
import { applyTimelineOp, readSectionContent, type TimelineOpState } from "../src/ops/index.js";
import { directContext } from "../src/testing/ops.js";

const BAR_MS = 2000; // 120 BPM, 4/4

function patClip(
  id: string,
  pattern: StepPattern,
  overrides: Partial<TimelineClip> = {}
): TimelineClip {
  return makeClip({
    id,
    trackId: "t_midi",
    name: overrides.name ?? id,
    startMs: overrides.startMs ?? 0,
    durationMs: overrides.durationMs ?? BAR_MS,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    pattern,
    ...overrides
  });
}

function makeState(clips: TimelineClip[]): TimelineOpState {
  return {
    tempo: DEFAULT_TEMPO,
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({
        id: "t_midi",
        type: "midi",
        name: "Drums",
        index: 0,
        instrument: DEFAULT_MIDI_INSTRUMENT
      })
    ],
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

describe("SQ23–SQ26: clip editing interactions on pattern regions", () => {
  it("SQ23: split at beat 3 of a 1-bar pattern renders the exact same notes as before", async () => {
    const chanceRow: StepRow = {
      id: "r_hat",
      assignment: { type: "note", pitch: 42 },
      mute: false,
      solo: false,
      lengthSteps: 16,
      loopStart: 0,
      loopEnd: 16,
      stepRate: "1/16",
      playback: "forward",
      midiChannel: 1,
      automationMode: "latch",
      subrows: ["velocity", "gate"],
      steps: Array.from({ length: 16 }, () => ({ on: true, chance: 60 }))
    };
    const base = patternFromText("Kick: x... x... x... x...", { seed: 7 });
    const pat: StepPattern = normalizePattern({
      ...base,
      seed: 7,
      rows: [...base.rows, chanceRow]
    });
    const orig = patClip("c1", pat);
    const beforeNotes = midiClipNoteEvents(orig, 120).filter((e) => e.on);

    // Beat 3 in 4/4 at 120 BPM = 1000 ms (1920 ticks).
    const [left, right] = splitClip(orig, 1000, { bpm: 120 });
    expect(left.pattern).toEqual(pat);
    expect(right.pattern).toEqual(pat);
    expect(left.notes).toBeUndefined();
    expect(right.notes).toBeUndefined();
    expect(left.patternPhaseTicks ?? 0).toBe(0);
    expect(right.patternPhaseTicks).toBe(1920);

    const afterNotes = [
      ...midiClipNoteEvents(left, 120).filter((e) => e.on),
      ...midiClipNoteEvents(right, 120).filter((e) => e.on)
    ].sort((a, b) => a.timeMs - b.timeMs || a.pitch - b.pitch);
    expect(afterNotes).toEqual(beforeNotes);
  });

  it("SQ24: touching equal pattern clips join into one pattern region; pattern + MIDI joins as MIDI", async () => {
    const pat = patternFromText("Kick: x... x... x... x...");
    const a = patClip("a", pat, { startMs: 0, durationMs: BAR_MS });
    const b = patClip("b", structuredClone(pat), {
      startMs: BAR_MS,
      durationMs: BAR_MS,
      patternPhaseTicks: 3840
    });
    const s1 = makeState([a, b]);
    const res1 = await applyTimelineOp(
      s1,
      { op: "join_clips", clips: ["a", "b"] },
      directContext(s1)
    );
    expect(res1.error).toBeUndefined();
    expect(res1.state.clips).toHaveLength(1);
    const joinedPat = res1.state.clips[0]!;
    expect(joinedPat.pattern).toEqual(pat);
    expect(joinedPat.notes).toBeUndefined();
    expect(joinedPat.durationMs).toBe(2 * BAR_MS);

    // Join pattern region with plain MIDI clip -> converts pattern to MIDI and joins.
    const midi = makeClip({
      id: "m",
      trackId: "t_midi",
      name: "Fill",
      startMs: BAR_MS,
      durationMs: BAR_MS,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [{ id: "n1", pitch: 38, velocity: 110, startTick: 0, durationTick: 240 }]
    });
    const s2 = makeState([a, midi]);
    const res2 = await applyTimelineOp(
      s2,
      { op: "join_clips", clips: ["a", "m"] },
      directContext(s2)
    );
    expect(res2.error).toBeUndefined();
    expect(res2.result.convertedToMidi).toBe(true);
    const merged = res2.state.clips[0]!;
    expect(merged.pattern).toBeUndefined();
    const expectedOns = [
      ...midiClipNoteEvents(a, 120).filter((e) => e.on),
      ...midiClipNoteEvents(midi, 120).filter((e) => e.on)
    ].map((e) => [e.pitch, e.timeMs, e.velocity]);
    const actualOns = midiClipNoteEvents(merged, 120)
      .filter((e) => e.on)
      .map((e) => [e.pitch, e.timeMs, e.velocity]);
    expect(actualOns).toEqual(expectedOns);
  });

  it("SQ25: paste_range keeps pattern equal, left trim raises patternPhaseTicks and keeps step 3 in time", async () => {
    const pat = patternFromText("Kick: x... x... x... x...");
    const orig = patClip("c1", pat, { startMs: 0, durationMs: BAR_MS });
    const s = makeState([orig]);
    const ctx = directContext(s);

    // Copy range [0, BAR_MS) and paste at bar 2.
    const section = readSectionContent(s, { fromMs: 0, toMs: BAR_MS }, ctx.newId);
    const pasted = await applyTimelineOp(
      s,
      { op: "paste_range", atMs: BAR_MS, mode: "insert", content: section as never },
      ctx
    );
    expect(pasted.error).toBeUndefined();
    expect(pasted.state.clips).toHaveLength(2);
    expect(pasted.state.clips[1]!.pattern).toEqual(pat);

    // Left trim by 1 beat (500ms = 960 ticks at 120 BPM): step at beat 2 (tick 960 = 500ms)
    // and step at beat 3 (tick 1920 = 1000ms) stay at timeline times 500ms and 1000ms!
    const trimmed = trimClip(orig, "start", -500, undefined, 120);
    expect(trimmed.startMs).toBe(500);
    expect(trimmed.durationMs).toBe(1500);
    expect(trimmed.patternPhaseTicks).toBe(960);
    expect(trimmed.inPointMs).toBe(0);
    const times = midiClipNoteEvents(trimmed, 120)
      .filter((e) => e.on)
      .map((e) => e.timeMs);
    expect(times).toEqual([500, 1000, 1500]);

    // Section edit cutting a pattern region uses SQ23 (phase preserved).
    const sCut = makeState([patClip("c1", pat, { startMs: 0, durationMs: BAR_MS })]);
    const ins = await applyTimelineOp(
      sCut,
      { op: "insert_time", atMs: 1000, ms: 500 },
      directContext(sCut)
    );
    expect(ins.error).toBeUndefined();
    expect(ins.state.clips).toHaveLength(2);
    expect(ins.state.clips[0]!.patternPhaseTicks ?? 0).toBe(0);
    expect(ins.state.clips[1]!.patternPhaseTicks).toBe(1920);
  });

  it("SQ26: set_clip_params with velocityOffset -20 lowers rendered velocity without mutating steps", async () => {
    const pat = patternFromText("Kick: x... x... x... x...");
    const s = makeState([patClip("c1", pat)]);
    const out = await applyTimelineOp(
      s,
      { op: "set_clip_params", target: "c1", patch: { velocityOffset: -20 } },
      directContext(s)
    );
    expect(out.error).toBeUndefined();
    const updated = out.state.clips[0]!;
    expect(updated.velocityOffset).toBe(-20);
    expect(updated.pattern!.rows[0]!.steps[0]!.velocity).toBeUndefined();
    const vels = midiClipNoteEvents(updated, 120)
      .filter((e) => e.on)
      .map((e) => e.velocity);
    expect(vels).toEqual([80, 80, 80, 80]);
  });
});
