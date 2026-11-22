import { describe, expect, it } from "vitest";
import {
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE,
  MIDI_MAX_POINTS_PER_LANE
} from "../src/midi/controllers.js";
import { setExpressionPoints, setLanePoints } from "../src/midi/controllerEdit.js";
import { fitExpressionToDuration } from "../src/midi/notesEdit.js";
import { midiClipRenderControls } from "../src/midi/voice.js";
import { renderMidiClip } from "../src/midi/voice.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import type { MidiNote, TimelineClip } from "../src/types.js";

const note = (over: Partial<MidiNote> = {}): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 960,
  ...over
});

describe("fitExpressionToDuration neutral value", () => {
  it("holds the kind's neutral before the first point", () => {
    const fitted = fitExpressionToDuration(
      note({ expression: { pitch: [{ tick: 600, value: 12 }] }, durationTick: 480 })
    );
    expect(fitted.expression?.pitch).toEqual([{ tick: 480, value: 0 }]);
  });

  it("uses volume neutral 1", () => {
    const fitted = fitExpressionToDuration(
      note({ expression: { volume: [{ tick: 600, value: 0.2 }] }, durationTick: 480 })
    );
    expect(fitted.expression?.volume).toEqual([{ tick: 480, value: 1 }]);
  });
});

describe("full lane and curve", () => {
  const target = { kind: "cc" as const, cc: 1 };
  const full = setLanePoints(
    [],
    target,
    Array.from({ length: MIDI_MAX_POINTS_PER_LANE }, (_, i) => ({ tick: 10 + i, value: 1 }))
  );

  it("refuses an add to a full lane and drops nothing", () => {
    const pts = [...full[0].points, { tick: 0, value: 5 }];
    const next = setLanePoints(full, target, pts);
    expect(next[0].points).toHaveLength(MIDI_MAX_POINTS_PER_LANE);
    expect(next[0].points[next[0].points.length - 1].tick).toBe(10 + MIDI_MAX_POINTS_PER_LANE - 1);
    expect(next[0].points[0].tick).toBe(10);
  });

  it("allows a move inside a full lane", () => {
    const moved = full[0].points.map((p, i) => (i === 0 ? { ...p, value: 99 } : p));
    expect(setLanePoints(full, target, moved)[0].points[0].value).toBe(99);
  });

  it("refuses an add to a full expression curve", () => {
    const curve = Array.from({ length: MIDI_MAX_EXPRESSION_POINTS_PER_NOTE }, (_, i) => ({
      tick: i + 1,
      value: 1
    }));
    const n = note({ durationTick: 100000, expression: { pitch: curve } });
    const next = setExpressionPoints(n, "pitch", [{ tick: 0, value: 2 }, ...curve]);
    expect(next.expression?.pitch).toEqual(curve);
  });
});

describe("render controls with duplicate lane ids", () => {
  it("keys gain by lane identity", () => {
    const clip = {
      inPointMs: 0,
      durationMs: 1000,
      controllers: [
        { id: "dup", kind: "cc", cc: 7, points: [{ id: "a", tick: 0, value: 64 }] },
        { id: "dup", kind: "cc", cc: 11, points: [{ id: "b", tick: 0, value: 127 }] }
      ]
    } as unknown as TimelineClip;
    const controls = midiClipRenderControls(clip, 120, 48000);
    const last = controls.gain?.[controls.gain.length - 1];
    expect(last?.value).toBeCloseTo((64 / 127) ** 2, 6);
  });
});

describe("oscillator phase at large steps", () => {
  it("keeps a triangle in range when the step exceeds one cycle", () => {
    const clip = {
      startMs: 0,
      inPointMs: 0,
      durationMs: 200,
      notes: [
        note({
          pitch: 108,
          durationTick: 960,
          expression: { pitch: [{ tick: 0, value: 48 }] }
        })
      ]
    } as unknown as TimelineClip;
    const out = renderMidiClip({
      clip,
      bpm: 120,
      sampleRate: 48000,
      instrument: { ...DEFAULT_MIDI_INSTRUMENT, waveform: "triangle", cutoffHz: 20000 }
    });
    let min = 0;
    let max = 0;
    for (const v of out) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(-0.05);
    expect(max).toBeGreaterThan(0.05);
  });
});
