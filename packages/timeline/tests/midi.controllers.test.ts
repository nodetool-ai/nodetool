import { describe, expect, it } from "vitest";
import {
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP,
  MIDI_PITCH_BEND_RANGE_SEMITONES,
  controllerValueAt,
  expressionValueAt,
  midiClipControllerEvents,
  midiControllerEventBytes,
  midiNoteEventBytes,
  validateControllerLanes
} from "../src/midi/controllers.js";
import {
  findControllerLane,
  setExpressionPoints,
  setLanePoints
} from "../src/midi/controllerEdit.js";
import { midiClipNoteEvents } from "../src/midi/events.js";
import { validateNotes } from "../src/midi/notes.js";
import { splitNote, resizeNotes } from "../src/midi/notesEdit.js";
import { midiRenderKey } from "../src/midi/cacheKey.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import { renderMidiClip, midiClipVoiceEvents } from "../src/midi/voice.js";
import type { MidiControllerLane, MidiNote } from "../src/types.js";

const BPM = 120; // 1 beat = 500 ms, 1 tick = 500/960 ms.
const SR = 48000;
const beat = (n: number) => n * MIDI_PPQ;

const lane = (over: Partial<MidiControllerLane> = {}): MidiControllerLane => ({
  id: "l1",
  kind: "cc",
  cc: 1,
  points: [],
  ...over
});
const pt = (id: string, tick: number, value: number) => ({ id, tick, value });
const note = (over: Partial<MidiNote> = {}): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: beat(1),
  ...over
});

describe("note events", () => {
  const clip = (notes: MidiNote[]) => ({ startMs: 0, durationMs: 4000, notes });

  it("emits nothing for a muted note", () => {
    expect(midiClipNoteEvents(clip([note({ muted: true })]), BPM)).toEqual([]);
  });

  it("carries the channel and the release velocity", () => {
    const events = midiClipNoteEvents(
      clip([note({ channel: 5, releaseVelocity: 33 })]),
      BPM
    );
    expect(events.map((e) => [e.on, e.channel, e.velocity])).toEqual([
      [true, 5, 100],
      [false, 5, 33]
    ]);
  });

  it("keeps the old note-off velocity when no release velocity is set", () => {
    expect(midiClipNoteEvents(clip([note()]), BPM)[1].velocity).toBe(0);
  });

  it("maps notes and controllers to raw MIDI bytes", () => {
    expect(midiNoteEventBytes({ on: true, channel: 2, pitch: 60, velocity: 90 })).toEqual([0x92, 60, 90]);
    expect(midiNoteEventBytes({ on: false, channel: 15, pitch: 60, velocity: 40 })).toEqual([0x8f, 60, 40]);
    const base = { timeMs: 0, laneId: "x", channel: 3 };
    expect(midiControllerEventBytes({ ...base, kind: "cc", cc: 7, value: 100 })).toEqual([0xb3, 7, 100]);
    expect(midiControllerEventBytes({ ...base, kind: "pitchBend", value: 0 })).toEqual([0xe3, 0x00, 0x40]);
    expect(midiControllerEventBytes({ ...base, kind: "pitchBend", value: 8191 })).toEqual([0xe3, 0x7f, 0x7f]);
    expect(midiControllerEventBytes({ ...base, kind: "pitchBend", value: -8192 })).toEqual([0xe3, 0, 0]);
    expect(midiControllerEventBytes({ ...base, kind: "channelPressure", value: 9 })).toEqual([0xd3, 9]);
    expect(midiControllerEventBytes({ ...base, kind: "polyPressure", pitch: 61, value: 9 })).toEqual([0xa3, 61, 9]);
  });
});

