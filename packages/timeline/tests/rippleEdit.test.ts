import { describe, expect, it } from "vitest";
import {
  closeGap,
  findGap,
  findRollNeighbour,
  rippleDelete,
  rippleTrim,
  rollEdit,
  shiftClipsFrom
} from "../src/rippleEdit.js";
import type { TimelineClip } from "../src/types.js";

function clip(
  id: string,
  startMs: number,
  durationMs: number,
  extra: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId: "v1",
    name: id,
    startMs,
    durationMs,
    inPointMs: 0,
    outPointMs: durationMs,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    ...extra
  };
}

const byId = (clips: TimelineClip[], id: string) =>
  clips.find((c) => c.id === id)!;

describe("shiftClipsFrom", () => {
  it("moves clips at or after the point and leaves earlier ones", () => {
    const clips = [clip("a", 0, 1000), clip("b", 1000, 1000), clip("c", 2000, 500)];
    const out = shiftClipsFrom(clips, 1000, -300);
    expect(byId(out, "a").startMs).toBe(0);
    expect(byId(out, "b").startMs).toBe(700);
    expect(byId(out, "c").startMs).toBe(1700);
  });

  it("skips excluded clips and locked tracks, and never goes below zero", () => {
    const clips = [
      clip("a", 100, 500),
      clip("b", 100, 500, { trackId: "a1" }),
      clip("c", 100, 500, { trackId: "v2" })
    ];
    const out = shiftClipsFrom(clips, 0, -400, new Set(["b"]), {
      lockedTrackIds: new Set(["v2"])
    });
    expect(byId(out, "a").startMs).toBe(0);
    expect(byId(out, "b").startMs).toBe(100);
    expect(byId(out, "c").startMs).toBe(100);
  });
});

describe("rippleTrim", () => {
  const clips = () => [
    clip("a", 0, 1000, { inPointMs: 200, outPointMs: 1200 }),
    clip("b", 1000, 1000),
    clip("c", 2000, 1000, { trackId: "a1" })
  ];

  it("shortening the end pulls every later clip on every track left", () => {
    const out = rippleTrim(clips(), "a", "end", -400);
    expect(byId(out, "a").durationMs).toBe(600);
    expect(byId(out, "b").startMs).toBe(600);
    expect(byId(out, "c").startMs).toBe(1600);
  });

  it("extending the end pushes later clips right", () => {
    const out = rippleTrim(clips(), "a", "end", 300);
    expect(byId(out, "b").startMs).toBe(1300);
    expect(byId(out, "c").startMs).toBe(2300);
  });

  it("trimming the head moves the in-point but keeps the clip parked", () => {
    const out = rippleTrim(clips(), "a", "start", -250);
    const a = byId(out, "a");
    expect(a.startMs).toBe(0);
    expect(a.inPointMs).toBe(450);
    expect(a.durationMs).toBe(750);
    expect(byId(out, "b").startMs).toBe(750);
  });

  it("moves linked siblings with the clip and does not ripple them twice", () => {
    const linked = [
      clip("v", 0, 1000, { linkId: "L" }),
      clip("a", 0, 1000, { trackId: "a1", linkId: "L" }),
      clip("next", 1000, 500)
    ];
    const out = rippleTrim(linked, "v", "end", -200);
    expect(byId(out, "v").durationMs).toBe(800);
    expect(byId(out, "a").durationMs).toBe(800);
    expect(byId(out, "a").startMs).toBe(0);
    expect(byId(out, "next").startMs).toBe(800);
  });

  it("rejects a trim that empties the clip and leaves the input alone", () => {
    const input = clips();
    expect(() => rippleTrim(input, "a", "end", -1000)).toThrow();
    expect(byId(input, "b").startMs).toBe(1000);
  });
});

