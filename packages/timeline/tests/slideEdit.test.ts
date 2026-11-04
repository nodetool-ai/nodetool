import { describe, expect, it } from "vitest";
import { slideClips, slideDeltaLimit } from "../src/slideEdit.js";
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
    mediaType: "video",
    sourceType: "imported",
    status: "draft",
    locked: false,
    versions: [],
    inPointMs: 1000,
    ...extra
  };
}

const byId = (clips: readonly TimelineClip[], id: string): TimelineClip => {
  const found = clips.find((c) => c.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("slideClips", () => {
  const row = [clip("a", 0, 1000), clip("b", 1000, 1000), clip("c", 2000, 1000)];

  it("moves the clip with its source and trims both neighbours", () => {
    const out = slideClips(row, new Set(["b"]), 300);
    expect(byId(out, "b")).toMatchObject({ startMs: 1300, durationMs: 1000, inPointMs: 1000 });
    expect(byId(out, "a")).toMatchObject({ startMs: 0, durationMs: 1300 });
    expect(byId(out, "c")).toMatchObject({ startMs: 2300, durationMs: 700, inPointMs: 1300 });
    const end = Math.max(...out.map((c) => c.startMs + c.durationMs));
    expect(end).toBe(3000);
  });

  it("stops before the next clip runs out of length", () => {
    expect(slideDeltaLimit(row, new Set(["b"]), 5000)).toBe(999);
  });

  it("stops where the next clip runs out of head source", () => {
    expect(slideDeltaLimit(row, new Set(["b"]), -5000)).toBe(-999);
    const shallow = [clip("a", 0, 1000), clip("b", 1000, 1000), clip("c", 2000, 1000, { inPointMs: 200 })];
    expect(slideDeltaLimit(shallow, new Set(["b"]), -5000)).toBe(-200);
  });

  it("caps the clip before by its known source length", () => {
    const sources = (c: TimelineClip) => (c.id === "a" ? 2100 : undefined);
    expect(slideDeltaLimit(row, new Set(["b"]), 500, sources)).toBe(100);
  });

  it("slides into a gap on a side with no neighbour", () => {
    const gapped = [clip("a", 0, 500), clip("b", 1000, 1000)];
    expect(slideDeltaLimit(gapped, new Set(["b"]), -800)).toBe(-500);
    const out = slideClips(gapped, new Set(["b"]), 300);
    expect(byId(out, "b").startMs).toBe(1300);
    expect(byId(out, "a").durationMs).toBe(500);
  });

  it("slides linked members by the tighter of their limits", () => {
    const linked = [
      ...row.map((c) => ({ ...c, linkId: c.id === "b" ? "L" : undefined })),
      clip("a2", 0, 1000, { trackId: "a1" }),
      clip("b2", 1000, 1000, { trackId: "a1", linkId: "L" }),
      clip("c2", 2000, 400, { trackId: "a1" })
    ];
    const out = slideClips(linked, new Set(["b", "b2"]), 800);
    expect(byId(out, "b").startMs).toBe(1399);
    expect(byId(out, "b2").startMs).toBe(1399);
    expect(byId(out, "c2").durationMs).toBe(1);
  });

  it.each([100, -100])("slides adjacent linked members by %s without trimming them", (delta) => {
    const clips = [
      clip("prev", 0, 1000, { inPointMs: 500 }),
      clip("a", 1000, 1000, { inPointMs: 500, linkId: "L" }),
      clip("b", 2000, 1000, { inPointMs: 500, linkId: "L" }),
      clip("next", 3000, 1000, { inPointMs: 500 }),
      clip("other", 1000, 1000, { trackId: "a1" })
    ];
    const out = slideClips(clips, new Set(["a", "b"]), delta);
    expect(byId(out, "a")).toEqual({ ...clips[1], startMs: 1000 + delta });
    expect(byId(out, "b")).toEqual({ ...clips[2], startMs: 2000 + delta });
    expect(byId(out, "prev")).toMatchObject({ startMs: 0, durationMs: 1000 + delta });
    expect(byId(out, "next")).toMatchObject({ startMs: 3000 + delta, durationMs: 1000 - delta, inPointMs: 500 + delta });
    expect(byId(out, "other")).toBe(clips[4]);
  });

  it.each([100, -100])("combines shared-neighbour boundaries for delta %s regardless of input order", (delta) => {
    const clips = ["prev", "a", "middle", "b", "next"].map((id, i) =>
      clip(id, i * 1000, 1000, {
        mediaType: "audio", inPointMs: 500, outPointMs: 1500,
        ...(id === "a" || id === "b" ? { linkId: "L" } : {})
      })
    );
    const middle = byId(clips, "middle");
    middle.caption = { words: [{ word: "hello", startMs: 300, endMs: 600 }] };
    middle.animations = [{
      id: "source", role: "emphasis", preset: "custom", durationMs: 1000, delayMs: 0,
      custom: { timeBase: "source", curves: [{
        property: "offsetX", keyframes: [
          { t: 0, sourceMs: 0, value: 0 },
          { t: 0.5, sourceMs: 1000, value: 100 },
          { t: 1, sourceMs: 2000, value: 0 }
        ]
      }] }
    }];
    const expected = slideClips(clips, new Set(["a", "b"]), delta);
    for (const ordered of [clips, [...clips].reverse(), [clips[3], clips[1], clips[4], clips[2], clips[0]]]) {
      const out = slideClips(ordered, new Set(["a", "b"]), delta);
      for (const c of expected) expect(byId(out, c.id)).toEqual(c);
      expect(byId(out, "middle")).toMatchObject({
        startMs: 2000 + delta, durationMs: 1000,
        inPointMs: 500 + delta, outPointMs: 1500 + delta,
        caption: { words: [{ word: "hello", startMs: 300 - delta, endMs: 600 - delta }] }
      });
      expect(byId(out, "a").startMs + 1000).toBe(byId(out, "middle").startMs);
      expect(byId(out, "middle").startMs + 1000).toBe(byId(out, "b").startMs);
      const keys = byId(out, "middle").animations![0].custom!.curves[0].keyframes;
      expect(keys.map((k) => k.sourceMs)).toEqual([500 + delta, 1000, 1500 + delta]);
      expect(keys.map((k) => k.value)).toEqual([50 + delta / 10, 100, 50 - delta / 10]);
    }
    expect(middle).toMatchObject({ startMs: 2000, durationMs: 1000, inPointMs: 500, outPointMs: 1500 });
  });

  it.each([1, 2])("limits a shared neighbour by source handles at rate %s, not its unchanged duration", (rate) => {
    const clips = [
      clip("prev", 0, 5000, { inPointMs: 5000 }),
      clip("a", 5000, 1000),
      clip("middle", 6000, 100, { inPointMs: 500 * rate, outPointMs: 600 * rate, speedMultiplier: rate }),
      clip("b", 6100, 1000),
      clip("next", 7100, 5000, { inPointMs: 5000 })
    ];
    const ids = new Set(["a", "b"]);
    const source = (c: TimelineClip) => c.id === "middle" ? 850 * rate : undefined;
    expect(slideDeltaLimit(clips, ids, 1000, source)).toBe(250);
    expect(slideDeltaLimit(clips, ids, -1000, source)).toBe(-500);
    for (const delta of [250, -500]) {
      expect(byId(slideClips(clips, ids, delta, source), "middle")).toMatchObject({
        startMs: 6000 + delta, durationMs: 100,
        inPointMs: (500 + delta) * rate, outPointMs: (600 + delta) * rate
      });
    }
  });

  it("leaves a group clip alone", () => {
    const grouped = [clip("g", 0, 1000, { mediaType: "group" })];
    expect(slideClips(grouped, new Set(["g"]), 100)).toBe(grouped);
  });
});
