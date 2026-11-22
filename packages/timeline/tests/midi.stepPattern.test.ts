/**
 * Step Sequencer pure functions, normalization, expansion, text and conversion
 * vectors (SQ1–SQ21, SQ41–SQ42, SQ47, SQ60).
 */
import { describe, expect, it } from "vitest";
import {
  STEP_PATTERN_MAX_ROWS,
  STEP_RATES,
  addPatternRow,
  addRowSubrow,
  compactStep,
  defaultSubrowsForAssignment,
  expandPattern,
  midiToPattern,
  normalizePattern,
  normalizeStep,
  patternFromText,
  patternMusicalLengthTicks,
  patternToText,
  playOrder,
  repeatPositions,
  repeatVelocities,
  resizePatternLength,
  rowLabel,
  rowSchedule,
  setPatternKey,
  setPatternStepRate,
  setRowSubrowMode,
  setStepValue,
  stepHash,
  stepPitch,
  stepRateTicks,
  swingDelay,
  validateStepPattern
} from "../src/midi/index.js";
import { findInstrumentPreset } from "../src/midi/presets.js";
import type { DrumMidiInstrument, MidiNote, StepPattern, StepRow } from "../src/types.js";

const DR1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;

function makeRow(overrides: Partial<StepRow> = {}): StepRow {
  const lengthSteps = overrides.lengthSteps ?? 16;
  return {
    id: overrides.id ?? "r1",
    assignment: overrides.assignment ?? { type: "note", pitch: 36 },
    mute: false,
    solo: false,
    lengthSteps,
    loopStart: 0,
    loopEnd: lengthSteps,
    stepRate: "1/16",
    playback: "forward",
    midiChannel: 1,
    automationMode: "latch",
    subrows: defaultSubrowsForAssignment(overrides.assignment ?? { type: "note", pitch: 36 }),
    steps: Array.from({ length: lengthSteps }, () => ({})),
    ...overrides
  };
}

