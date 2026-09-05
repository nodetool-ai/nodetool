import { describe, expect, it } from "vitest";
import { resolveInsert, resolveOverwrite, resolveDrop } from "../src/dropResolve.js";
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
const byId = (clips: TimelineClip[], id: string) => clips.find((c) => c.id === id);

describe("resolveOverwrite", () => {
  it("removes a clip the mover fully covers", () => {
    const out = resolveOverwrite(
      [clip("a", 1000, 500), clip("m", 800, 1000)],
      new Set(["m"])
    );
    expect(out.map((c) => c.id)).toEqual(["m"]);
  });

  it("trims a clip the mover's head lands on, and one its tail lands on", () => {
    const out = resolveOverwrite(
      [clip("a", 0, 1000), clip("b", 1000, 1000), clip("m", 700, 600)],
      new Set(["m"])
    );
    expect(byId(out, "a")!.durationMs).toBe(700);
    expect(byId(out, "b")!.startMs).toBe(1300);
    expect(byId(out, "b")!.inPointMs).toBe(300);
    expect(byId(out, "b")!.durationMs).toBe(700);
  });

  it("cuts a clip that spans the mover into a head and a tail", () => {
    const out = resolveOverwrite(
      [clip("big", 0, 3000), clip("m", 1000, 500)],
      new Set(["m"])
    );
    const others = out.filter((c) => c.id !== "m");
    expect(others).toHaveLength(2);
    expect(others[0].startMs).toBe(0);
    expect(others[0].durationMs).toBe(1000);
    expect(others[1].startMs).toBe(1500);
    expect(others[1].durationMs).toBe(1500);
    expect(others[1].inPointMs).toBe(1500);
  });

  it("ignores other tracks and the mover's linked sibling", () => {
    const out = resolveOverwrite(
      [
        clip("m", 0, 1000, { linkId: "L" }),
        clip("ma", 0, 1000, { trackId: "a1", linkId: "L" }),
        clip("vo", 200, 300, { trackId: "a2" })
      ],
      new Set(["m"])
    );
    expect(out).toHaveLength(3);
  });
});

describe("resolveInsert", () => {
  it("pushes later clips right by the mover's length and cuts a straddler", () => {
    const out = resolveInsert(
      [
        clip("a", 0, 2000),
        clip("b", 2000, 1000),
        clip("vo", 1500, 200, { trackId: "a1" }),
        clip("m", 1000, 500)
      ],
      new Set(["m"])
    );
    const aParts = out.filter((c) => c.id !== "m" && c.trackId === "v1" && c.startMs < 2500);
    expect(aParts.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 1000],
      [1500, 1000]
    ]);
    expect(byId(out, "b")!.startMs).toBe(2500);
    expect(byId(out, "vo")!.startMs).toBe(2000);
    expect(byId(out, "m")!.startMs).toBe(1000);
  });

  it("leaves a locked track alone", () => {
    const out = resolveInsert(
      [clip("vo", 1500, 200, { trackId: "a1" }), clip("m", 1000, 500)],
      new Set(["m"]),
      { lockedTrackIds: new Set(["a1"]) }
    );
    expect(byId(out, "vo")!.startMs).toBe(1500);
  });
});

describe("resolveDrop", () => {
  it("overlap keeps everything", () => {
    const input = [clip("a", 0, 1000), clip("m", 500, 1000)];
    expect(resolveDrop(input, new Set(["m"]), "overlap")).toEqual(input);
  });
});
