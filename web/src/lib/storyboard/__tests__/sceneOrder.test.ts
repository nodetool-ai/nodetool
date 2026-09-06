/**
 * @jest-environment node
 *
 * The derived scene view: grouping, display numbers, and the contiguity
 * predicate the store's `reorderShots` rejects an order with.
 */

import type { Scene, Shot } from "@nodetool-ai/protocol";
import { displayNumber, sceneOrder, scenesAreContiguous } from "../sceneOrder";

const shot = (id: string, index: number, sceneId?: string): Shot => {
  const shot: Shot = {
    type: "shot",
    id,
    index,
    action: `shot ${id}`,
    status: "planned"
  };
  if (sceneId) {
    shot.scene_id = sceneId;
  }
  return shot;
};

const scene = (id: string, slugline: string): Scene => ({
  type: "scene",
  id,
  slugline
});

const SCENES = [scene("sc-a", "INT. FLAT"), scene("sc-b", "EXT. STREET")];

describe("sceneOrder", () => {
  it("orders scenes by the index of their first shot", () => {
    const shots = [
      shot("b1", 0, "sc-b"),
      shot("b2", 1, "sc-b"),
      shot("a1", 2, "sc-a")
    ];

    const groups = sceneOrder(shots, SCENES);

    expect(groups.map((g) => g.sceneId)).toEqual(["sc-b", "sc-a"]);
    expect(groups[0].scene?.slugline).toBe("EXT. STREET");
    expect(groups.map((g) => g.shots.map((s) => s.id))).toEqual([
      ["b1", "b2"],
      ["a1"]
    ]);
  });

  it("reads shots in index order, not array order", () => {
    const groups = sceneOrder([shot("a2", 1, "sc-a"), shot("a1", 0, "sc-a")]);
    expect(groups[0].shots.map((s) => s.id)).toEqual(["a1", "a2"]);
  });

  it("puts unscened shots under one implicit header", () => {
    const groups = sceneOrder([shot("s0", 0), shot("s1", 1), shot("s2", 2)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sceneId).toBeNull();
    expect(groups[0].scene).toBeNull();
    expect(groups[0].shots.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("mixes the implicit header with real scenes", () => {
    const groups = sceneOrder(
      [shot("a1", 0, "sc-a"), shot("x", 1), shot("b1", 2, "sc-b")],
      SCENES
    );
    expect(groups.map((g) => g.sceneId)).toEqual(["sc-a", null, "sc-b"]);
  });

  it("collects an interleaved scene under its first appearance", () => {
    const groups = sceneOrder(
      [shot("a1", 0, "sc-a"), shot("b1", 1, "sc-b"), shot("a2", 2, "sc-a")],
      SCENES
    );

    expect(groups.map((g) => g.sceneId)).toEqual(["sc-a", "sc-b"]);
    expect(groups[0].shots.map((s) => s.id)).toEqual(["a1", "a2"]);
  });

  it("drops a scene no shot is in and keeps a scene with no record", () => {
    const groups = sceneOrder([shot("g1", 0, "sc-gone")], SCENES);

    expect(groups.map((g) => g.sceneId)).toEqual(["sc-gone"]);
    expect(groups[0].scene).toBeNull();
  });

  it("returns nothing for an empty board", () => {
    expect(sceneOrder([], SCENES)).toEqual([]);
  });
});

describe("displayNumber", () => {
  const shots = [
    shot("a1", 0, "sc-a"),
    shot("a2", 1, "sc-a"),
    shot("b1", 2, "sc-b")
  ];

  it("numbers scenes and shots from one", () => {
    expect(displayNumber(shots[0], shots)).toEqual({ scene: 1, shot: 1 });
    expect(displayNumber(shots[1], shots)).toEqual({ scene: 1, shot: 2 });
    expect(displayNumber(shots[2], shots)).toEqual({ scene: 2, shot: 1 });
  });

  it("numbers legacy shots under the implicit first scene", () => {
    const legacy = [shot("s0", 0), shot("s1", 1)];
    expect(displayNumber(legacy[1], legacy)).toEqual({ scene: 1, shot: 2 });
  });

  it("reads zero for a shot the board does not hold", () => {
    expect(displayNumber(shot("ghost", 9, "sc-a"), shots)).toEqual({
      scene: 0,
      shot: 0
    });
  });
});

describe("scenesAreContiguous", () => {
  it("accepts unbroken runs, including the implicit group", () => {
    expect(
      scenesAreContiguous([
        shot("a1", 0, "sc-a"),
        shot("a2", 1, "sc-a"),
        shot("b1", 2, "sc-b")
      ])
    ).toBe(true);
    expect(scenesAreContiguous([shot("s0", 0), shot("s1", 1)])).toBe(true);
    expect(scenesAreContiguous([])).toBe(true);
  });

  it("rejects a scene split by another", () => {
    expect(
      scenesAreContiguous([
        shot("a1", 0, "sc-a"),
        shot("b1", 1, "sc-b"),
        shot("a2", 2, "sc-a")
      ])
    ).toBe(false);
  });

  it("rejects an unscened shot dropped inside a scene", () => {
    expect(
      scenesAreContiguous([shot("x", 0), shot("a1", 1, "sc-a"), shot("y", 2)])
    ).toBe(false);
  });

  it("judges the array's own order, not the stamped index", () => {
    expect(
      scenesAreContiguous([
        shot("a1", 0, "sc-a"),
        shot("b1", 5, "sc-b"),
        shot("a2", 1, "sc-a")
      ])
    ).toBe(false);
  });
});
