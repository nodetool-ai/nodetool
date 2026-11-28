import { describe, expect, it } from "vitest";
import { splitClip } from "../src/splitClip.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import type { MidiNote, TimelineClip } from "../src/types.js";

// 120 BPM: one quarter = 500 ms = 960 ticks.
const BPM = 120;
const note = (id: string, startTick: number, durationTick: number, extra: Partial<MidiNote> = {}): MidiNote => ({
  id,
  pitch: 60,
  velocity: 90,
  startTick,
  durationTick,
  ...extra
});

function midiClip(): TimelineClip {
  return {
    id: "m1",
    trackId: "t1",
    name: "Riff",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    notes: [
      note("a", 0, MIDI_PPQ),
      note("b", 3 * MIDI_PPQ, 2 * MIDI_PPQ, {
        expression: {
          pitch: [
            { tick: 0, value: 0 },
            { tick: 2 * MIDI_PPQ, value: 2 }
          ]
        }
      }),
      note("c", 5 * MIDI_PPQ, MIDI_PPQ)
    ],
    controllers: [
      {
        id: "cc7",
        kind: "cc",
        cc: 7,
        points: [
          { id: "p1", tick: 0, value: 100 },
          { id: "p2", tick: 6 * MIDI_PPQ, value: 50 }
        ]
      },
      { id: "late", kind: "cc", cc: 1, points: [{ id: "p3", tick: 7 * MIDI_PPQ, value: 10 }] }
    ]
  } as TimelineClip;
}

describe("splitClip on a midi clip", () => {
  // Cut at 1000 + 2000 ms = content 2000 ms = 4 quarters = 3840 ticks.
  const CUT = 4 * MIDI_PPQ;

  it("partitions notes by start and re-bases the right half", () => {
    const [l, r] = splitClip(midiClip(), 3000, { bpm: BPM });
    expect(l.notes!.map((n) => n.id)).toEqual(["a", "b"]);
    expect(r.notes!.map((n) => n.startTick)).toEqual([5 * MIDI_PPQ - CUT]);
    expect(r.inPointMs).toBe(0);
  });

  it("shortens a crossing note to the cut by default", () => {
    const [l, r] = splitClip(midiClip(), 3000, { bpm: BPM });
    // b starts at tick 3*PPQ, ends 5*PPQ, so it crosses the cut at 4*PPQ.
    const split = splitClip(midiClip(), 3000, { bpm: BPM });
    expect(split[0].notes!.find((n) => n.startTick === 3 * MIDI_PPQ)!.durationTick).toBe(MIDI_PPQ);
    expect(r.notes!.length).toBe(1);
    expect(l.notes!.length).toBe(2);
  });

  it("crossing split carries the rest of the note to the right half", () => {
    const [l, r] = splitClip(midiClip(), 3000, { bpm: BPM, crossing: "split" });
    expect(l.notes!.find((n) => n.id === "b")!.durationTick).toBe(MIDI_PPQ);
    const tail = r.notes![0]!;
    expect(tail.startTick).toBe(0);
    expect(tail.durationTick).toBe(MIDI_PPQ);
    expect(tail.id).not.toBe("b");
    // The pitch curve resumes at its interpolated value at the cut.
    expect(tail.expression!.pitch![0]).toEqual({ tick: 0, value: 1 });
    expect(tail.expression!.pitch!.at(-1)).toEqual({ tick: MIDI_PPQ, value: 2 });
    // The left part drops expression points past its new end.
    expect(l.notes!.find((n) => n.id === "b")!.expression!.pitch!.every((p) => p.tick <= MIDI_PPQ)).toBe(true);
  });

  it("partitions controllers and carries the held value to the right", () => {
    const [l, r] = splitClip(midiClip(), 3000, { bpm: BPM });
    expect(l.controllers!.map((c) => c.id)).toEqual(["cc7"]);
    // The left half keeps the ramp up to the cut, so it ends on the tick before it.
    expect(l.controllers![0]!.points.map((p) => p.tick)).toEqual([0, 4 * MIDI_PPQ - 1]);
    const right = r.controllers!;
    expect(right.map((c) => c.cc).sort()).toEqual([1, 7]);
    const lane7 = right.find((c) => c.cc === 7)!;
    expect(lane7.points[0]!.tick).toBe(0);
    // Controller values are integers, so the carried value is rounded.
    expect(lane7.points[0]!.value).toBe(Math.round(100 + (50 - 100) * (CUT / (6 * MIDI_PPQ))));
    expect(lane7.points[1]!.tick).toBe(6 * MIDI_PPQ - CUT);
  });

  it("leaves non-midi clips alone", () => {
    const clip = { ...midiClip(), mediaType: "audio" as const };
    const [l] = splitClip(clip, 3000);
    expect(l.notes).toHaveLength(3);
  });
});