describe("SQ2–SQ6: defaults, normalization, step rates, rows and subrows", () => {
  it("SQ2: normalizePattern({}) returns the contract defaults and stepRate writes through", () => {
    const p = normalizePattern({});
    expect(p).toEqual({
      version: 1,
      seed: 1,
      lengthSteps: 16,
      stepRate: "1/16",
      playback: "forward",
      legato: false,
      swing: 0,
      swingDivision: "1/16",
      pitchSource: "off",
      scale: "chromatic",
      noTranspose: false,
      scaleQuantize: false,
      midiChannel: 1,
      automationMode: "latch",
      mono: false,
      name: "Pattern",
      rows: []
    });

    const withRows = addPatternRow(
      addPatternRow(p, { id: "r1", assignment: { type: "note", pitch: 36 } }),
      { id: "r2", assignment: { type: "note", pitch: 38 } }
    );
    const eighth = setPatternStepRate(withRows, "1/8");
    expect(eighth.stepRate).toBe("1/8");
    expect(eighth.rows.every((r) => r.stepRate === "1/8")).toBe(true);
  });

  it("SQ3: adding a row creates lengthSteps off steps and the 129th add is refused", () => {
    let p = normalizePattern({ lengthSteps: 16 });
    p = addPatternRow(p, { id: "r1", assignment: { type: "note", pitch: 36 } });
    expect(p.rows[0]!.steps).toHaveLength(16);
    expect(p.rows[0]!.steps.every((s) => !s.on)).toBe(true);

    for (let i = 2; i <= STEP_PATTERN_MAX_ROWS; i++) {
      p = addPatternRow(p, { id: `r${i}`, assignment: { type: "note", pitch: 36 } });
    }
    expect(p.rows).toHaveLength(128);
    expect(() =>
      addPatternRow(p, { id: "r129", assignment: { type: "note", pitch: 36 } })
    ).toThrow(/128/);
    expect(p.rows).toHaveLength(128);
  });

  it("SQ4: row labels and note -> melodic conversion on Note/Octave step edit", () => {
    const kitRow = makeRow({ assignment: { type: "kit", pad: 0 } });
    expect(rowLabel(kitRow, DR1)).toBe(DR1.pads[0]!.name);
    const drumNote = makeRow({ assignment: { type: "note", pitch: 38 } });
    expect(rowLabel(drumNote, DR1)).toBe("Snare");
    const pitched = makeRow({ assignment: { type: "note", pitch: 60 } });
    expect(rowLabel(pitched)).toBe("C3");
    const deg = makeRow({ assignment: { type: "degree", degree: "root", octave: 3 } });
    expect(rowLabel(deg)).toBe("Root : 3");
    const cc = makeRow({ assignment: { type: "automation", target: { kind: "cc", cc: 74 } } });
    expect(rowLabel(cc)).toBe("CC 74");

    const edited = setStepValue(pitched, 0, { note: 2 });
    expect(edited.assignment).toEqual({ type: "melodic", pitch: 60 });
    expect(edited.steps[0]!.note).toBe(2);
    expect(edited.steps[0]!.on).toBe(true);
  });

  it("SQ5: normalizeStep({}) returns defaults and compactStep omits default fields", () => {
    const norm = normalizeStep({});
    expect(norm).toEqual({
      on: false,
      velocity: 100,
      gate: 100,
      tie: false,
      note: 0,
      octave: undefined,
      repeat: 1,
      chance: 100,
      offset: 0,
      stepRate: undefined,
      skip: false,
      value: undefined,
      condition: { type: "always" },
      midiChannel: undefined,
      articulation: 0,
      velocityRamp: 0,
      velocityCurve: 0,
      distribution: 0
    });
    expect(compactStep(norm)).toEqual({});
    expect(compactStep({ on: true, velocity: 100, gate: 80 })).toEqual({
      on: true,
      gate: 80
    });
  });

  it("SQ6 & SQ60: stepRateTicks matches all 22 contract vectors", () => {
    const expected: Record<string, number> = {
      "1/4": 960, "1/8": 480, "1/16": 240, "1/32": 120, "1/64": 60,
      "1/2": 1920, "1": 3840, "2": 7680, "4": 15360,
      "1T": 2560, "2T": 1280, "4T": 640, "8T": 320, "16T": 160, "32T": 80,
      "1D": 5760, "2D": 2880, "4D": 1440, "8D": 720, "16D": 360, "32D": 180, "64D": 90
    };
    expect(STEP_RATES).toHaveLength(22);
    for (const [rate, ticks] of Object.entries(expected)) {
      expect(stepRateTicks(rate as (typeof STEP_RATES)[number])).toBe(ticks);
    }
  });

  it("SQ7: resizing pattern length repeats steps on grow and keeps shorter rows intact", () => {
    const base = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, {}, { on: true }, {}]
        })
      ]
    });
    const grown = resizePatternLength(base, 8);
    expect(grown.lengthSteps).toBe(8);
    expect(grown.rows[0]!.lengthSteps).toBe(8);
    expect(grown.rows[0]!.steps.map((s) => Boolean(s.on))).toEqual([
      true, false, true, false, true, false, true, false
    ]);

    const poly = normalizePattern({
      lengthSteps: 16,
      rows: [
        makeRow({ id: "full", lengthSteps: 16, loopEnd: 16 }),
        makeRow({ id: "short", lengthSteps: 12, loopEnd: 12 })
      ]
    });
    const doubled = resizePatternLength(poly, 32);
    expect(doubled.rows[0]!.lengthSteps).toBe(32);
    expect(doubled.rows[1]!.lengthSteps).toBe(12);
  });

  it("SQ8: subrows pick next unused mode and refuse duplicate modes", () => {
    const row = makeRow({ assignment: { type: "note", pitch: 36 } });
    expect(row.subrows).toEqual(["velocity", "gate"]);
    const added = addRowSubrow(row);
    expect(added.subrows).toHaveLength(3);
    expect(new Set(added.subrows).size).toBe(3);
    expect(() => setRowSubrowMode(row, 1, "velocity")).toThrow(/already|used|duplicate/i);
  });
});