describe("rollEdit", () => {
  const pair = () => [
    clip("a", 0, 1000, { inPointMs: 0, outPointMs: 1000 }),
    clip("b", 1000, 1000, { inPointMs: 500, outPointMs: 1500 }),
    clip("c", 2000, 500)
  ];

  it("finds the neighbour across a cut", () => {
    const clips = pair();
    expect(findRollNeighbour(clips, clips[0], "end")?.id).toBe("b");
    expect(findRollNeighbour(clips, clips[1], "start")?.id).toBe("a");
    expect(findRollNeighbour(clips, clips[1], "end")?.id).toBe("c");
    expect(findRollNeighbour(clips, clips[0], "start")).toBeUndefined();
  });

  it("moves the cut later: left grows, right loses its head, nothing else moves", () => {
    const out = rollEdit(pair(), "a", "end", 300);
    expect(byId(out, "a").durationMs).toBe(1300);
    expect(byId(out, "b").startMs).toBe(1300);
    expect(byId(out, "b").durationMs).toBe(700);
    expect(byId(out, "b").inPointMs).toBe(800);
    expect(byId(out, "c").startMs).toBe(2000);
  });

  it("rolling from the right clip's start edge is the same edit", () => {
    const out = rollEdit(pair(), "b", "start", -200);
    expect(byId(out, "a").durationMs).toBe(800);
    expect(byId(out, "b").startMs).toBe(800);
    expect(byId(out, "b").durationMs).toBe(1200);
  });

  it("refuses when the right clip has no more head to reveal", () => {
    expect(() => rollEdit(pair(), "a", "end", -600)).toThrow();
  });

  it("refuses without a neighbour", () => {
    expect(() => rollEdit(pair(), "c", "end", 100)).toThrow();
  });
});

describe("rippleDelete", () => {
  it("removes the clip and closes its span on every unlocked track", () => {
    const clips = [
      clip("a", 0, 1000),
      clip("b", 1000, 1000),
      clip("c", 2000, 1000),
      clip("vo", 2500, 500, { trackId: "a1" })
    ];
    const out = rippleDelete(clips, new Set(["b"]));
    expect(out.map((c) => c.id)).toEqual(["a", "c", "vo"]);
    expect(byId(out, "c").startMs).toBe(1000);
    expect(byId(out, "vo").startMs).toBe(1500);
  });

  it("merges overlapping spans and closes several at once", () => {
    const clips = [
      clip("a", 0, 1000),
      clip("b", 1000, 1000),
      clip("b2", 1500, 1000, { trackId: "v2" }),
      clip("c", 3000, 1000),
      clip("d", 4000, 1000),
      clip("e", 5000, 1000)
    ];
    const out = rippleDelete(clips, new Set(["b", "b2", "d"]));
    expect(byId(out, "c").startMs).toBe(1500);
    expect(byId(out, "e").startMs).toBe(2500);
  });

  it("leaves a straddling clip on another track where it is", () => {
    const clips = [
      clip("a", 0, 1000),
      clip("b", 1000, 1000),
      clip("music", 500, 3000, { trackId: "a1" }),
      clip("c", 2000, 1000)
    ];
    const out = rippleDelete(clips, new Set(["b"]));
    expect(byId(out, "music").startMs).toBe(500);
    expect(byId(out, "c").startMs).toBe(1000);
  });
});

describe("closeGap", () => {
  const clips = () => [
    clip("a", 0, 1000),
    clip("b", 1500, 1000),
    clip("vo", 1600, 200, { trackId: "a1" })
  ];

  it("finds the gap around a time and null inside a clip", () => {
    expect(findGap(clips(), "v1", 1200)).toEqual({ startMs: 1000, endMs: 1500 });
    expect(findGap(clips(), "v1", 500)).toBeNull();
    expect(findGap(clips(), "v1", 4000)).toBeNull();
    expect(findGap(clips(), "a1", 100)).toEqual({ startMs: 0, endMs: 1600 });
  });

  it("pulls everything after the gap left by its length", () => {
    const out = closeGap(clips(), "v1", 1200);
    expect(byId(out, "b").startMs).toBe(1000);
    expect(byId(out, "vo").startMs).toBe(1100);
  });

  it("is a no-op at a time with no gap", () => {
    const input = clips();
    expect(closeGap(input, "v1", 500)).toEqual(input);
  });
});
