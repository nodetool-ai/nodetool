/**
 * What editing a group does to the clips under it (D4). Each case pins one
 * rule the web store routes through: a move carries the children, a delete
 * releases them, a trim pulls them in, and a split is refused.
 */
import { describe, expect, it } from "vitest";
import {
  groupDescendantIds,
  isGroupClip,
  moveGroup,
  splitClip,
  trimGroup
} from "../src/index.js";
import { ungroup } from "../src/group.js";
import { makeClip } from "../src/defaults.js";
import type { TimelineClip } from "../src/types.js";

const group = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({ mediaType: "group", durationMs: 1000, trackId: "v1", ...over });

const child = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "video",
    durationMs: 1000,
    trackId: "v1",
    status: "generated",
    ...over
  });

const byId = (clips: TimelineClip[], id: string): TimelineClip => {
  const found = clips.find((clip) => clip.id === id);
  if (!found) throw new Error(`no clip ${id}`);
  return found;
};

describe("isGroupClip / groupDescendantIds", () => {
  it("collects children and grandchildren, and nothing else", () => {
    const clips = [
      group({ id: "g" }),
      group({ id: "inner", parentId: "g" }),
      child({ id: "c1", parentId: "g" }),
      child({ id: "c2", parentId: "inner" }),
      child({ id: "loose" })
    ];
    expect(isGroupClip(byId(clips, "g"))).toBe(true);
    expect(isGroupClip(byId(clips, "c1"))).toBe(false);
    expect([...groupDescendantIds(clips, "g")].sort()).toEqual([
      "c1",
      "c2",
      "inner"
    ]);
  });

  it("terminates on a parentId cycle", () => {
    const clips = [
      group({ id: "a", parentId: "b" }),
      group({ id: "b", parentId: "a" })
    ];
    expect([...groupDescendantIds(clips, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("moveGroup", () => {
  it("shifts the group and every descendant by the same delta", () => {
    const clips = moveGroup(
      [
        group({ id: "g", startMs: 1000 }),
        child({ id: "c1", parentId: "g", startMs: 1000, trackId: "v1" }),
        child({ id: "c2", parentId: "g", startMs: 1500, trackId: "v2" }),
        child({ id: "loose", startMs: 1000 })
      ],
      "g",
      500
    );
    expect(byId(clips, "g").startMs).toBe(1500);
    expect(byId(clips, "c1").startMs).toBe(1500);
    expect(byId(clips, "c2").startMs).toBe(2000);
    expect(byId(clips, "loose").startMs).toBe(1000);
  });

  it("keeps each child on its own track", () => {
    const clips = moveGroup(
      [group({ id: "g" }), child({ id: "c", parentId: "g", trackId: "audio" })],
      "g",
      100
    );
    expect(byId(clips, "c").trackId).toBe("audio");
  });

  it("clamps at the timeline origin", () => {
    const clips = moveGroup(
      [group({ id: "g", startMs: 100 }), child({ id: "c", parentId: "g", startMs: 100 })],
      "g",
      -500
    );
    expect(byId(clips, "g").startMs).toBe(0);
    expect(byId(clips, "c").startMs).toBe(0);
  });
});

describe("ungroup", () => {
  it("releases direct children without deleting them", () => {
    const clips = ungroup(
      [
        group({ id: "g" }),
        group({ id: "inner", parentId: "g" }),
        child({ id: "c", parentId: "inner" })
      ],
      "g"
    );
    expect(clips).toHaveLength(3);
    expect(byId(clips, "inner").parentId).toBeUndefined();
    // A grandchild keeps the parent it names, which is still in the document.
    expect(byId(clips, "c").parentId).toBe("inner");
  });
});

describe("trimGroup", () => {
  it("pulls a child's tail inside a shortened window", () => {
    const clips = trimGroup(
      [
        group({ id: "g", startMs: 0, durationMs: 2000 }),
        child({ id: "c", parentId: "g", startMs: 0, durationMs: 2000 })
      ],
      "g",
      "end",
      -500
    );
    expect(byId(clips, "g").durationMs).toBe(1500);
    expect(byId(clips, "c").durationMs).toBe(1500);
    expect(byId(clips, "c").outPointMs).toBe(1500);
  });

  it("pulls a child's head inside and reveals later source", () => {
    const clips = trimGroup(
      [
        group({ id: "g", startMs: 0, durationMs: 2000 }),
        child({ id: "c", parentId: "g", startMs: 0, durationMs: 2000 })
      ],
      "g",
      "start",
      -500
    );
    expect(byId(clips, "g").startMs).toBe(500);
    expect(byId(clips, "c").startMs).toBe(500);
    expect(byId(clips, "c").durationMs).toBe(1500);
    expect(byId(clips, "c").inPointMs).toBe(500);
  });

  it("leaves a child the new window cannot hold at all", () => {
    const clips = trimGroup(
      [
        group({ id: "g", startMs: 0, durationMs: 2000 }),
        child({ id: "c", parentId: "g", startMs: 1500, durationMs: 500 })
      ],
      "g",
      "end",
      -1500
    );
    expect(byId(clips, "g").durationMs).toBe(500);
    expect(byId(clips, "c")).toEqual(
      expect.objectContaining({ startMs: 1500, durationMs: 500 })
    );
  });

  it("clamps a grandchild too", () => {
    const clips = trimGroup(
      [
        group({ id: "g", startMs: 0, durationMs: 2000 }),
        group({ id: "inner", parentId: "g", startMs: 0, durationMs: 2000 }),
        child({ id: "c", parentId: "inner", startMs: 0, durationMs: 2000 })
      ],
      "g",
      "end",
      -1000
    );
    expect(byId(clips, "inner").durationMs).toBe(1000);
    expect(byId(clips, "c").durationMs).toBe(1000);
  });

  it("changes nothing when the group's own trim is invalid", () => {
    const clips = [
      group({ id: "g", startMs: 0, durationMs: 1000 }),
      child({ id: "c", parentId: "g", startMs: 0, durationMs: 1000 })
    ];
    expect(() => trimGroup(clips, "g", "end", -1000)).toThrow(
      /non-positive duration/
    );
  });
});

describe("splitClip on a group", () => {
  it("refuses, and says to split the children", () => {
    expect(() =>
      splitClip(group({ id: "g", startMs: 0, durationMs: 1000 }), 500)
    ).toThrow(/split the clips inside it/);
  });
});