describe("SQ10–SQ19 & SQ60: pure timing, order, hash, swing, repeat, pitch and expansion", () => {
  it("SQ60: stepPitch vectors", () => {
    const mel = makeRow({ assignment: { type: "melodic", pitch: 60 } });
    expect(stepPitch(mel, normalizeStep({ note: 2, octave: 4 }), {})).toBe(74);
    const kick = makeRow({ assignment: { type: "note", pitch: 36 } });
    expect(stepPitch(kick, normalizeStep({}), {})).toBe(36);
  });

  it("SQ10 & SQ60: rowSchedule and musical length", () => {
    const p = normalizePattern({ lengthSteps: 4 });
    const plain = makeRow({ lengthSteps: 4, loopEnd: 4 });
    expect(rowSchedule(plain, p).map((e) => e.startTick)).toEqual([0, 240, 480, 720]);

    const skipped = makeRow({
      lengthSteps: 4,
      loopEnd: 4,
      steps: [{}, { skip: true }, {}, {}]
    });
    expect(rowSchedule(skipped, p)).toEqual([
      { stepIndex: 0, startTick: 0, lengthTicks: 240 },
      { stepIndex: 2, startTick: 240, lengthTicks: 240 },
      { stepIndex: 3, startTick: 480, lengthTicks: 240 }
    ]);

    const rated = makeRow({
      lengthSteps: 4,
      loopEnd: 4,
      steps: [{}, { stepRate: "1/8" }, {}, {}]
    });
    expect(rowSchedule(rated, p).map((e) => e.startTick)).toEqual([0, 240, 720, 960]);

    const poly = normalizePattern({
      lengthSteps: 16,
      rows: [
        makeRow({ id: "a", lengthSteps: 16, loopEnd: 16 }),
        makeRow({ id: "b", lengthSteps: 12, loopEnd: 12 })
      ]
    });
    expect(patternMusicalLengthTicks(poly)).toBe(3 * 3840);
  });

  it("SQ11 & SQ60: playOrder vectors and seeded shuffle determinism", () => {
    expect(playOrder(4, "pingPong", 1, 0)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(playOrder(4, "pendulum", 1, 0)).toEqual([0, 1, 2, 3, 2, 1]);
    expect(playOrder(4, "backward", 1, 0)).toEqual([3, 2, 1, 0]);
    expect(playOrder(4, "forward", 1, 0)).toEqual([0, 1, 2, 3]);

    const s1 = playOrder(8, "shuffle", 42, 0);
    const s2 = playOrder(8, "shuffle", 42, 0);
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("SQ13 & SQ60: stepHash determinism, pinned vectors and chance 50 distribution", () => {
    const vals = Array.from({ length: 8 }, (_, step) => stepHash(1, "r1", step, 0));
    expect(vals).toEqual([
      0.610313039040193,
      0.8670367666054517,
      0.18793113180436194,
      0.556410985533148,
      0.7286084741353989,
      0.7894805644173175,
      0.6733130663633347,
      0.4385056395549327
    ]);
    expect(playOrder(8, "shuffle", 7, 0, "r1")).toEqual([7, 6, 1, 0, 4, 2, 5, 3]);
    expect(playOrder(8, "random", 7, 0, "r1")).toEqual([2, 4, 2, 3, 7, 4, 6, 6]);
    expect(playOrder(8, "wander", 7, 0, "r1")).toEqual([0, 7, 6, 7, 0, 1, 0, 1]);
    expect(playOrder(8, "wander", 7, 1, "r1")).toEqual([0, 7, 6, 5, 6, 5, 6, 7]);

    let hits = 0;
    for (let cycle = 0; cycle < 1000; cycle++) {
      if (stepHash(7, "r1", 0, cycle) * 100 < 50) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(450);
    expect(hits).toBeLessThanOrEqual(550);
  });

  it("SQ14 & SQ60: swingDelay vectors", () => {
    expect(swingDelay(240, "1/16", 50)).toBe(60);
    expect(swingDelay(480, "1/16", 50)).toBe(0);
    expect(swingDelay(0, "1/16", 50)).toBe(0);
    expect(swingDelay(480, "1/8", 100)).toBe(240);
  });

  it("SQ15 & SQ60: repeatPositions and repeatVelocities vectors", () => {
    expect(repeatPositions(240, 4, 0)).toEqual([0, 60, 120, 180]);
    expect(repeatVelocities(100, 4, -100, 0)).toEqual([100, 67, 33, 1]);
    // Positive distribution gives longer gaps at the start (accelerando).
    const accel = repeatPositions(240, 4, 100);
    expect(accel[1]! - accel[0]!).toBeGreaterThan(240 - accel[3]!);
  });

  it("SQ18 & SQ19: key change, noTranspose, scaleQuantize and degree rows", () => {
    const pat = normalizePattern({
      lengthSteps: 4,
      key: { tonic: 0, mode: "major" },
      rows: [
        makeRow({
          id: "m",
          assignment: { type: "melodic", pitch: 60 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, {}, {}, {}]
        })
      ]
    });
    const toD = setPatternKey(pat, { tonic: 2, mode: "major" });
    expect(expandPattern(toD, { clipLengthTicks: 960 }).notes[0]!.pitch).toBe(62);

    const noT = setPatternKey({ ...pat, noTranspose: true }, { tonic: 2, mode: "major" });
    expect(expandPattern(noT, { clipLengthTicks: 960 }).notes[0]!.pitch).toBe(60);

    // Degree rows over E minor play E, G, B (64, 67, 71).
    const degPat = normalizePattern({
      lengthSteps: 4,
      pitchSource: "chords",
      rows: [
        makeRow({ id: "d1", assignment: { type: "degree", degree: "root", octave: 3 }, lengthSteps: 4, loopEnd: 4, steps: [{ on: true }, {}, {}, {}] }),
        makeRow({ id: "d3", assignment: { type: "degree", degree: "3rd", octave: 3 }, lengthSteps: 4, loopEnd: 4, steps: [{ on: true }, {}, {}, {}] }),
        makeRow({ id: "d5", assignment: { type: "degree", degree: "5th", octave: 3 }, lengthSteps: 4, loopEnd: 4, steps: [{ on: true }, {}, {}, {}] }),
        makeRow({ id: "d7", assignment: { type: "degree", degree: "7th", octave: 3 }, lengthSteps: 4, loopEnd: 4, steps: [{ on: true }, {}, {}, {}] })
      ]
    });
    const em = [{ id: "ch1", startTick: 0, durationTick: 3840, root: 4, quality: "min" as const, inversion: 0 }];
    const expanded = expandPattern(degPat, { clipLengthTicks: 960, chords: em });
    expect(expanded.notes.map((n) => n.pitch)).toEqual([64, 67, 71, 74]);
    // No chord -> plays nothing.
    expect(expandPattern(degPat, { clipLengthTicks: 960, chords: [] }).notes).toEqual([]);
  });

  it("SQ60: all 12 oracle expansion fixtures", () => {
    // 1. Four-on-the-floor
    const f1 = patternFromText("Kick: x... x... x... x...");
    const e1 = expandPattern(f1, { clipLengthTicks: 3840 });
    expect(e1.notes.map((n) => [n.pitch, n.startTick, n.durationTick])).toEqual([
      [36, 0, 240],
      [36, 960, 240],
      [36, 1920, 240],
      [36, 2880, 240]
    ]);

    // 2. Ties and gate
    const f2 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 60 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, { tie: true }, { tie: true, gate: 100 }, { on: true, gate: 50 }]
        })
      ]
    });
    expect(expandPattern(f2, { clipLengthTicks: 960 }).notes.map((n) => [n.startTick, n.durationTick])).toEqual([
      [0, 720],
      [720, 120]
    ]);

    // 3. Legato
    const f3 = normalizePattern({
      lengthSteps: 4,
      legato: true,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 60 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, gate: 100 }, {}, {}, {}]
        })
      ]
    });
    expect(expandPattern(f3, { clipLengthTicks: 960 }).notes[0]!.durationTick).toBe(241);

    // 4. Swing 1/8 and 1/16
    const f4a = normalizePattern({
      lengthSteps: 4,
      swing: 50,
      swingDivision: "1/16",
      rows: [
        makeRow({
          id: "r1",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, { on: true }, { on: true }, {}]
        })
      ]
    });
    expect(expandPattern(f4a, { clipLengthTicks: 960 }).notes.map((n) => n.startTick)).toEqual([0, 300, 480]);

    const f4b = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/8",
      swing: 100,
      swingDivision: "1/8",
      rows: [
        makeRow({
          id: "r1",
          stepRate: "1/8",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, { on: true }, { on: true }, {}]
        })
      ]
    });
    expect(expandPattern(f4b, { clipLengthTicks: 1920 }).notes.map((n) => n.startTick)).toEqual([0, 720, 960]);

    // 5. Offset at clip start clamped to 0
    const f5 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, offset: -50 }, {}, {}, {}]
        })
      ]
    });
    expect(expandPattern(f5, { clipLengthTicks: 960 }).notes[0]!.startTick).toBe(0);

    // 6. Repeat with distribution and ramp
    const f6 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, repeat: 4, velocity: 100, velocityRamp: -100, distribution: 0 }, {}, {}, {}]
        })
      ]
    });
    const e6 = expandPattern(f6, { clipLengthTicks: 960 });
    expect(e6.notes.map((n) => [n.startTick, n.velocity])).toEqual([
      [0, 100],
      [60, 67],
      [120, 33],
      [180, 1]
    ]);

    // 7. Chance 50 seed 7 deterministic and sensitive to seed
    const f7 = normalizePattern({
      seed: 7,
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, chance: 50 }, { on: true, chance: 50 }, { on: true, chance: 50 }, { on: true, chance: 50 }]
        })
      ]
    });
    const e7a = expandPattern(f7, { clipLengthTicks: 3840 });
    const e7b = expandPattern(f7, { clipLengthTicks: 3840 });
    const e7c = expandPattern({ ...f7, seed: 8 }, { clipLengthTicks: 3840 });
    expect(e7a.notes).toEqual(e7b.notes);
    expect(e7a.notes.map((n) => n.startTick)).not.toEqual(e7c.notes.map((n) => n.startTick));

    // 8. Recurrence 2 of 3
    const f8 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, condition: { type: "recurrence", iteration: 2, cycles: 3 } }, {}, {}, {}]
        })
      ]
    });
    expect(expandPattern(f8, { clipLengthTicks: 6 * 960 }).notes.map((n) => n.startTick)).toEqual([
      960,
      4 * 960
    ]);

    // 9. Ping-pong row
    const f9 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "melodic", pitch: 60 },
          playback: "pingPong",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [
            { on: true, note: 0 },
            { on: true, note: 2 },
            { on: true, note: 4 },
            { on: true, note: 7 }
          ]
        })
      ]
    });
    expect(expandPattern(f9, { clipLengthTicks: 1920 }).notes.map((n) => n.pitch)).toEqual([
      60, 62, 64, 67, 67, 64, 62, 60
    ]);

    // 10. Polymeter 16 against 12 over 3 bars
    const f10 = normalizePattern({
      lengthSteps: 16,
      rows: [
        makeRow({ id: "r16", assignment: { type: "note", pitch: 36 }, lengthSteps: 16, loopEnd: 16, steps: Array.from({ length: 16 }, (_, i) => (i === 0 ? { on: true } : {})) }),
        makeRow({ id: "r12", assignment: { type: "note", pitch: 42 }, lengthSteps: 12, loopEnd: 12, steps: Array.from({ length: 12 }, (_, i) => (i === 0 ? { on: true } : {})) })
      ]
    });
    const e10 = expandPattern(f10, { clipLengthTicks: 3 * 3840 });
    expect(e10.notes.filter((n) => n.pitch === 36).map((n) => n.startTick)).toEqual([0, 3840, 7680]);
    expect(e10.notes.filter((n) => n.pitch === 42).map((n) => n.startTick)).toEqual([0, 2880, 5760, 8640]);

    // 11. Kit row with Note +3 (SQ42)
    const f11 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "k0",
          assignment: { type: "kit", pad: 0 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, note: 3 }, {}, {}, {}]
        })
      ]
    });
    const e11 = expandPattern(f11, { clipLengthTicks: 960, instrument: DR1 });
    expect(e11.notes[0]!.pitch).toBe(DR1.baseNote);
    expect(e11.notes[0]!.expression?.pitch).toEqual([{ tick: 0, value: 3 }]);

    // 12. CC row latch and slide (SQ16)
    const f12 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "cc74",
          assignment: { type: "automation", target: { kind: "cc", cc: 74 } },
          automationMode: "latch",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, value: 0 }, {}, { on: true, value: 127 }, {}]
        }),
        makeRow({
          id: "cc1",
          assignment: { type: "automation", target: { kind: "cc", cc: 1 } },
          automationMode: "slide",
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true, value: 10 }, {}, { on: true, value: 110 }, {}]
        })
      ]
    });
    const e12 = expandPattern(f12, { clipLengthTicks: 960 });
    expect(e12.controllers).toHaveLength(2);
    expect(e12.controllers[0]!.interpolation).toBe("step");
    expect(e12.controllers[0]!.points.map((p) => [p.tick, p.value])).toEqual([
      [0, 0],
      [480, 127]
    ]);
    expect(e12.controllers[1]!.interpolation).toBe("linear");
    expect(e12.controllers[1]!.points.map((p) => [p.tick, p.value])).toEqual([
      [0, 10],
      [480, 110]
    ]);
  });
});

