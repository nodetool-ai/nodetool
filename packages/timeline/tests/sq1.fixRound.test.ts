/**
 * SQ1 Fix Round Wave 2 — Pure timeline expansion, synthesis, cache key, loop,
 * ripple/roll, join and harmony defects (F2, F3, F4, F8–F12, F14, F18–F21, F28, F34).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  applyClipHarmony,
  automationValueAt,
  deriveTrackAutomationFromPatterns,
  expandMidiLoop,
  expandPattern,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  midiClipNoteEvents,
  midiClipVoiceEvents,
  midiRenderKey,
  midiToPattern,
  normalizePattern,
  nudgeRowValues,
  patternFromText,
  playOrder,
  randomizePatternSteps,
  renderSamplerVoices,
  rippleTrim,
  rollEdit,
  splitClip,
  stepPitch,
  transposeRowSteps,
  unrollLoopedClip,
  type DrumMidiInstrument,
  type MidiNote,
  type SamplerMidiInstrument,
  type StepPattern,
  type StepRow,
  type TimelineClip
} from "../src/index.js";
import { applyTimelineOp, serializeClip, type TimelineOpState } from "../src/ops/index.js";
import { directContext } from "../src/testing/ops.js";

const DR1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;
const BAR_MS = 2000; // 120 BPM, 4/4

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
    subrows: ["velocity", "gate"],
    steps: Array.from({ length: lengthSteps }, () => ({})),
    ...overrides
  };
}

function patClip(
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

describe("SQ1 Fix Round — Pure timeline engine (Wave 2)", () => {
  it("F2 & F34: deriveTrackAutomationFromPatterns preserves stored lane before/after clip and holds on latch entry", () => {
    const slideRow = makeRow({
      id: "cut",
      assignment: {
        type: "automation",
        target: { kind: "device", deviceId: "instrument", param: "filter.cutoff" }
      },
      lengthSteps: 4,
      loopEnd: 4,
      stepRate: "1/4",
      automationMode: "slide",
      subrows: ["value"],
      steps: [{ on: true, value: 200 }, {}, { on: true, value: 1200 }, {}]
    });
    const clip = patClip(
      normalizePattern({ lengthSteps: 4, stepRate: "1/4", rows: [slideRow] }),
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

    const merged = deriveTrackAutomationFromPatterns(track, [clip], {
      tracks: [track],
      tempo: DEFAULT_TEMPO
    });
    const pts = merged[0]!.points;
    // Before clip: stored linear lane (500 @ 0 -> 800 @ 4000) is 537.5 at 500ms.
    expect(automationValueAt(pts, 0)).toBeCloseTo(500, 3);
    expect(automationValueAt(pts, 500)).toBeCloseTo(537.5, 2);
    // Inside clip: slide 200 @ 1000 -> 1200 @ 2000, holding 1200 until clipEnd 3000.
    expect(automationValueAt(pts, 1000)).toBeCloseTo(200, 3);
    expect(automationValueAt(pts, 1500)).toBeCloseTo(700, 2);
    expect(automationValueAt(pts, 2000)).toBeCloseTo(1200, 3);
    expect(automationValueAt(pts, 2500)).toBeCloseTo(1200, 3);
    // After clip: returns to stored lane (725 @ 3000 -> 762.5 @ 3500 -> 800 @ 4000).
    expect(automationValueAt(pts, 3000)).toBeCloseTo(725, 2);
    expect(automationValueAt(pts, 3500)).toBeCloseTo(762.5, 2);
    expect(automationValueAt(pts, 4000)).toBeCloseTo(800, 3);

    // Latch mode entry hold: stored constant/linear value before clip does NOT ramp into clipPoints[0].
    const latchRow = makeRow({
      ...slideRow,
      automationMode: "latch",
      steps: [{ on: true, value: 200 }, {}, { on: true, value: 1200 }, {}]
    });
    const latchClip = patClip(
      normalizePattern({ lengthSteps: 4, stepRate: "1/4", rows: [latchRow] }),
      { startMs: 1000, durationMs: 2000 }
    );
    const trackConst = makeTrack({
      ...track,
      automation: [
        {
          id: "stored",
          target: { kind: "device", deviceId: "instrument", param: "filter.cutoff" },
          points: [{ timeMs: 0, value: 500 }]
        }
      ]
    });
    const mergedLatch = deriveTrackAutomationFromPatterns(trackConst, [latchClip], {
      tracks: [trackConst],
      tempo: DEFAULT_TEMPO
    });
    expect(automationValueAt(mergedLatch[0]!.points, 500)).toBeCloseTo(500, 3);
    expect(automationValueAt(mergedLatch[0]!.points, 1000)).toBeCloseTo(200, 3);
    expect(automationValueAt(mergedLatch[0]!.points, 1500)).toBeCloseTo(200, 3);
    expect(automationValueAt(mergedLatch[0]!.points, 2000)).toBeCloseTo(1200, 3);
    expect(automationValueAt(mergedLatch[0]!.points, 3500)).toBeCloseTo(500, 3);
  });

  it("F3: renderSamplerVoices honors expression.pitch bends for Sampler kit rows (SQ42, D90)", () => {
    const sampleRate = 24000;
    const tone = Float32Array.from({ length: 4800 }, (_, i) =>
      Math.sin((2 * Math.PI * 220 * i) / sampleRate)
    );
    const sampler: SamplerMidiInstrument = {
      type: "sampler",
      zones: [
        {
          id: "z0",
          name: "Kick",
          assetId: "a".repeat(32),
          rootNote: 36,
          lowNote: 36,
          highNote: 36,
          gainDb: 0
        }
      ],
      oneShot: true,
      attackMs: 0,
      releaseMs: 50,
      gainDb: 0
    };
    const samples = { ["a".repeat(32)]: { samples: tone, sampleRate } };

    const plainOut = new Float32Array(2400);
    renderSamplerVoices(
      plainOut,
      [{ pitch: 36, velocity: 100, startFrame: 0, gateOffFrame: 2400 }],
      sampler,
      sampleRate,
      samples
    );

    const bentOut = new Float32Array(2400);
    renderSamplerVoices(
      bentOut,
      [
        {
          pitch: 36,
          velocity: 100,
          startFrame: 0,
          gateOffFrame: 2400,
          expression: { pitch: [{ frame: 0, value: 7 }] }
        }
      ],
      sampler,
      sampleRate,
      samples
    );

    let maxDiff = 0;
    for (let i = 0; i < plainOut.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(plainOut[i]! - bentOut[i]!));
    }
    expect(maxDiff).toBeGreaterThan(0.2);

    // Compare against an unbent zone whose rootNote is 7 semitones lower (identical rate = 2^(7/12)).
    const refSampler: SamplerMidiInstrument = {
      ...sampler,
      zones: [{ ...sampler.zones[0]!, rootNote: 29 }]
    };
    const refOut = new Float32Array(2400);
    renderSamplerVoices(
      refOut,
      [{ pitch: 36, velocity: 100, startFrame: 0, gateOffFrame: 2400 }],
      refSampler,
      sampleRate,
      samples
    );
    for (let i = 0; i < refOut.length; i++) {
      expect(bentOut[i]).toBeCloseTo(refOut[i]!, 5);
    }
  });

  it("F4: serializeClip/expandMidiLoop resolves chords, direct helpers accept instrument, and midiRenderKey hashes chord/key/startMs", () => {
    const degPat = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      pitchSource: "chords",
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "degree", degree: "root", octave: 3 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        })
      ]
    });
    const chords = [
      { id: "ch1", startTick: 0, durationTick: 3840, root: 7, quality: "maj" as const, inversion: 0 }
    ];
    const clip = patClip(degPat, { startMs: 0, durationMs: BAR_MS });
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({ id: "t_chords", type: "chord", name: "Chords", index: 0, chords }),
        makeTrack({ id: "t_midi", type: "midi", name: "Keys", index: 1, instrument: DEFAULT_MIDI_INSTRUMENT })
      ],
      clips: [clip],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const serialized = serializeClip(state, clip);
    expect(serialized.audibleNoteCount).toBe(1);

    // Direct voice/note helpers with custom DR-1 baseNote: 48 and Sampler rootNote: 60.
    const kitPat = normalizePattern({
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
    const kitClip = patClip(kitPat, { durationMs: 500 });
    const dr48: DrumMidiInstrument = { ...DR1, baseNote: 48 };
    const voiceEvents = (midiClipVoiceEvents as (...a: unknown[]) => Array<{ pitch: number }>)(
      kitClip,
      120,
      24000,
      0,
      dr48
    );
    expect(voiceEvents[0]!.pitch).toBe(48);

    const noteEvents = (midiClipNoteEvents as (...a: unknown[]) => Array<{ on: boolean; pitch: number }>)(
      kitClip,
      120,
      Number.NEGATIVE_INFINITY,
      0,
      dr48
    ).filter((e) => e.on);
    expect(noteEvents[0]!.pitch).toBe(48);

    // midiRenderKey changes when chords, key, or clip.startMs change on a pitchSource:"chords" pattern.
    const k1 = midiRenderKey({
      clip: patClip(degPat, { startMs: 0 }),
      bpm: 120,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: 48000,
      ...({ chords, key: { tonic: "C", mode: "major" } } as Record<string, unknown>)
    });
    const kMoved = midiRenderKey({
      clip: patClip(degPat, { startMs: 2000 }),
      bpm: 120,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: 48000,
      ...({ chords, key: { tonic: "C", mode: "major" } } as Record<string, unknown>)
    });
    const kOtherChord = midiRenderKey({
      clip: patClip(degPat, { startMs: 0 }),
      bpm: 120,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: 48000,
      ...({
        chords: [{ ...chords[0]!, root: 2 }],
        key: { tonic: "C", mode: "major" }
      } as Record<string, unknown>)
    });
    expect(k1).not.toBe(kMoved);
    expect(k1).not.toBe(kOtherChord);
  });

  it("F8: playOrder (random/shuffle/wander) and chance use independent salted hashes", () => {
    const row = makeRow({
      id: "r1",
      assignment: { type: "note", pitch: 60 },
      playback: "random",
      lengthSteps: 16,
      loopEnd: 16,
      steps: Array.from({ length: 16 }, () => ({ on: true, chance: 50 }))
    });
    const pat = normalizePattern({ seed: 13, lengthSteps: 16, rows: [row] });
    const cycles = 200;
    const expanded = expandPattern(pat, { clipLengthTicks: cycles * 16 * 240 });

    const playedAtSlot = new Set(expanded.notes.map((n) => Math.round(n.startTick / 240)));
    let upperSelfPicks = 0;
    let upperSelfHits = 0;
    let lowerSelfPicks = 0;
    let lowerSelfHits = 0;
    for (let c = 0; c < cycles; c++) {
      const order = playOrder(16, "random", 13, c, "r1");
      for (let i = 0; i < 16; i++) {
        if (order[i] === i) {
          const hit = playedAtSlot.has(c * 16 + i);
          if (i >= 8) {
            upperSelfPicks++;
            if (hit) upperSelfHits++;
          } else {
            lowerSelfPicks++;
            if (hit) lowerSelfHits++;
          }
        }
      }
    }
    expect(upperSelfPicks).toBeGreaterThan(20);
    expect(lowerSelfPicks).toBeGreaterThan(20);
    // Unsalted hash gives upperSelfHits === 0 and lowerSelfHits === lowerSelfPicks.
    expect(upperSelfHits).toBeGreaterThan(0);
    expect(lowerSelfHits).toBeLessThan(lowerSelfPicks);
  });

  it("F9: tie chains check conditionPasses and chance on tied steps (SQ12)", () => {
    const patChance0 = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 60 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, { tie: true, chance: 0 }, {}, {}]
        })
      ]
    });
    expect(expandPattern(patChance0, { clipLengthTicks: 960 }).notes[0]!.durationTick).toBe(240);

    const patFirst = normalizePattern({
      lengthSteps: 4,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 60 },
          lengthSteps: 4,
          loopEnd: 4,
          steps: [{ on: true }, { tie: true, condition: { type: "first" } }, {}, {}]
        })
      ]
    });
    const eFirst = expandPattern(patFirst, { clipLengthTicks: 1920 });
    expect(eFirst.notes.map((n) => n.durationTick)).toEqual([480, 240]);
  });

  it("F10: wander steps +/-1 (wrapping) continuously across cycle boundaries (SQ11)", () => {
    const n = 8;
    let prevEnd = playOrder(n, "wander", 7, 0, "r1")[n - 1]!;
    for (let cycle = 1; cycle <= 12; cycle++) {
      const ord = playOrder(n, "wander", 7, cycle, "r1");
      const diff = (ord[0]! - prevEnd + n) % n;
      expect(diff === 1 || diff === n - 1).toBe(true);
      prevEnd = ord[n - 1]!;
    }
  });

  it("F11: negative offset crossing a split boundary stays audible in the left half (SQ23)", () => {
    const pat = normalizePattern({
      lengthSteps: 16,
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 36 },
          lengthSteps: 16,
          loopEnd: 16,
          steps: Array.from({ length: 16 }, (_, i) =>
            i === 0 ? { on: true, offset: -25 } : {}
          )
        })
      ]
    });
    const orig = patClip(pat, { durationMs: 2 * BAR_MS });
    const beforeTicks = expandPattern(pat, { clipLengthTicks: 7680 }).notes.map(
      (n) => n.startTick
    );
    expect(beforeTicks).toContain(3780);

    const [left, right] = splitClip(orig, BAR_MS, { bpm: 120 });
    const leftTicks = expandPattern(left.pattern!, {
      clipLengthTicks: 3840,
      patternPhaseTicks: left.patternPhaseTicks ?? 0
    }).notes.map((n) => n.startTick);
    const rightTicks = expandPattern(right.pattern!, {
      clipLengthTicks: 3840,
      patternPhaseTicks: right.patternPhaseTicks ?? 0
    }).notes.map((n) => 3840 + n.startTick);

    expect([...leftTicks, ...rightTicks]).toContain(3780);
  });

  it("F12 (expand): stepPitch silences degree rows when pattern.pitchSource is not chords", () => {
    const patOff = normalizePattern({ pitchSource: "off", lengthSteps: 4 });
    const degRow = makeRow({
      assignment: { type: "degree", degree: "root", octave: 3 },
      lengthSteps: 4,
      loopEnd: 4
    });
    const chords = [
      { id: "ch1", startTick: 0, durationTick: 3840, root: 7, quality: "maj" as const, inversion: 0 }
    ];
    expect(stepPitch(degRow, {}, { pattern: patOff, chords, docTick: 0 })).toBeNull();
  });

  it("F14: transposeRowSteps preserves explicit step.octave and handles kit rows with instrument", () => {
    // 1. Melodic row pitch 71 (B3) with step octave 3 (71): +1 -> C4 (72), +12 -> B4 (83).
    const mel = makeRow({
      assignment: { type: "melodic", pitch: 71 },
      lengthSteps: 4,
      loopEnd: 4,
      steps: [{ on: true, octave: 3 }, {}, {}, {}]
    });
    const up1 = transposeRowSteps(mel, 1);
    expect(stepPitch(up1, up1.steps[0]!, {})).toBe(72);
    const up12 = transposeRowSteps(mel, 12);
    expect(stepPitch(up12, up12.steps[0]!, {})).toBe(83);

    // 2. Whole-row transpose on kit row bends active steps (not a no-op).
    const kit = makeRow({
      assignment: { type: "kit", pad: 0 },
      lengthSteps: 4,
      loopEnd: 4,
      steps: [{ on: true }, {}, {}, {}]
    });
    const kitUp3 = transposeRowSteps(kit, 3);
    expect(kitUp3.steps[0]!.note).toBe(3);

    // 3. Step-indexed kit transpose with DR-1 baseNote: 48 (octave 2) wraps octave from 2, not 1.
    const dr48: DrumMidiInstrument = { ...DR1, baseNote: 48 };
    const kitUp14 = (transposeRowSteps as (...a: unknown[]) => StepRow)(kit, 14, [0], dr48);
    expect(kitUp14.steps[0]!.note).toBe(2);
    expect(kitUp14.steps[0]!.octave).toBe(3);
  });

  it("F18 (pure): nudgeRowValues and randomizePatternSteps handle melodic promotion, kit octave, and device ranges", () => {
    // 1. Nudging note/octave and randomizing octave on fixed note row converts to melodic.
    const fixed = makeRow({
      assignment: { type: "note", pitch: 60 },
      lengthSteps: 4,
      loopEnd: 4,
      steps: [{ on: true }, {}, {}, {}]
    });
    expect(nudgeRowValues(fixed, "note", 1).assignment.type).toBe("melodic");
    expect(nudgeRowValues(fixed, "octave", 1).assignment.type).toBe("melodic");
    const randOct = randomizePatternSteps(
      normalizePattern({ lengthSteps: 4, rows: [fixed] }),
      "octave",
      { seed: 7 }
    );
    expect(randOct.rows[0]!.assignment.type).toBe("melodic");

    // 2. Nudging octave +1 on DR-1 pad 0 (MIDI 36 = octave 1) lands on octave 2, not 4.
    const kit = makeRow({
      assignment: { type: "kit", pad: 0 },
      lengthSteps: 4,
      loopEnd: 4,
      steps: [{ on: true }, {}, {}, {}]
    });
    const kitOctUp = (nudgeRowValues as (...a: unknown[]) => StepRow)(kit, "octave", 1, DR1);
    expect(kitOctUp.steps[0]!.octave).toBe(2);

    // 3. Device automation row value is NOT clamped to 0..127 on nudge or randomize.
    const devRow = makeRow({
      assignment: {
        type: "automation",
        target: { kind: "device", deviceId: "instrument", param: "cutoffHz" }
      },
      lengthSteps: 4,
      loopEnd: 4,
      subrows: ["value"],
      steps: [{ on: true, value: 2000 }, { on: true, value: 4000 }, {}, {}]
    });
    expect(nudgeRowValues(devRow, "value", 1).steps[0]!.value).toBe(2001);
    const randDev = randomizePatternSteps(
      normalizePattern({ lengthSteps: 4, rows: [devRow] }),
      "value",
      { seed: 7 }
    );
    expect(randDev.rows[0]!.steps[0]!.value).toBeGreaterThan(127);
  });

  it("F19: midiToPattern keeps valid late notes inside the clip's last step instead of dropping them", () => {
    const notes: MidiNote[] = [
      { id: "n1", pitch: 36, velocity: 100, startTick: 3730, durationTick: 100 }
    ];
    const res = midiToPattern(notes, [], { clipLengthTicks: 3840, stepRate: "1/16" });
    expect(res.droppedNotes).toBe(0);
    expect(res.pattern.rows).toHaveLength(1);
    expect(res.pattern.rows[0]!.steps[15]!.on).toBe(true);
    expect(res.pattern.rows[0]!.steps[15]!.offset).toBe(50);
  });

  it("F20 (rippleEdit): rippleTrim and rollEdit pass bpm to trimClip on pattern start trims", () => {
    // 90 BPM: 1 beat = 666.6667ms = 960 ticks (at 120 BPM it would be 1280 ticks).
    const beatMs90 = 60000 / 90;
    const pat = patternFromText("Kick: x... x... x... x...");
    const clip = patClip(pat, { id: "p1", startMs: 0, durationMs: 4 * beatMs90 });

    const rippled = rippleTrim([clip], "p1", "start", -beatMs90, { bpm: 90 });
    expect(rippled[0]!.patternPhaseTicks).toBe(960);

    const left = patClip(pat, { id: "l1", startMs: 0, durationMs: 2 * beatMs90 });
    const right = patClip(pat, { id: "r1", startMs: 2 * beatMs90, durationMs: 2 * beatMs90 });
    const rolled = rollEdit([left, right], "l1", "end", beatMs90, { bpm: 90 });
    expect(rolled.find((c) => c.id === "r1")!.patternPhaseTicks).toBe(960);
  });

  it("F21: join_clips preserves head slip phase, checks phase continuity, and unrollLoopedClip clears inPointMs & advances cycle", async () => {
    const pat = patternFromText("Kick: x... x... x.x. ....");
    // 1. Head clip with inPointMs = 500 (960 ticks) joined with continuous right clip.
    const a1 = patClip(pat, { id: "a1", startMs: 0, durationMs: 1000, inPointMs: 500 });
    const b1 = patClip(structuredClone(pat), {
      id: "b1",
      startMs: 1000,
      durationMs: 1000,
      patternPhaseTicks: 960 + 1920
    });
    const s1: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tempo: DEFAULT_TEMPO,
      tracks: [makeTrack({ id: "t_midi", type: "midi", name: "Drums", index: 0 })],
      clips: [a1, b1],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const res1 = await applyTimelineOp(s1, { op: "join_clips", clips: ["a1", "b1"] }, directContext(s1));
    expect(res1.error).toBeUndefined();
    expect(res1.state.clips[0]!.patternPhaseTicks).toBe(960);
    expect(res1.state.clips[0]!.inPointMs).toBe(0);

    // 2. Two touching half-bar copies (both phase 0) must NOT collapse into one pattern playing steps 9-16.
    const halfA = patClip(pat, { id: "ha", startMs: 0, durationMs: 1000 });
    const halfB = patClip(structuredClone(pat), { id: "hb", startMs: 1000, durationMs: 1000 });
    const beforeTimes = [
      ...midiClipNoteEvents(halfA, 120).filter((e) => e.on),
      ...midiClipNoteEvents(halfB, 120).filter((e) => e.on)
    ].map((e) => e.timeMs);
    const s2: TimelineOpState = { ...s1, clips: [halfA, halfB] };
    const res2 = await applyTimelineOp(s2, { op: "join_clips", clips: ["ha", "hb"] }, directContext(s2));
    expect(res2.error).toBeUndefined();
    const afterTimes = midiClipNoteEvents(res2.state.clips[0]!, 120)
      .filter((e) => e.on)
      .map((e) => e.timeMs);
    expect(afterTimes).toEqual(beforeTimes);

    // 3. unrollLoopedClip clears inPointMs on k > 0 and preserves cycle count (first-only fires once).
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
    const looped = patClip(firstPat, {
      id: "lp",
      durationMs: 2 * BAR_MS,
      loopLengthMs: BAR_MS,
      inPointMs: 250
    });
    let idSeq = 0;
    const unrolled = unrollLoopedClip(looped, 120, BAR_MS, { newId: () => `u_${++idSeq}` });
    expect(unrolled).toHaveLength(2);
    expect(unrolled[1]!.inPointMs ?? 0).toBe(0);

    const loopedZero = patClip(firstPat, {
      id: "lp0",
      durationMs: 3 * BAR_MS,
      loopLengthMs: BAR_MS
    });
    const unrolledZero = unrollLoopedClip(loopedZero, 120, BAR_MS, {
      newId: () => `uz_${++idSeq}`
    });
    const allHits = unrolledZero.flatMap((c) => midiClipNoteEvents(c, 120).filter((e) => e.on));
    expect(allHits.map((e) => e.timeMs)).toEqual([0]);
  });

  it("F28: applyClipHarmony runs active clip.harmony on expanded pattern notes", () => {
    // Pattern plays C#3 (61, out of C major); clip.harmony snaps to C major scale.
    const pat = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      rows: [
        makeRow({
          id: "r1",
          assignment: { type: "note", pitch: 61 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        })
      ]
    });
    const clip = patClip(pat, {
      harmony: {
        style: "off",
        input: "notes",
        scale: "key",
        scaleType: "major",
        scaleKey: 0
      }
    });
    const doc = {
      tracks: [makeTrack({ id: "t_midi", type: "midi", name: "Lead", index: 0 })],
      tempo: DEFAULT_TEMPO
    };
    const expanded = applyClipHarmony(clip, doc);
    expect(expanded.notes).toHaveLength(1);
    // C#3 (61) snapped to C major becomes C3 (60) or D3 (62), NOT 61!
    expect(expanded.notes![0]!.pitch).not.toBe(61);
  });

  it("F21 (round 2): unrollLoopedClip preserves cycle counts for non-dividing loop periods, nonzero phases, last condition, and wander", () => {
    // Concrete codex-review scenario: 16-step pattern at 120 BPM (2000ms full cycle),
    // looped in 500ms segments for 1500ms, step 1 conditioned "first".
    const firstPat = normalizePattern({
      lengthSteps: 16,
      stepRate: "1/16",
      seed: 11,
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
    const loopedShort = patClip(firstPat, {
      id: "lp-short",
      startMs: 0,
      durationMs: 1500,
      loopLengthMs: 500
    });
    const beforeShort = midiClipNoteEvents(loopedShort, 120)
      .filter((e) => e.on)
      .map((e) => e.timeMs);
    expect(beforeShort).toEqual([0]);

    let seq = 0;
    const unrolledShort = unrollLoopedClip(loopedShort, 120, 500, {
      newId: () => `u_short_${++seq}`
    });
    expect(unrolledShort).toHaveLength(3);
    const afterShort = unrolledShort
      .flatMap((c) => midiClipNoteEvents(c, 120).filter((e) => e.on))
      .map((e) => e.timeMs);
    expect(afterShort).toEqual(beforeShort);

    // Nonzero phase (240 ticks = 1 step) + non-dividing 500ms loop + recurrence 2/3 & last
    const mixedPat = normalizePattern({
      lengthSteps: 16,
      stepRate: "1/16",
      seed: 19,
      rows: [
        makeRow({
          id: "r-mix",
          assignment: { type: "note", pitch: 64 },
          steps: Array.from({ length: 16 }, (_, i) => {
            if (i === 0) return { on: true, condition: { type: "recurrence", iteration: 2, cycles: 3 } };
            if (i === 1) return { on: true, condition: { type: "first" } };
            if (i === 2) return { on: true, condition: { type: "last" } };
            return {};
          })
        }),
        makeRow({
          id: "r-wander",
          assignment: { type: "melodic", pitch: 48 },
          playback: "wander",
          steps: Array.from({ length: 16 }, (_, i) => ({
            on: true,
            note: (i % 7) - 3,
            chance: 50
          }))
        })
      ]
    });
    const loopedPhase = patClip(mixedPat, {
      id: "lp-phase",
      startMs: 0,
      durationMs: 1500,
      loopLengthMs: 500,
      patternPhaseTicks: 240
    });
    const beforePhase = midiClipNoteEvents(loopedPhase, 120)
      .filter((e) => e.on)
      .map((e) => [e.timeMs, e.pitch]);
    const unrolledPhase = unrollLoopedClip(loopedPhase, 120, 500, {
      newId: () => `u_phase_${++seq}`
    });
    const afterPhase = unrolledPhase
      .flatMap((c) => midiClipNoteEvents(c, 120).filter((e) => e.on))
      .map((e) => [e.timeMs, e.pitch]);
    expect(afterPhase).toEqual(beforePhase);
  });
});
