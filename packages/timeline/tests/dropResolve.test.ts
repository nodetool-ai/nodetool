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

describe("drop resolution keeps links and groups whole", () => {
  it("insert cuts a straddler's linked partner too and shifts both right halves", () => {
    const out = resolveInsert(
      [
        clip("v", 0, 10000, { linkId: "L" }),
        clip("a", 0, 10000, { trackId: "a1", linkId: "L" }),
        clip("m", 4000, 2000)
      ],
      new Set(["m"])
    );
    const parts = (trackId: string) =>
      out
        .filter((c) => c.trackId === trackId && c.id !== "m")
        .sort((x, y) => x.startMs - y.startMs);
    const [vLeft, vRight] = parts("v1");
    const [aLeft, aRight] = parts("a1");
    expect([vLeft.startMs, vLeft.durationMs]).toEqual([0, 4000]);
    expect([aLeft.startMs, aLeft.durationMs]).toEqual([0, 4000]);
    expect([vRight.startMs, vRight.durationMs]).toEqual([6000, 6000]);
    expect([aRight.startMs, aRight.durationMs]).toEqual([6000, 6000]);
    expect(vLeft.linkId).toBe(aLeft.linkId);
    expect(vRight.linkId).toBe(aRight.linkId);
    expect(vLeft.linkId).not.toBe(vRight.linkId);
    expect(vLeft.linkId).not.toBe("L");
  });

  it("overwrite never removes or trims a group clip it lands on", () => {
    const group = clip("g", 1000, 2000, { mediaType: "group", trackId: "g1" });
    const child = clip("c", 1000, 1000, { parentId: "g", trackId: "v2" });
    const covered = resolveOverwrite(
      [group, child, clip("m", 0, 5000, { trackId: "g1" })],
      new Set(["m"])
    );
    expect(byId(covered, "g")).toEqual(group);
    const partial = resolveOverwrite(
      [group, child, clip("m", 2500, 1500, { trackId: "g1" })],
      new Set(["m"])
    );
    expect(byId(partial, "g")).toEqual(group);
  });

  it("dragging a group keeps its own children in place", () => {
    const clips = () => [
      clip("g", 1000, 2000, { mediaType: "group" }),
      clip("c", 1000, 1000, { parentId: "g" }),
      clip("later", 5000, 1000, { trackId: "v2" })
    ];
    const over = resolveOverwrite(clips(), new Set(["g"]));
    expect(byId(over, "c")).toEqual(clips()[1]);
    const ins = resolveInsert(clips(), new Set(["g"]));
    expect(byId(ins, "c")!.startMs).toBe(1000);
    expect(byId(ins, "later")!.startMs).toBe(7000);
  });

  it("a linked sibling of the mover clears its own track", () => {
    const clips = () => [
      clip("m", 1000, 1000, { linkId: "L" }),
      clip("ma", 1000, 1000, { trackId: "a1", linkId: "L" }),
      clip("x", 800, 2000, { trackId: "a1" })
    ];
    const spans = (out: TimelineClip[]) =>
      out
        .filter((c) => c.trackId === "a1" && c.id !== "ma")
        .map((c) => [c.startMs, c.startMs + c.durationMs])
        .sort((p, q) => p[0] - q[0]);
    expect(spans(resolveOverwrite(clips(), new Set(["m"])))).toEqual([
      [800, 1000],
      [2000, 2800]
    ]);
    const ins = resolveInsert(clips(), new Set(["m"]));
    expect(spans(ins)).toEqual([
      [800, 1000],
      [2000, 3800]
    ]);
    expect(byId(ins, "ma")!.startMs).toBe(1000);
  });
});
