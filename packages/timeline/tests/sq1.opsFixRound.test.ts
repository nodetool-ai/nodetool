/**
 * SQ1 Fix Round Wave 3 — Timeline ops defects (F12 ops, F13, F15, F16, F17,
 * F18 ops, F24, F26 ops, F32 ops).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  automationValueAt,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  midiClipNoteEvents,
  normalizePattern,
  patternFromText,
  type DrumMidiInstrument,
  type StepPattern,
  type StepRow,
  type TimelineClip,
  type TimelineTrack
} from "../src/index.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState,
  type TimelineOpUserStepPattern
} from "../src/ops/index.js";
import { directContext } from "../src/testing/ops.js";

const DR1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;
const SYNTH = DEFAULT_MIDI_INSTRUMENT;
const BAR_MS = 2000;

function makeRow(overrides: Partial<StepRow> = {}): StepRow {
  const lengthSteps = overrides.lengthSteps ?? 16;
  return {
    id: overrides.id ?? "r1",
    assignment: overrides.assignment ?? { type: "note", pitch: 60 },
    mute: false,
    solo: false,
    lengthSteps,
    loopStart: 0,
    loopEnd: lengthSteps,
    stepRate: "1/16",
    playback: "forward",
    midiChannel: 1,
    automationMode: "latch",
    subrows: ["velocity", "gate"],
    steps: Array.from({ length: lengthSteps }, () => ({})),
    ...overrides
  };
}

function patClip(
  id: string,
  pattern: StepPattern,
  overrides: Partial<TimelineClip> = {}
): TimelineClip {
  return makeClip({
    id,
    trackId: overrides.trackId ?? "t1",
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

function makeState(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  tempo = DEFAULT_TEMPO
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tempo,
    tracks,
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

describe("SQ1 Fix Round — Timeline ops (Wave 3)", () => {
  it("F12 (ops): add_pattern_rows and set_pattern_row enforce pitchSource:'chords' for degree and kit track for kit rows", async () => {
    const wtTrack = makeTrack({ id: "t1", type: "midi", name: "Synth", index: 0, instrument: SYNTH });
    const clip = patClip("c1", normalizePattern({ pitchSource: "off", lengthSteps: 4, rows: [makeRow({ id: "r1", lengthSteps: 4, loopEnd: 4 })] }));
    const state = makeState([wtTrack], [clip]);

    const addDeg = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: [{ degree: "root" }]
      }),
      directContext(state)
    );
    expect(addDeg.error).toMatch(/pitchSource|chords/i);

    const addKit = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: [{ pad: 0 }]
      }),
      directContext(state)
    );
    expect(addKit.error).toMatch(/kit|drum|sampler/i);

    const setDeg = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_pattern_row" as never, {
        clipId: "c1",
        row: "r1",
        assignment: { type: "degree", degree: "root", octave: 3 }
      }),
      directContext(state)
    );
    expect(setDeg.error).toMatch(/pitchSource|chords/i);

    const setKit = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_pattern_row" as never, {
        clipId: "c1",
        row: "r1",
        assignment: { type: "kit", pad: 0 }
      }),
      directContext(state)
    );
    expect(setKit.error).toMatch(/kit|drum|sampler/i);
  });

  it("F13: convert_pattern_to_midi preserves looped condition semantics, subtracts tempo.offsetMs, and materializes deviceAutomation", async () => {
    // 1. Looped 4-bar clip with condition: first -> must fire ONCE after conversion, not 4 times.
    const firstPat = normalizePattern({
      lengthSteps: 16,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 60 },
          steps: Array.from({ length: 16 }, (_, i) =>
            i === 0 ? { on: true, condition: { type: "first" } } : {}
          )
        })
      ]
    });
    const loopedClip = patClip("c1", firstPat, {
      durationMs: 4 * BAR_MS,
      loopLengthMs: BAR_MS,
      outPointMs: BAR_MS
    });
    const track1 = makeTrack({ id: "t1", type: "midi", name: "Synth", index: 0, instrument: DEFAULT_MIDI_INSTRUMENT });
    const s1 = makeState([track1], [loopedClip]);
    const beforeHits = midiClipNoteEvents(loopedClip, 120).filter((e) => e.on);
    expect(beforeHits).toHaveLength(1);

    const conv1 = await applyTimelineOp(
      s1,
      timelineOpFromToolArgs("convert_pattern_to_midi" as never, { clipIds: ["c1"] }),
      directContext(s1)
    );
    expect(conv1.error).toBeUndefined();
    const afterClip1 = conv1.state.clips[0]!;
    expect(afterClip1.loopLengthMs).toBeUndefined();
    expect(afterClip1.outPointMs).toBe(4 * BAR_MS);
    const afterHits = midiClipNoteEvents(afterClip1, 120).filter((e) => e.on);
    expect(afterHits.map((e) => e.timeMs)).toEqual(beforeHits.map((e) => e.timeMs));

    // 2. tempo.offsetMs = 2000ms: chord at tick 0..3840 sits at clip.startMs = 2000ms.
    const degPat = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      pitchSource: "chords",
      rows: [
        makeRow({
          id: "d1",
          assignment: { type: "degree", degree: "root", octave: 3 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        }),
        makeRow({
          id: "auto1",
          assignment: {
            type: "automation",
            target: { kind: "device", deviceId: "instrument", param: "cutoffHz" }
          },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          automationMode: "slide",
          subrows: ["value"],
          steps: [{ on: true, value: 400 }, {}, { on: true, value: 4000 }, {}]
        })
      ]
    });
    const c2 = patClip("c2", degPat, { startMs: 2000, durationMs: BAR_MS });
    const chordTrack = makeTrack({
      id: "t_chords",
      type: "chord",
      name: "Chords",
      index: 0,
      chords: [{ id: "ch1", startTick: 0, durationTick: 3840, root: 7, quality: "maj", inversion: 0 }]
    });
    const midiTrack2 = makeTrack({ id: "t1", type: "midi", name: "Synth", index: 1, instrument: DEFAULT_MIDI_INSTRUMENT });
    const s2 = makeState([chordTrack, midiTrack2], [c2], { ...DEFAULT_TEMPO, offsetMs: 2000 });
    const conv2 = await applyTimelineOp(
      s2,
      timelineOpFromToolArgs("convert_pattern_to_midi" as never, { clipIds: ["c2"] }),
      directContext(s2)
    );
    expect(conv2.error).toBeUndefined();
    expect(conv2.state.clips[0]!.notes).toHaveLength(1);
    expect(conv2.state.clips[0]!.notes![0]!.pitch).toBe(67); // G3
    const autoTrack = conv2.state.tracks.find((t) => t.id === "t1")!;
    expect(autoTrack.automation?.length).toBe(1);
    expect(automationValueAt(autoTrack.automation![0]!.points, 2500)).toBeCloseTo(2200, 1);
  });

  it("F15: copy_steps cut:true handles overlapping same-row ranges and promotes fixed note row on melodic paste", async () => {
    const pat = normalizePattern({
      lengthSteps: 8,
      rows: [
        makeRow({
          id: "r1",
          name: "Kick",
          assignment: { type: "note", pitch: 36 },
          lengthSteps: 8,
          loopEnd: 8,
          steps: [
            { on: true, velocity: 110 },
            { on: true, velocity: 100 },
            { on: true, velocity: 90 },
            { on: true, velocity: 80 },
            {},
            {},
            {},
            {}
          ]
        }),
        makeRow({
          id: "r2",
          name: "Mel",
          assignment: { type: "melodic", pitch: 60 },
          lengthSteps: 8,
          loopEnd: 8,
          steps: [{ on: true, note: 5, octave: 4 }, {}, {}, {}, {}, {}, {}, {}]
        }),
        makeRow({
          id: "r3",
          name: "Fixed",
          assignment: { type: "note", pitch: 60 },
          lengthSteps: 8,
          loopEnd: 8
        })
      ]
    });
    const state = makeState(
      [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0 })],
      [patClip("c1", pat)]
    );

    const cutOverlap = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("copy_steps" as never, {
        clipId: "c1",
        row: "Kick",
        steps: "1-4",
        toRow: "Kick",
        toStep: 3,
        cut: true
      }),
      directContext(state)
    );
    expect(cutOverlap.error).toBeUndefined();
    const kickSteps = cutOverlap.state.clips[0]!.pattern!.rows[0]!.steps;
    expect(kickSteps.map((s) => Boolean(s.on))).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false
    ]);

    const pasteMel = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("copy_steps" as never, {
        clipId: "c1",
        row: "Mel",
        steps: "1",
        toRow: "Fixed",
        toStep: 1
      }),
      directContext(state)
    );
    expect(pasteMel.error).toBeUndefined();
    expect(pasteMel.state.clips[0]!.pattern!.rows[2]!.assignment.type).toBe("melodic");
  });

  it("F16: copy_pattern_row promotes melodic->fixed target and clamps lengthSteps across clips", async () => {
    const srcPat = normalizePattern({
      lengthSteps: 32,
      rows: [
        makeRow({
          id: "m1",
          name: "Mel",
          assignment: { type: "melodic", pitch: 60 },
          lengthSteps: 32,
          loopEnd: 32,
          steps: Array.from({ length: 32 }, (_, i) =>
            i === 0 ? { on: true, note: 4, octave: 4 } : {}
          )
        }),
        makeRow({
          id: "f1",
          name: "Fixed",
          assignment: { type: "note", pitch: 64 },
          lengthSteps: 32,
          loopEnd: 32
        })
      ]
    });
    const dstPat = normalizePattern({
      lengthSteps: 16,
      rows: [makeRow({ id: "d1", name: "Dst", lengthSteps: 16, loopEnd: 16 })]
    });
    const state = makeState(
      [makeTrack({ id: "t1", type: "midi", name: "Synth", index: 0 })],
      [patClip("c1", srcPat), patClip("c2", dstPat, { startMs: BAR_MS })]
    );

    const ontoFixed = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("copy_pattern_row" as never, {
        clipId: "c1",
        row: "Mel",
        toRow: "Fixed"
      }),
      directContext(state)
    );
    expect(ontoFixed.error).toBeUndefined();
    const fixedRow = ontoFixed.state.clips[0]!.pattern!.rows[1]!;
    expect(fixedRow.assignment).toEqual({ type: "melodic", pitch: 64 });

    const crossClip = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("copy_pattern_row" as never, {
        clipId: "c1",
        row: "Mel",
        toClipId: "c2",
        asNew: true
      }),
      directContext(state)
    );
    expect(crossClip.error).toBeUndefined();
    const copiedRow = crossClip.state.clips[1]!.pattern!.rows[1]!;
    expect(copiedRow.lengthSteps).toBe(16);
    expect(copiedRow.steps).toHaveLength(16);
    expect(copiedRow.loopEnd).toBeLessThanOrEqual(16);
  });

  it("F17: add_pattern_rows and set_pattern_row reject row lengthSteps > pattern.lengthSteps", async () => {
    const pat = normalizePattern({
      lengthSteps: 16,
      rows: [makeRow({ id: "r1", lengthSteps: 16, loopEnd: 16 })]
    });
    const state = makeState(
      [makeTrack({ id: "t1", type: "midi", name: "Synth", index: 0 })],
      [patClip("c1", pat)]
    );

    const addTooLong = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: [{ pitch: 60, lengthSteps: 32 }]
      }),
      directContext(state)
    );
    expect(addTooLong.error).toMatch(/lengthSteps|16/i);

    const setTooLong = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_pattern_row" as never, {
        clipId: "c1",
        row: "r1",
        lengthSteps: 32
      }),
      directContext(state)
    );
    expect(setTooLong.error).toMatch(/lengthSteps|16/i);
  });

  it("F18 (ops): get_pattern octave mode, nudge_pattern_values, and transpose_pattern use kit instrument pitch", async () => {
    const dr48: DrumMidiInstrument = { ...DR1, baseNote: 48 }; // pad 0 = MIDI 48 = C2 -> octave 2
    const pat = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "k0",
          assignment: { type: "kit", pad: 0 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, {}, {}, {}]
        })
      ]
    });
    const state = makeState(
      [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0, instrument: dr48 })],
      [patClip("c1", pat)]
    );

    const got = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("get_pattern" as never, { clipId: "c1", modes: ["octave"] }),
      directContext(state)
    );
    expect(got.error).toBeUndefined();
    const rows = got.result.rows as Array<{ values?: { octave?: number[] } }>;
    expect(rows[0]!.values!.octave![0]).toBe(2);

    const nudged = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("nudge_pattern_values" as never, {
        clipId: "c1",
        row: "k0",
        mode: "octave",
        delta: 1
      }),
      directContext(state)
    );
    expect(nudged.error).toBeUndefined();
    expect(nudged.state.clips[0]!.pattern!.rows[0]!.steps[0]!.octave).toBe(3);

    const transposed = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("transpose_pattern" as never, {
        clipId: "c1",
        row: "k0",
        steps: "1",
        semitones: 14
      }),
      directContext(state)
    );
    expect(transposed.error).toBeUndefined();
    expect(transposed.state.clips[0]!.pattern!.rows[0]!.steps[0]!.octave).toBe(3);
    expect(transposed.state.clips[0]!.pattern!.rows[0]!.steps[0]!.note).toBe(2);
  });

  it("F24: 12-char short resource IDs resolve rows, user library patterns, and track effect deviceIds", async () => {
    const fullRowId = "a1b2c3d4e5f600001111222233334444";
    const fullEffectId = "112233445566aabbccddeeff00112233";
    const fullPatternId = "f0e1d2c3b4a599998888777766665555";
    const pat = normalizePattern({
      lengthSteps: 4,
      rows: [makeRow({ id: fullRowId, lengthSteps: 4, loopEnd: 4 })]
    });
    const track = makeTrack({
      id: "t1",
      type: "midi",
      name: "Synth",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      effects: [
        {
          id: fullEffectId,
          type: "filter",
          mode: "lowpass",
          frequency: 1200,
          q: 1,
          enabled: true
        }
      ]
    });
    const state = makeState([track], [patClip("c1", pat)]);
    const savedPat = patternFromText("Kick: x... x... x... x...");
    const userLib: TimelineOpUserStepPattern[] = [
      {
        id: fullPatternId,
        name: "My Beat",
        kind: "pattern",
        category: "user",
        tags: ["user"],
        pattern: savedPat
      }
    ];
    const ctx = {
      ...directContext(state),
      stepPatternLibrary: {
        async list() {
          return userLib;
        },
        async save() {
          return { id: fullPatternId, folder: "Step Patterns/Patterns" };
        }
      }
    };

    // 1. 12-char row id prefix
    const stepRes = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_steps" as never, {
        clipId: "c1",
        row: fullRowId.slice(0, 12),
        steps: "1",
        values: { on: true }
      }),
      ctx
    );
    expect(stepRes.error).toBeUndefined();
    expect(stepRes.state.clips[0]!.pattern!.rows[0]!.steps[0]!.on).toBe(true);

    // 2. 12-char effect deviceId prefix expands to full 32-hex ID on stored row
    const addFxRow = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: [{ param: "frequency", deviceId: fullEffectId.slice(0, 12) }]
      }),
      ctx
    );
    expect(addFxRow.error).toBeUndefined();
    const addedAssign = addFxRow.state.clips[0]!.pattern!.rows[1]!.assignment;
    expect(addedAssign).toEqual({
      type: "automation",
      target: { kind: "device", deviceId: fullEffectId, param: "frequency" }
    });

    // 3. 12-char user pattern ID prefix in apply_step_pattern
    const applyRes = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("apply_step_pattern" as never, {
        clipId: "c1",
        pattern: fullPatternId.slice(0, 12)
      }),
      ctx
    );
    expect(applyRes.error).toBeUndefined();
    expect(applyRes.result.appliedPattern).toBe("My Beat");
  });

  it("F26 (ops): row automationMode/color/subrowsExpanded, fractional device ramps, and wide values", async () => {
    const state = makeState(
      [makeTrack({ id: "t1", type: "midi", name: "Synth", index: 0, instrument: DEFAULT_MIDI_INSTRUMENT })],
      [patClip("c1", normalizePattern({ lengthSteps: 8, rows: [] }))]
    );

    const added = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: [
          {
            name: "Drive",
            param: "drive",
            deviceId: "instrument",
            automationMode: "slide",
            color: "#ff5500",
            subrowsExpanded: true
          },
          {
            name: "Cutoff",
            param: "cutoffHz",
            deviceId: "instrument",
            automationMode: "latch"
          }
        ]
      }),
      directContext(state)
    );
    expect(added.error).toBeUndefined();
    const [driveRow, cutoffRow] = added.state.clips[0]!.pattern!.rows;
    expect(driveRow!.automationMode).toBe("slide");
    expect(driveRow!.color).toBe("#ff5500");
    expect(driveRow!.subrowsExpanded).toBe(true);
    expect(cutoffRow!.automationMode).toBe("latch");

    // Fractional ramp on device automation row must NOT round to 0/1.
    const ramped = await applyTimelineOp(
      added.state,
      timelineOpFromToolArgs("set_steps" as never, {
        clipId: "c1",
        row: "Drive",
        steps: "1-5",
        ramp: { field: "value", from: 0, to: 1 }
      }),
      directContext(added.state)
    );
    expect(ramped.error).toBeUndefined();
    const vals = ramped.state.clips[0]!.pattern!.rows[0]!.steps.slice(0, 5).map((s) => s.value);
    expect(vals).toEqual([0, 0.25, 0.5, 0.75, 1]);

    // Wide cutoff value 18000 Hz succeeds.
    const wide = await applyTimelineOp(
      ramped.state,
      timelineOpFromToolArgs("set_steps" as never, {
        clipId: "c1",
        row: "Cutoff",
        steps: "1",
        values: { value: 18000 }
      }),
      directContext(ramped.state)
    );
    expect(wide.error).toBeUndefined();
    expect(wide.state.clips[0]!.pattern!.rows[1]!.steps[0]!.value).toBe(18000);

    // set_pattern_row updates per-row automationMode, color, subrowsExpanded.
    const updatedRow = await applyTimelineOp(
      wide.state,
      timelineOpFromToolArgs("set_pattern_row" as never, {
        clipId: "c1",
        row: "Cutoff",
        automationMode: "slide",
        color: "#00aa88",
        subrowsExpanded: false
      }),
      directContext(wide.state)
    );
    expect(updatedRow.error).toBeUndefined();
    const r2 = updatedRow.state.clips[0]!.pattern!.rows[1]!;
    expect(r2.automationMode).toBe("slide");
    expect(r2.color).toBe("#00aa88");
    expect(r2.subrowsExpanded).toBe(false);
  });

  it("F32 (ops): trim_clip supports head-trim via startMs and folds pattern slip into patternPhaseTicks", async () => {
    const pat = patternFromText("Kick: x... x... x... x...");
    const state = makeState(
      [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0 })],
      [patClip("c1", pat, { startMs: 0, durationMs: BAR_MS })]
    );

    // Head-trim startMs: 0 -> 500 (1 beat at 120 BPM = 960 ticks).
    const headRes = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("trim_clip" as never, { target: "c1", startMs: 500 }),
      directContext(state)
    );
    expect(headRes.error).toBeUndefined();
    const headClip = headRes.state.clips[0]!;
    expect(headClip.startMs).toBe(500);
    expect(headClip.durationMs).toBe(1500);
    expect(headClip.patternPhaseTicks).toBe(960);
    expect(headClip.inPointMs).toBe(0);
    expect(
      midiClipNoteEvents(headClip, 120)
        .filter((e) => e.on)
        .map((e) => e.timeMs)
    ).toEqual([500, 1000, 1500]);

    // Slip via inPointMs: 500 on a pattern clip folds into patternPhaseTicks and keeps inPointMs = 0.
    const slipRes = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("trim_clip" as never, { target: "c1", inPointMs: 500 }),
      directContext(state)
    );
    expect(slipRes.error).toBeUndefined();
    const slipClip = slipRes.state.clips[0]!;
    expect(slipClip.startMs).toBe(0);
    expect(slipClip.patternPhaseTicks).toBe(960);
    expect(slipClip.inPointMs).toBe(0);
  });

  it("F42: join_clips materializes device automation when joining unequal pattern regions", async () => {
    const patA = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      rows: [
        makeRow({
          id: "nA",
          assignment: { type: "note", pitch: 48 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        }),
        makeRow({
          id: "autoA",
          assignment: {
            type: "automation",
            target: { kind: "device", deviceId: "fx-flt", param: "cutoffHz" }
          },
          automationMode: "slide",
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          subrows: ["value"],
          steps: [{ on: true, value: 400 }, {}, { on: true, value: 1200 }, {}]
        })
      ]
    });
    const patB = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      rows: [
        makeRow({
          id: "nB",
          assignment: { type: "note", pitch: 55 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        }),
        makeRow({
          id: "autoB",
          assignment: {
            type: "automation",
            target: { kind: "device", deviceId: "fx-flt", param: "cutoffHz" }
          },
          automationMode: "slide",
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          subrows: ["value"],
          steps: [{ on: true, value: 3000 }, {}, { on: true, value: 6000 }, {}]
        })
      ]
    });
    const track = makeTrack({
      id: "t1",
      type: "midi",
      name: "Synth",
      index: 0,
      instrument: SYNTH,
      effects: [
        {
          id: "fx-flt",
          type: "filter",
          mode: "lowpass",
          frequency: 2000,
          q: 1,
          enabled: true
        }
      ]
    });
    const c1 = patClip("c1", patA, { startMs: 0, durationMs: BAR_MS });
    const c2 = patClip("c2", patB, { startMs: BAR_MS, durationMs: BAR_MS });
    const state = makeState([track], [c1, c2]);

    const res = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("join_clips" as never, { clips: ["c1", "c2"] }),
      directContext(state)
    );
    expect(res.error).toBeUndefined();
    expect(res.state.clips).toHaveLength(1);
    expect(res.state.clips[0]!.pattern).toBeUndefined();
    const outTrack = res.state.tracks.find((t) => t.id === "t1")!;
    const lane = (outTrack.automation ?? []).find(
      (l) =>
        l.target.kind === "device" &&
        l.target.deviceId === "fx-flt" &&
        l.target.param === "cutoffHz"
    );
    expect(lane).toBeDefined();
    expect(automationValueAt(lane!.points, 500)).toBeCloseTo(800, 1);
    expect(automationValueAt(lane!.points, 2000)).toBeCloseTo(3000, 1);
    expect(automationValueAt(lane!.points, 2500)).toBeCloseTo(4500, 1);
  });
});
