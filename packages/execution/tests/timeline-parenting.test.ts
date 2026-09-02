/**
 * The three ways a `parentId` can name something the renderer cannot compose
 * with (D4), each with the fixture that triggers it (I12) and a control the
 * check must stay quiet on.
 *
 * None of them fails at render time: the scene model draws such a child
 * unparented, so the picture loses the group's transform, opacity and window
 * while everything reports success. A missing parent and a parent that is not a
 * group are warnings — a newer build could have meant either (I2) and the clip
 * still draws — while a cycle is an error, because there is no reading of the
 * document that produces the scene its author described.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const group = (over: Json): Json => clip({ mediaType: "group", ...over });

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Video 1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const codesOf = (issues: ReadonlyArray<{ code: string }>): string[] =>
  issues.map((issue) => issue.code);

describe("validateTimelineSequence — parenting", () => {
  it("accepts a clip parented to a group", () => {
    const result = validateTimelineSequence(
      doc([group({ id: "g" }), clip({ id: "c", parentId: "g" })])
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts a group parented to another group", () => {
    const result = validateTimelineSequence(
      doc([
        group({ id: "outer" }),
        group({ id: "inner", parentId: "outer" }),
        clip({ id: "c", parentId: "inner" })
      ])
    );
    expect(result.errors).toEqual([]);
  });

  it("reports parent_missing for a parentId no clip carries", () => {
    const result = validateTimelineSequence(
      doc([clip({ id: "c", name: "Title", parentId: "gone" })])
    );
    expect(codesOf(result.warnings)).toEqual(["parent_missing"]);
    expect(result.warnings[0]?.message).toContain("gone");
    expect(result.warnings[0]?.clipId).toBe("c");
    expect(result.warnings[0]?.path).toBe("parentId");
    expect(result.errors).toEqual([]);
  });

  it("reports parent_not_group when the parent carries media", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "shot", name: "Shot 1" }),
        clip({ id: "c", name: "Title", parentId: "shot" })
      ])
    );
    // The two clips share a track and therefore also overlap; this asserts the
    // parenting finding, not the whole report.
    const parenting = result.warnings.filter((w) =>
      w.code.startsWith("parent_")
    );
    expect(codesOf(parenting)).toEqual(["parent_not_group"]);
    expect(parenting[0]?.message).toContain("mediaType is \"video\"");
    expect(result.errors).toEqual([]);
  });

  it("reports parent_cycle for a chain that loops", () => {
    const result = validateTimelineSequence(
      doc([
        group({ id: "a", parentId: "b" }),
        group({ id: "b", parentId: "a" })
      ])
    );
    expect(new Set(codesOf(result.errors))).toEqual(new Set(["parent_cycle"]));
    expect(result.errors).toHaveLength(2);
  });

  it("reports parent_cycle for a clip hanging off a cycle", () => {
    const result = validateTimelineSequence(
      doc([
        group({ id: "a", parentId: "b" }),
        group({ id: "b", parentId: "a" }),
        clip({ id: "c", name: "Title", parentId: "a" })
      ])
    );
    const cycles = result.errors.filter((e) => e.code === "parent_cycle");
    expect(cycles.map((e) => e.clipId).sort()).toEqual(["a", "b", "c"]);
  });

  it("says nothing about a clip that names no parent", () => {
    const result = validateTimelineSequence(doc([clip({ id: "c" })]));
    expect(result.errors).toEqual([]);
  });
});
