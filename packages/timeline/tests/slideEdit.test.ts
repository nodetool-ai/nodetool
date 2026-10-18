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

  it("leaves a group clip alone", () => {
    const grouped = [clip("g", 0, 1000, { mediaType: "group" })];
    expect(slideClips(grouped, new Set(["g"]), 100)).toBe(grouped);
  });
});
