import { describe, expect, it } from "vitest";
import {
  applyTransitionAtCut,
  maxTransitionMs,
  removeTransitionAtCut,
  transitionPredecessor
} from "../src/transitionAtCut.js";
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
const byId = (clips: TimelineClip[], id: string) => clips.find((c) => c.id === id)!;

describe("transitionPredecessor", () => {
  it("finds the abutting or overlapping clip before, not one on another track", () => {
    const clips = [clip("a", 0, 1000), clip("b", 1000, 1000), clip("x", 0, 1500, { trackId: "v2" })];
    expect(transitionPredecessor(clips, clips[1])?.id).toBe("a");
    expect(transitionPredecessor(clips, clips[0])).toBeUndefined();
  });
});

describe("applyTransitionAtCut", () => {
  it("extends the predecessor under the incoming clip and sets a cross-fade", () => {
    const out = applyTransitionAtCut([clip("a", 0, 1000), clip("b", 1000, 1000)], "b", 400);
    expect(byId(out, "a").durationMs).toBe(1400);
    expect(byId(out, "a").outPointMs).toBe(1400);
    expect(byId(out, "b").transitionIn).toEqual({ type: "crossfade", durationMs: 400 });
    expect(byId(out, "b").startMs).toBe(1000);
  });

  it("grows an existing overlap only by what is missing, and keeps the type", () => {
    const out = applyTransitionAtCut(
      [
        clip("a", 0, 1200),
        clip("b", 1000, 1000, { transitionIn: { type: "wipe", durationMs: 200, direction: "left" } as never })
      ],
      "b",
      500
    );
    expect(byId(out, "a").durationMs).toBe(1500);
    expect(byId(out, "b").transitionIn?.type).toBe("wipe");
    expect(byId(out, "b").transitionIn?.durationMs).toBe(500);
  });

  it("caps at the shorter of the two clips", () => {
    const clips = [clip("a", 0, 300), clip("b", 300, 1000)];
    expect(maxTransitionMs(clips, clips[1])).toBe(300);
    const out = applyTransitionAtCut(clips, "b", 900);
    expect(byId(out, "b").transitionIn?.durationMs).toBe(300);
  });

  it("with no predecessor the clip fades in on its own", () => {
    const out = applyTransitionAtCut([clip("a", 0, 1000)], "a", 250);
    expect(byId(out, "a").transitionIn?.durationMs).toBe(250);
  });
});

describe("removeTransitionAtCut", () => {
  it("drops the field and leaves other clips untouched", () => {
    const clips = [clip("a", 0, 1000), clip("b", 1000, 1000, { transitionIn: { type: "crossfade", durationMs: 100 } })];
    const out = removeTransitionAtCut(clips, "b");
    expect("transitionIn" in byId(out, "b")).toBe(false);
    expect(byId(out, "a")).toBe(clips[0]);
  });
});
