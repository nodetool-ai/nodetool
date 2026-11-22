import { describe, expect, it } from "vitest";
import {
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP,
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE,
  MIDI_MAX_POINTS_PER_LANE,
  midiControllerLane,
  midiNote,
  timelineClip
} from "../src/api-schemas/timeline.js";
import { midiNoteParams } from "../src/api-schemas/timeline-tool-params.js";

const note = { id: "n", pitch: 60, velocity: 100, startTick: 0, durationTick: 960 };
const lane = (over: Record<string, unknown> = {}) => ({
  id: "l",
  kind: "cc",
  cc: 1,
  points: [{ id: "p", tick: 0, value: 10 }],
  ...over
});
const clip = (over: Record<string, unknown> = {}) => ({
  id: "c",
  trackId: "t",
  name: "x",
  startMs: 0,
  durationMs: 1000,
  mediaType: "midi",
  sourceType: "imported",
  status: "draft",
  versions: [],
  locked: false,
  ...over
});

describe("midi note fields", () => {
  it("accepts each new field", () => {
    expect(midiNote.parse({ ...note, muted: true }).muted).toBe(true);
    expect(midiNote.parse({ ...note, channel: 0 }).channel).toBe(0);
    expect(midiNote.parse({ ...note, channel: 15 }).channel).toBe(15);
    expect(midiNote.parse({ ...note, releaseVelocity: 0 }).releaseVelocity).toBe(0);
    expect(midiNote.parse({ ...note, releaseVelocity: 127 }).releaseVelocity).toBe(127);
    const expression = {
      pitch: [{ tick: 0, value: -48 }, { tick: 960, value: 48 }],
      volume: [{ tick: 0, value: 0 }, { tick: 10, value: 4 }],
      pan: [{ tick: 0, value: -1 }],
      brightness: [{ tick: 0, value: 1 }]
    };
    expect(midiNote.parse({ ...note, expression }).expression).toEqual(expression);
  });

  it("refuses bad values", () => {
    for (const bad of [
      { muted: "yes" },
      { channel: 16 },
      { channel: -1 },
      { channel: 1.5 },
      { releaseVelocity: 128 },
      { releaseVelocity: -1 },
      { expression: { pitch: [{ tick: 0, value: 49 }] } },
      { expression: { volume: [{ tick: 0, value: 4.1 }] } },
      { expression: { volume: [{ tick: 0, value: -0.1 }] } },
      { expression: { pan: [{ tick: 0, value: 1.1 }] } },
      { expression: { brightness: [{ tick: 0, value: -0.1 }] } },
      { expression: { pitch: [{ tick: -1, value: 0 }] } },
      { expression: { pitch: [{ tick: 961, value: 0 }] } },
      { expression: { pitch: [{ tick: 500, value: 0 }, { tick: 100, value: 0 }] } },
      {
        expression: {
          pitch: Array.from({ length: MIDI_MAX_EXPRESSION_POINTS_PER_NOTE + 1 }, () => ({
            tick: 0,
            value: 0
          }))
        }
      }
    ]) {
      expect(midiNote.safeParse({ ...note, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("passes the fields through the tool params", () => {
    const parsed = midiNoteParams.parse({
      pitch: 60,
      start_tick: 0,
      duration_tick: 960,
      muted: true,
      channel: 3,
      release_velocity: 20,
      expression: { pitch: [{ tick: 0, value: 1 }] }
    });
    expect(parsed).toMatchObject({ muted: true, channel: 3, release_velocity: 20 });
    expect(() =>
      midiNoteParams.parse({ pitch: 60, start_tick: 0, duration_tick: 960, channel: 16 })
    ).toThrow();
  });
});

describe("midi controller lanes", () => {
  it("accepts every kind", () => {
    expect(midiControllerLane.safeParse(lane()).success).toBe(true);
    expect(
      midiControllerLane.safeParse(
        lane({ kind: "pitchBend", cc: undefined, points: [{ id: "p", tick: 0, value: -8192 }] })
      ).success
    ).toBe(true);
    expect(
      midiControllerLane.safeParse(lane({ kind: "channelPressure", cc: undefined, channel: 15, interpolation: "step" })).success
    ).toBe(true);
    expect(
      midiControllerLane.safeParse(lane({ kind: "polyPressure", cc: undefined, pitch: 127 })).success
    ).toBe(true);
  });

  it("refuses bad lanes", () => {
    const bad = [
      lane({ cc: undefined }),
      lane({ cc: 128 }),
      lane({ kind: "pitchBend", cc: 1 }),
      lane({ kind: "polyPressure", cc: undefined }),
      lane({ pitch: 5 }),
      lane({ channel: 16 }),
      lane({ interpolation: "cubic" }),
      lane({ points: [{ id: "p", tick: 0, value: 128 }] }),
      lane({ points: [{ id: "p", tick: 0, value: -1 }] }),
      lane({ kind: "pitchBend", cc: undefined, points: [{ id: "p", tick: 0, value: 8192 }] }),
      lane({ kind: "pitchBend", cc: undefined, points: [{ id: "p", tick: 0, value: -8193 }] }),
      lane({ points: [{ id: "p", tick: -1, value: 1 }] }),
      lane({ points: [{ id: "p", tick: 0.5, value: 1 }] }),
      lane({ points: [{ id: "a", tick: 5, value: 1 }, { id: "b", tick: 1, value: 1 }] }),
      lane({ points: [{ id: "a", tick: 0, value: 1 }, { id: "a", tick: 1, value: 1 }] }),
      lane({
        points: Array.from({ length: MIDI_MAX_POINTS_PER_LANE + 1 }, (_, i) => ({ id: `p${i}`, tick: i, value: 1 }))
      })
    ];
    for (const b of bad) expect(midiControllerLane.safeParse(b).success, JSON.stringify(b).slice(0, 80)).toBe(false);
  });

  it("allows lanes on a clip, refuses duplicates and too many", () => {
    expect(timelineClip.parse(clip({ controllers: [lane()] })).controllers).toHaveLength(1);
    expect(
      timelineClip.safeParse(clip({ controllers: [lane({ id: "a" }), lane({ id: "b" })] })).success
    ).toBe(false);
    // Same kind and cc on another channel is a different identity.
    expect(
      timelineClip.safeParse(clip({ controllers: [lane({ id: "a" }), lane({ id: "b", channel: 1 })] })).success
    ).toBe(true);
    const many = Array.from({ length: MIDI_MAX_CONTROLLER_LANES_PER_CLIP + 1 }, (_, i) => lane({ id: `l${i}`, cc: i }));
    expect(timelineClip.safeParse(clip({ controllers: many })).success).toBe(false);
  });
});

describe("midi controller lane ids", () => {
  it("rejects two lanes that share an id", () => {
    const result = timelineClip.safeParse(
      clip({
        controllers: [
          lane({ id: "dup", cc: 7 }),
          lane({ id: "dup", cc: 11, points: [{ id: "p2", tick: 0, value: 1 }] })
        ]
      })
    );
    expect(result.success).toBe(false);
  });
});
