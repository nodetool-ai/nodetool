import { describe, expect, it } from "vitest";
import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  ancestorChain,
  hasPerspectiveAncestor
} from "../src/timeline-debug/frame-geometry.js";

const clip = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    trackId: id,
    name: id,
    startMs: 0,
    durationMs: 1000,
    mediaType: "shape",
    ...overrides
  }) as unknown as TimelineClip;
const group = (id: string, overrides: Record<string, unknown> = {}) =>
  clip(id, { mediaType: "group", ...overrides });
const index = (clips: TimelineClip[]) => new Map(clips.map((c) => [c.id, c]));
const ids = (chain: TimelineClip[]) => chain.map((c) => c.id);

describe("ancestorChain", () => {
  it("returns root-first group ancestors ending at the clip", () => {
    const clips = [
      group("root"),
      group("mid", { parentId: "root" }),
      clip("leaf", { parentId: "mid" })
    ];
    expect(ids(ancestorChain(clips[2]!, index(clips)))).toEqual([
      "root",
      "mid",
      "leaf"
    ]);
  });

  it("stops at a parent that is not a group or is missing", () => {
    const clips = [
      clip("notGroup"),
      clip("a", { parentId: "notGroup" }),
      clip("b", { parentId: "gone" })
    ];
    expect(ids(ancestorChain(clips[1]!, index(clips)))).toEqual(["a"]);
    expect(ids(ancestorChain(clips[2]!, index(clips)))).toEqual(["b"]);
  });

  it("terminates on a parentId cycle and treats the chain as unparented", () => {
    const clips = [
      group("a", { parentId: "b" }),
      group("b", { parentId: "a" }),
      clip("c", { parentId: "a" }),
      group("self", { parentId: "self" })
    ];
    const byId = index(clips);
    expect(ids(ancestorChain(clips[0]!, byId))).toEqual(["a"]);
    expect(ids(ancestorChain(clips[2]!, byId))).toEqual(["c"]);
    expect(ids(ancestorChain(clips[3]!, byId))).toEqual(["self"]);
  });
});

describe("hasPerspectiveAncestor", () => {
  it("detects a tilt on an ancestor and not on a flat chain", () => {
    const tilted = group("g", { transform: { rotationY: 20 } });
    const child = clip("k", { parentId: "g" });
    expect(hasPerspectiveAncestor(child, index([tilted, child]))).toBe(true);
    const flat = group("g", { transform: { rotationX: 0 } });
    expect(hasPerspectiveAncestor(child, index([flat, child]))).toBe(false);
  });

  it("does not hang on a parentId cycle", () => {
    const clips = [
      group("a", { parentId: "b" }),
      group("b", { parentId: "a", transform: { perspective: 800 } })
    ];
    expect(hasPerspectiveAncestor(clips[0]!, index(clips))).toBe(false);
  });
});