describe("controller events", () => {
  const clipOf = (l: MidiControllerLane, extra = {}) => ({
    startMs: 1000,
    durationMs: 2000,
    controllers: [l],
    ...extra
  });

  it("emits one event per point for a step lane", () => {
    const events = midiClipControllerEvents(
      clipOf(lane({ interpolation: "step", points: [pt("a", 0, 10), pt("b", beat(1), 20)] })),
      BPM
    );
    expect(events.map((e) => [e.timeMs, e.value])).toEqual([
      [1000, 10],
      [1500, 20]
    ]);
  });

  it("samples a linear ramp every 10 ms and only on integer changes", () => {
    const events = midiClipControllerEvents(
      clipOf(lane({ points: [pt("a", 0, 0), pt("b", beat(1), 10)] })),
      BPM
    );
    const times = events.map((e) => e.timeMs);
    expect(times[0]).toBe(1000);
    expect(times[times.length - 1]).toBe(1500);
    // 10 steps across 500 ms: every value appears once, none repeats.
    const values = events.map((e) => e.value);
    // The last event is the end point itself, which always plays.
    expect(values.slice(0, -1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Sample times fall on 10 ms steps from the first point.
    for (const t of times.slice(1, -1)) expect((t - 1000) % 10).toBe(0);
  });

  it("emits nothing before a lane's first point", () => {
    const events = midiClipControllerEvents(
      clipOf(lane({ points: [pt("a", beat(2), 50)] })),
      BPM
    );
    expect(events.map((e) => [e.timeMs, e.value])).toEqual([[2000, 50]]);
  });

  it("ignores points outside the window but chases the value at the window start", () => {
    // Window starts 500 ms into the content. The ramp 0..100 spans 0..1000 ms.
    const events = midiClipControllerEvents(
      {
        startMs: 0,
        inPointMs: 500,
        durationMs: 1000,
        controllers: [lane({ interpolation: "step", points: [pt("a", 0, 0), pt("b", beat(1), 64), pt("c", beat(4), 100)] })]
      },
      BPM
    );
    // Point "a" is hidden. Point "b" sits exactly on the window start and plays itself.
    expect(events.map((e) => [e.timeMs, e.value])).toEqual([[0, 64]]);
    const chased = midiClipControllerEvents(
      {
        startMs: 0,
        inPointMs: 750,
        durationMs: 1000,
        controllers: [lane({ interpolation: "step", points: [pt("a", 0, 0), pt("b", beat(1), 64), pt("c", beat(4), 100)] })]
      },
      BPM
    );
    expect(chased.map((e) => [e.timeMs, e.value])).toEqual([[0, 64]]);
  });

  it("chases the current value when playback starts inside the clip", () => {
    const l = lane({ points: [pt("a", 0, 0), pt("b", beat(2), 100)] });
    const events = midiClipControllerEvents(clipOf(l), BPM, 1500);
    expect(events[0].timeMs).toBe(1500);
    expect(events[0].value).toBe(50);
    expect(events.every((e) => e.timeMs >= 1500)).toBe(true);
  });

  it("emits nothing for a clip that ended before fromMs", () => {
    const l = lane({ kind: "pitchBend", points: [pt("a", 0, 100)] });
    expect(midiClipControllerEvents(clipOf(l), BPM, 5000)).toEqual([]);
  });

  it("resets pitch bend and sustain at the clip end, and leaves other CCs alone", () => {
    const bend = lane({ id: "b", kind: "pitchBend", cc: undefined, points: [pt("a", 0, 4000)] });
    const sustain = lane({ id: "s", cc: 64, points: [pt("a", 0, 127)] });
    const mod = lane({ id: "m", cc: 1, points: [pt("a", 0, 127)] });
    const empty = lane({ id: "e", cc: 7, points: [] });
    const events = midiClipControllerEvents(
      { startMs: 0, durationMs: 1000, controllers: [bend, sustain, mod, empty] },
      BPM
    );
    const ends = events.filter((e) => e.timeMs === 1000);
    expect(ends.map((e) => [e.laneId, e.value]).sort()).toEqual([
      ["b", 0],
      ["s", 0]
    ]);
  });

  it("emits the channel, cc number and poly-pressure pitch", () => {
    const events = midiClipControllerEvents(
      {
        startMs: 0,
        durationMs: 1000,
        controllers: [
          lane({ id: "p", kind: "polyPressure", cc: undefined, pitch: 61, channel: 4, points: [pt("a", 0, 5)] })
        ]
      },
      BPM
    );
    expect(events[0]).toMatchObject({ kind: "polyPressure", pitch: 61, channel: 4, value: 5 });
  });

  it("looks up lane values by tick", () => {
    const l = lane({ points: [pt("a", 100, 10), pt("b", 200, 20)] });
    expect(controllerValueAt(l, 50)).toBeUndefined();
    expect(controllerValueAt(l, 150)).toBe(15);
    expect(controllerValueAt({ ...l, interpolation: "step" }, 150)).toBe(10);
    expect(controllerValueAt(l, 999)).toBe(20);
  });
});

describe("validation", () => {
  it("accepts a good lane list and reports each kind of problem", () => {
    expect(validateControllerLanes([lane({ points: [pt("a", 0, 1)] })])).toEqual([]);
    const code = (l: MidiControllerLane[]) => validateControllerLanes(l).map((p) => p.code);
    expect(code([lane({ cc: undefined })])).toContain("bad_lane_fields");
    expect(code([lane({ kind: "pitchBend", cc: 1 })])).toContain("bad_lane_fields");
    expect(code([lane({ kind: "polyPressure", cc: undefined })])).toContain("bad_lane_fields");
    expect(code([lane({ points: [pt("a", 0, 128)] })])).toContain("value_out_of_range");
    expect(code([lane({ kind: "pitchBend", cc: undefined, points: [pt("a", 0, 8192)] })])).toContain("value_out_of_range");
    expect(code([lane({ points: [pt("a", 5, 1), pt("b", 2, 1)] })])).toContain("unsorted_points");
    expect(code([lane({ points: [pt("a", 0, 1), pt("a", 1, 1)] })])).toContain("duplicate_point_id");
    expect(code([lane({ id: "x" }), lane({ id: "y" })])).toContain("duplicate_lane");
    const many = Array.from({ length: MIDI_MAX_CONTROLLER_LANES_PER_CLIP + 1 }, (_, i) =>
      lane({ id: `l${i}`, cc: i })
    );
    expect(code(many)).toContain("too_many_lanes");
  });

  it("validates a note's new fields", () => {
    expect(validateNotes([note({ channel: 16 })]).map((p) => p.code)).toContain("channel_out_of_range");
    expect(validateNotes([note({ releaseVelocity: 128 })]).map((p) => p.code)).toContain("release_velocity_out_of_range");
    expect(
      validateNotes([note({ expression: { pitch: [{ tick: beat(2), value: 1 }] } })]).map((p) => p.code)
    ).toContain("bad_expression");
    expect(
      validateNotes([note({ muted: true, channel: 15, releaseVelocity: 0, expression: { volume: [{ tick: 0, value: 1 }] } })])
    ).toEqual([]);
  });
});

describe("render", () => {
  const sine = { ...DEFAULT_MIDI_INSTRUMENT, waveform: "sine" as const, cutoffHz: 20000 };
  const zeroCrossings = (b: Float32Array, from: number, to: number) => {
    let n = 0;
    for (let i = from + 1; i < to; i++) if (b[i - 1] < 0 && b[i] >= 0) n++;
    return n;
  };
  const rms = (b: Float32Array, from = 0, to = b.length) => {
    let s = 0;
    for (let i = from; i < to; i++) s += b[i] * b[i];
    return Math.sqrt(s / (to - from));
  };
  const base = { startMs: 0, durationMs: 2000 };

  it("renders a muted note as silence", () => {
    const out = renderMidiClip({
      clip: { ...base, notes: [note({ muted: true, durationTick: beat(2) })] },
      bpm: BPM,
      instrument: sine,
      sampleRate: SR
    });
    expect(rms(out)).toBe(0);
  });

  it("raises the pitch with a pitch bend lane", () => {
    const clip = {
      ...base,
      notes: [note({ pitch: 57, durationTick: beat(4) })]
    };
    const flat = renderMidiClip({ clip, bpm: BPM, instrument: sine, sampleRate: SR });
    const bent = renderMidiClip({
      clip: {
        ...clip,
        controllers: [lane({ kind: "pitchBend", cc: undefined, points: [pt("a", 0, 8191)] })]
      },
      bpm: BPM,
      instrument: sine,
      sampleRate: SR
    });
    const from = Math.round(SR * 0.3);
    const to = Math.round(SR * 0.9);
    const ratio = zeroCrossings(bent, from, to) / zeroCrossings(flat, from, to);
    // +2 semitones is a factor of 2^(2/12) ~ 1.122.
    expect(MIDI_PITCH_BEND_RANGE_SEMITONES).toBe(2);
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.15);
  });

  it("applies per-note pitch expression", () => {
    const clip = { ...base, notes: [note({ pitch: 57, durationTick: beat(4) })] };
    const flat = renderMidiClip({ clip, bpm: BPM, instrument: sine, sampleRate: SR });
    const up = renderMidiClip({
      clip: { ...base, notes: [note({ pitch: 57, durationTick: beat(4), expression: { pitch: [{ tick: 0, value: 12 }] } })] },
      bpm: BPM,
      instrument: sine,
      sampleRate: SR
    });
    const from = Math.round(SR * 0.3);
    const to = Math.round(SR * 0.9);
    expect(zeroCrossings(up, from, to) / zeroCrossings(flat, from, to)).toBeGreaterThan(1.9);
  });

  it("scales the level with cc 7, cc 11 and note volume", () => {
    const notes = [note({ durationTick: beat(4) })];
    const level = (clipExtra: object, n = notes) =>
      rms(
        renderMidiClip({ clip: { ...base, notes: n, ...clipExtra }, bpm: BPM, instrument: sine, sampleRate: SR }),
        Math.round(SR * 0.3),
        Math.round(SR * 0.9)
      );
    const full = level({});
    const quiet7 = level({ controllers: [lane({ cc: 7, points: [pt("a", 0, 64)] })] });
    const quiet11 = level({ controllers: [lane({ cc: 11, points: [pt("a", 0, 64)] })] });
    const muteVol = level({}, [note({ durationTick: beat(4), expression: { volume: [{ tick: 0, value: 0 }] } })]);
    expect(quiet7).toBeLessThan(full * 0.4);
    expect(quiet11).toBeLessThan(full * 0.7);
    expect(quiet11).toBeGreaterThan(quiet7);
    expect(muteVol).toBe(0);
  });

  it("holds note-offs while the sustain pedal is down", () => {
    const clip = {
      ...base,
      notes: [note({ durationTick: beat(1) })]
    };
    const [plain] = midiClipVoiceEvents(clip, BPM, SR);
    const [held] = midiClipVoiceEvents(
      {
        ...clip,
        controllers: [lane({ cc: 64, interpolation: "step", points: [pt("a", 0, 127), pt("b", beat(3), 0)] })]
      },
      BPM,
      SR
    );
    expect(plain.gateOffFrame).toBe(Math.round(0.5 * SR));
    expect(held.gateOffFrame).toBe(Math.round(1.5 * SR));
    // Below 64 the pedal is up.
    const [up] = midiClipVoiceEvents(
      { ...clip, controllers: [lane({ cc: 64, points: [pt("a", 0, 63)] })] },
      BPM,
      SR
    );
    expect(up.gateOffFrame).toBe(plain.gateOffFrame);
    // A pedal never released holds to the window end.
    const [forever] = midiClipVoiceEvents(
      { ...clip, controllers: [lane({ cc: 64, points: [pt("a", 0, 127)] })] },
      BPM,
      SR
    );
    expect(forever.gateOffFrame).toBe(2 * SR);
  });

  it("ignores channel, pan and brightness in the synth", () => {
    const a = renderMidiClip({ clip: { ...base, notes: [note()] }, bpm: BPM, instrument: sine, sampleRate: SR });
    const b = renderMidiClip({
      clip: {
        ...base,
        notes: [note({ channel: 7, expression: { pan: [{ tick: 0, value: 1 }], brightness: [{ tick: 0, value: 0 }] } })],
        controllers: [lane({ cc: 10, points: [pt("a", 0, 0)] }), lane({ id: "cp", kind: "channelPressure", cc: undefined, points: [pt("a", 0, 5)] })]
      },
      bpm: BPM,
      instrument: sine,
      sampleRate: SR
    });
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});

describe("cache key", () => {
  const key = (n: Partial<MidiNote> = {}, controllers?: MidiControllerLane[]) =>
    midiRenderKey({
      clip: { notes: [note(n)], controllers, inPointMs: 0, durationMs: 1000 },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });

  it("changes for every new note and lane field", () => {
    const k = key();
    const variants = [
      key({ muted: true }),
      key({ channel: 1 }),
      key({ releaseVelocity: 10 }),
      key({ expression: { pitch: [{ tick: 0, value: 1 }] } }),
      key({ expression: { pan: [{ tick: 0, value: 1 }] } }),
      key({}, [lane({ points: [pt("a", 0, 1)] })])
    ];
    for (const v of variants) expect(v).not.toBe(k);
    expect(new Set(variants).size).toBe(variants.length);
    const l = lane({ points: [pt("a", 0, 1)] });
    const lk = key({}, [l]);
    expect(key({}, [{ ...l, cc: 2 }])).not.toBe(lk);
    expect(key({}, [{ ...l, channel: 3 }])).not.toBe(lk);
    expect(key({}, [{ ...l, interpolation: "step" }])).not.toBe(lk);
    expect(key({}, [{ ...l, points: [pt("a", 1, 1)] }])).not.toBe(lk);
    expect(key({}, [{ ...l, points: [pt("a", 0, 2)] }])).not.toBe(lk);
  });
});

describe("edits", () => {
  it("splits a note and divides its expression points", () => {
    const n = note({
      durationTick: 1000,
      muted: true,
      channel: 3,
      releaseVelocity: 20,
      expression: { pitch: [{ tick: 0, value: 1 }, { tick: 100, value: 2 }, { tick: 500, value: 3 }, { tick: 1000, value: 4 }] }
    });
    const [left, right] = splitNote(n, 300, "r");
    expect(left).toMatchObject({ id: "n1", durationTick: 300, muted: true, channel: 3, releaseVelocity: 20 });
    expect(right).toMatchObject({ id: "r", startTick: 300, durationTick: 700, muted: true, channel: 3, releaseVelocity: 20 });
    expect(left.expression?.pitch).toEqual([{ tick: 0, value: 1 }, { tick: 100, value: 2 }]);
    expect(right.expression?.pitch).toEqual([{ tick: 200, value: 3 }, { tick: 700, value: 4 }]);
  });

  it("keeps expression inside a note that gets shorter", () => {
    const n = note({ durationTick: 1000, expression: { pitch: [{ tick: 0, value: 0 }, { tick: 1000, value: 10 }] } });
    const [short] = resizeNotes([n], ["n1"], -500, 1);
    expect(short.durationTick).toBe(500);
    expect(short.expression?.pitch).toEqual([{ tick: 0, value: 0 }, { tick: 500, value: 5 }]);
    expect(validateNotes([short])).toEqual([]);
  });

  it("creates a lane with its first point and removes it with the last", () => {
    const target = { kind: "cc" as const, cc: 7 };
    const one = setLanePoints([], target, [{ tick: 10, value: 64 }]);
    expect(one).toHaveLength(1);
    expect(findControllerLane(one, target)?.points[0]).toMatchObject({ tick: 10, value: 64 });
    expect(validateControllerLanes(one)).toEqual([]);
    expect(setLanePoints(one, target, [])).toEqual([]);
    const sorted = setLanePoints(one, target, [
      { tick: 50, value: 999 },
      { tick: 5, value: -3 }
    ]);
    expect(sorted[0].points.map((p) => [p.tick, p.value])).toEqual([[5, 0], [50, 127]]);
  });

  it("sets and clears a note's expression curve", () => {
    const n = setExpressionPoints(note(), "volume", [{ tick: 99999, value: 9 }]);
    expect(n.expression?.volume).toEqual([{ tick: beat(1), value: 4 }]);
    expect(setExpressionPoints(n, "volume", []).expression).toBeUndefined();
  });

  it("evaluates expression curves", () => {
    const pts = [{ tick: 100, value: 0 }, { tick: 200, value: 10 }];
    expect(expressionValueAt(pts, 0, 5)).toBe(5);
    expect(expressionValueAt(pts, 150, 5)).toBe(5);
    expect(expressionValueAt(pts, 500, 5)).toBe(10);
  });
});