describe("SQ47 & SQ21: pattern text and MIDI <-> Pattern conversion", () => {
  it("SQ47: patternFromText and patternToText round-trip on, tie, skip and 3 velocities", () => {
    const p = patternFromText("Kick: x.x- ..X.");
    expect(p.lengthSteps).toBe(8);
    expect(p.rows).toHaveLength(1);
    const steps = p.rows[0]!.steps;
    expect(steps[0]!.on).toBe(true);
    expect(steps[2]!.on).toBe(true);
    expect(steps[3]!.tie).toBe(true);
    expect(steps[6]!.on).toBe(true);
    expect(steps[6]!.velocity).toBe(127);

    const p2 = patternFromText("Kick: xXo. -_..");
    expect(patternToText(p2)).toBe("Kick: xXo. -_..");
  });

  it("SQ21: four-on-the-floor MIDI converts to steps 0, 4, 8, 12 and back to original notes", () => {
    const notes: MidiNote[] = [0, 960, 1920, 2880].map((startTick, i) => ({
      id: `n${i}`,
      pitch: 36,
      velocity: 100,
      startTick,
      durationTick: 240
    }));
    const { pattern, droppedNotes, mergedCollisions } = midiToPattern(notes, [], {
      clipLengthTicks: 3840
    });
    expect(droppedNotes).toBe(0);
    expect(mergedCollisions).toBe(0);
    expect(pattern.rows).toHaveLength(1);
    expect(
      pattern.rows[0]!.steps.map((s, i) => (s.on ? i : -1)).filter((i) => i >= 0)
    ).toEqual([0, 4, 8, 12]);

    const back = expandPattern(pattern, { clipLengthTicks: 3840 });
    expect(
      back.notes.map((n) => ({
        pitch: n.pitch,
        velocity: n.velocity,
        startTick: n.startTick,
        durationTick: n.durationTick
      }))
    ).toEqual(
      notes.map((n) => ({
        pitch: n.pitch,
        velocity: n.velocity,
        startTick: n.startTick,
        durationTick: n.durationTick
      }))
    );
  });

  it("SQ1: validateStepPattern catches > 128 rows and duplicate subrows", () => {
    const base = normalizePattern({});
    const dupSubrows: StepPattern = {
      ...base,
      rows: [makeRow({ id: "r1", subrows: ["velocity", "velocity"] })]
    };
    expect(validateStepPattern(dupSubrows).join("\n")).toMatch(/duplicate subrow/i);

    const tooMany: StepPattern = {
      ...base,
      rows: Array.from({ length: 129 }, (_, i) => makeRow({ id: `r${i}` }))
    };
    expect(validateStepPattern(tooMany).join("\n")).toMatch(/128/);
  });
});
