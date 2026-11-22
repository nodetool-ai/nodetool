/**
 * Playback, rendering, cache key, DR-1 kit pitch bend, device automation
 * overlay, CE3 loop & CE6 region params for Step Sequencer clips
 * (SQ9, SQ16, SQ17, SQ26, SQ41, SQ42).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  automationValueAt,
  deriveTrackAutomationFromPatterns,
  expandMidiLoop,
  expandPattern,
  findInstrumentPreset,
  harmonizeClips,
  makeClip,
  makeTrack,
  midiClipControllerEvents,
  midiClipNoteEvents,
  midiRenderKey,
  normalizePattern,
  patternFromText,
  renderMidiClip,
  type DrumMidiInstrument,
  type StepPattern,
  type StepRow,
  type TimelineClip
} from "../src/index.js";

const DR1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;
const BAR_MS = 2000; // 120 BPM, 4/4

function patternClip(
  pattern: StepPattern,
  overrides: Partial<TimelineClip> = {}
): TimelineClip {
  return makeClip({
    id: overrides.id ?? "c_pat",
    trackId: overrides.trackId ?? "t_midi",
    name: overrides.name ?? "Pattern",
    startMs: overrides.startMs ?? 0,
    durationMs: overrides.durationMs ?? BAR_MS,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    pattern,
    ...overrides
  });
}

describe("SQ9, SQ17, SQ26: playback, loop, region params and cache key", () => {
  it("SQ17: 1-bar pattern in a 3-bar clip plays 3 times and CE6 transpose +2 raises every note", () => {
    const pat = patternFromText("C3: x... .... .... ....");
    const clip = patternClip(pat, { durationMs: 3 * BAR_MS, transpose: 2 });
    const ons = midiClipNoteEvents(clip, 120).filter((e) => e.on);
    expect(ons.map((e) => [e.pitch, e.timeMs])).toEqual([
      [62, 0],
      [62, 2000],
      [62, 4000]
    ]);
  });

  it("SQ26: velocityOffset lowers rendered velocities without changing stored step velocities", () => {
    const pat = patternFromText("Kick: x... .... .... ....");
    const clip = patternClip(pat, { velocityOffset: -20 });
    const ons = midiClipNoteEvents(clip, 120).filter((e) => e.on);
    expect(ons[0]!.velocity).toBe(80);
    expect(clip.pattern!.rows[0]!.steps[0]!.velocity).toBeUndefined();
  });

  it("SQ9: midiRenderKey hashes pattern and patternPhaseTicks", () => {
    const patA = patternFromText("Kick: x... x... x... x...");
    const patB = patternFromText("Kick: x... .... x... x...");
    const base = {
      bpm: 120,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: 48000
    };
    const keyA = midiRenderKey({ clip: patternClip(patA), ...base });
    const keyB = midiRenderKey({ clip: patternClip(patB), ...base });
    const keyPhase = midiRenderKey({
      clip: patternClip(patA, { patternPhaseTicks: 960 }),
      ...base
    });
    const keySeed = midiRenderKey({
      clip: patternClip({ ...patA, seed: 99 }),
      ...base
    });
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyPhase);
    expect(keyA).not.toBe(keySeed);
  });

  it("SQ9 & SQ13: CE3 loop restarts rows while advancing cycle count across loop repeats", () => {
    const row: StepRow = {
      id: "r1",
      assignment: { type: "note", pitch: 60 },
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
      steps: Array.from({ length: 16 }, (_, i) =>
        i === 0 ? { on: true, condition: { type: "recurrence", iteration: 2, cycles: 2 } } : {}
      )
    };
    const pat = normalizePattern({ lengthSteps: 16, rows: [row] });
    // 2-bar clip with 1-bar loop: repeat 0 is cycle 0 (off), repeat 1 is cycle 1 (plays at 2000ms).
    const clip = patternClip(pat, { durationMs: 2 * BAR_MS, loopLengthMs: BAR_MS });
    const doc = {
      tracks: [makeTrack({ id: "t_midi", type: "midi", name: "Synth", index: 0 })],
      tempo: DEFAULT_TEMPO
    };
    const expanded = harmonizeClips([clip], doc)[0]!;
    const ons = midiClipNoteEvents(expanded, 120).filter((e) => e.on);
    expect(ons.map((e) => e.timeMs)).toEqual([2000]);
  });

  it("SQ9 & SQ18: harmonizeClips expands degree rows against chord track and renders same samples as direct expandPattern", () => {
    const row = (id: string, degree: "root" | "3rd" | "5th"): StepRow => ({
      id,
      assignment: { type: "degree", degree, octave: 3 },
      mute: false,
      solo: false,
      lengthSteps: 4,
      loopStart: 0,
      loopEnd: 4,
      stepRate: "1/4",
      playback: "forward",
      midiChannel: 1,
      automationMode: "latch",
      subrows: ["velocity", "octave"],
      steps: [{ on: true }, {}, {}, {}]
    });
    const pat = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      pitchSource: "chords",
      rows: [row("r1", "root"), row("r3", "3rd"), row("r5", "5th")]
    });
    const clip = patternClip(pat);
    const chords = [{ id: "ch1", startTick: 0, durationTick: 3840, root: 7, quality: "maj" as const, inversion: 0 }];
    const doc = {
      tracks: [
        makeTrack({ id: "t_chords", type: "chord", name: "Chords", index: 0, chords }),
        makeTrack({ id: "t_midi", type: "midi", name: "Keys", index: 1, instrument: DEFAULT_MIDI_INSTRUMENT })
      ],
      tempo: DEFAULT_TEMPO
    };
    const expanded = harmonizeClips([clip], doc)[0]!;
    expect(expanded.pattern).toBeUndefined();
    expect(expanded.notes!.map((n) => n.pitch)).toEqual([67, 71, 74]);

    const direct = expandPattern(pat, { clipLengthTicks: 3840, chords });
    const pcmViaHarmonize = renderMidiClip({
      clip: expanded,
      bpm: 120,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: 24000
    });
    const pcmDirect = renderMidiClip({
      clip: { ...clip, pattern: undefined, notes: direct.notes, controllers: direct.controllers },
      bpm: 120,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: 24000
    });
    expect(pcmViaHarmonize).toEqual(pcmDirect);
  });

  it("SQ16: midiClipControllerEvents emits automation from pattern CC rows", () => {
    const row: StepRow = {
      id: "cc74",
      assignment: { type: "automation", target: { kind: "cc", cc: 74 } },
      mute: false,
      solo: false,
      lengthSteps: 4,
      loopStart: 0,
      loopEnd: 4,
      stepRate: "1/4",
      playback: "forward",
      midiChannel: 1,
      automationMode: "latch",
      subrows: ["value"],
      steps: [{ on: true, value: 0 }, {}, { on: true, value: 127 }, {}]
    };
    const clip = patternClip(normalizePattern({ lengthSteps: 4, stepRate: "1/4", rows: [row] }));
    const events = midiClipControllerEvents(clip, 120);
    expect(events.map((e) => [e.timeMs, e.cc, e.value])).toEqual([
      [0, 74, 0],
      [1000, 74, 127]
    ]);
  });

  it("SQ42: DR-1 kit row with Note +3 bends the pad pitch during audio render", () => {
    const makeKitClip = (noteOffset: number) =>
      patternClip(
        normalizePattern({
          lengthSteps: 4,
          rows: [
            {
              id: "k0",
              assignment: { type: "kit", pad: 0 },
              mute: false,
              solo: false,
              lengthSteps: 4,
              loopStart: 0,
              loopEnd: 4,
              stepRate: "1/16",
              playback: "forward",
              midiChannel: 1,
              automationMode: "latch",
              subrows: ["velocity", "gate"],
              steps: [{ on: true, ...(noteOffset ? { note: noteOffset } : {}) }, {}, {}, {}]
            }
          ]
        }),
        { durationMs: 500 }
      );
    const doc = {
      tracks: [makeTrack({ id: "t_midi", type: "midi", name: "Drums", index: 0, instrument: DR1 })],
      tempo: DEFAULT_TEMPO
    };
    const plain = harmonizeClips([makeKitClip(0)], doc)[0]!;
    const pitched = harmonizeClips([makeKitClip(3)], doc)[0]!;
    const pcm0 = renderMidiClip({ clip: plain, bpm: 120, instrument: DR1, sampleRate: 24000 });
    const pcm3 = renderMidiClip({ clip: pitched, bpm: 120, instrument: DR1, sampleRate: 24000 });
    expect(pcm0.some((s) => Math.abs(s) > 0.01)).toBe(true);
    expect(pcm3.some((s) => Math.abs(s) > 0.01)).toBe(true);
    let maxDiff = 0;
    for (let i = 0; i < pcm0.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(pcm0[i]! - pcm3[i]!));
    }
    expect(maxDiff).toBeGreaterThan(0.01);
  });

  it("SQ41: Cutoff device automation row with Slide renders linear ramp and stored lane wins outside clip", () => {
    const row: StepRow = {
      id: "cut",
      assignment: {
        type: "automation",
        target: { kind: "device", deviceId: "instrument", param: "filter.cutoff" }
      },
      mute: false,
      solo: false,
      lengthSteps: 4,
      loopStart: 0,
      loopEnd: 4,
      stepRate: "1/4",
      playback: "forward",
      midiChannel: 1,
      automationMode: "slide",
      subrows: ["value"],
      steps: [{ on: true, value: 200 }, {}, { on: true, value: 1200 }, {}]
    };
    const clip = patternClip(
      normalizePattern({ lengthSteps: 4, stepRate: "1/4", rows: [row] }),
      { startMs: 1000, durationMs: 2000 }
    );
    const track = makeTrack({
      id: "t_midi",
      type: "midi",
      name: "Synth",
      index: 0,
      automation: [
        {
          id: "stored",
          target: { kind: "device", deviceId: "instrument", param: "filter.cutoff" },
          points: [
            { timeMs: 0, value: 500 },
            { timeMs: 4000, value: 800 }
          ]
        }
      ]
    });
    const merged = deriveTrackAutomationFromPatterns(track, [clip], { tracks: [track], tempo: DEFAULT_TEMPO });
    expect(merged).toHaveLength(1);
    const pts = merged[0]!.points;
    // Before clip: stored linear curve (500 @ 0 -> 800 @ 4000) stays intact up to clipStart.
    expect(automationValueAt(pts, 0)).toBe(500);
    expect(automationValueAt(pts, 500)).toBeCloseTo(537.5, 2);
    // Inside clip: linear ramp from 200 at 1000ms to 1200 at 2000ms, holding 1200 until clipEnd.
    expect(automationValueAt(pts, 1000)).toBe(200);
    expect(automationValueAt(pts, 1500)).toBeCloseTo(700, 3);
    expect(automationValueAt(pts, 2000)).toBe(1200);
    expect(automationValueAt(pts, 2500)).toBeCloseTo(1200, 3);
    // After clip: returns to stored linear curve at clipEnd (725 @ 3000 -> 762.5 @ 3500 -> 800 @ 4000).
    expect(automationValueAt(pts, 3000)).toBeCloseTo(725, 2);
    expect(automationValueAt(pts, 3500)).toBeCloseTo(762.5, 2);
    expect(automationValueAt(pts, 4000)).toBe(800);
  });

  it("expandMidiLoop expands raw pattern clip directly", () => {
    const clip = patternClip(patternFromText("Kick: x... x... x... x..."));
    const expanded = expandMidiLoop(clip, 120);
    expect(expanded.notes).toHaveLength(4);
    expect(expanded.pattern).toBeUndefined();
  });
});
