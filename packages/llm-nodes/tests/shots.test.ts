import { describe, it, expect } from "vitest";
import type { Screenplay } from "@nodetool-ai/protocol";
import {
  toShotSpecs,
  planShotChain,
  ShotBatchNode,
  ShotChainNode,
  type ShotSpec
} from "../src/nodes/shots.js";

describe("shot node classes", () => {
  it("declare their node types and output handles", () => {
    expect(ShotBatchNode.nodeType).toBe("nodetool.creative.ShotBatch");
    expect(ShotChainNode.nodeType).toBe("nodetool.creative.ShotChain");
    expect(ShotBatchNode.metadataOutputTypes).toHaveProperty("shots");
    expect(ShotChainNode.metadataOutputTypes).toHaveProperty("videos");
  });
});

describe("toShotSpecs", () => {
  it("maps each shot to a generation-ready spec with a composed prompt", () => {
    const screenplay = {
      type: "screenplay",
      id: "sp-1",
      title: "Test",
      style_bible: "muted teal, 35mm film grain",
      shots: [
        {
          type: "shot",
          id: "shot-0",
          index: 0,
          action: "A lighthouse at dusk",
          camera: { framing: "wide" },
          motion: "waves crash",
          status: "planned"
        },
        {
          type: "shot",
          id: "shot-1",
          index: 1,
          action: "The keeper climbs the stairs",
          status: "planned"
        }
      ]
    } as unknown as Screenplay;

    const specs = toShotSpecs(screenplay, { aspectRatio: "16:9", defaultDuration: 4 });
    expect(specs).toHaveLength(2);
    expect(specs[0].index).toBe(0);
    expect(specs[0].prompt).toContain("A lighthouse at dusk");
    expect(specs[0].prompt).toContain("wide");
    expect(specs[0].prompt).toContain("waves crash");
    expect(specs[0].prompt).toContain("muted teal, 35mm film grain");
    expect(specs[0].aspect_ratio).toBe("16:9");
  });

  it("uses the shot's own duration when present, else the default", () => {
    const screenplay = {
      type: "screenplay",
      id: "sp-1",
      title: "T",
      shots: [
        { type: "shot", id: "s0", index: 0, action: "a", duration_seconds: 8, status: "planned" },
        { type: "shot", id: "s1", index: 1, action: "b", status: "planned" }
      ]
    } as unknown as Screenplay;

    const specs = toShotSpecs(screenplay, { defaultDuration: 5 });
    expect(specs[0].duration_seconds).toBe(8);
    expect(specs[1].duration_seconds).toBe(5);
  });

  it("passes a shot keyframe through and defaults missing keyframes to null", () => {
    const keyframe = { type: "image", uri: "asset://kf.png" };
    const screenplay = {
      type: "screenplay",
      id: "sp-1",
      title: "T",
      shots: [
        { type: "shot", id: "s0", index: 0, action: "a", keyframe, status: "planned" },
        { type: "shot", id: "s1", index: 1, action: "b", status: "planned" }
      ]
    } as unknown as Screenplay;

    const specs = toShotSpecs(screenplay);
    expect(specs[0].keyframe).toEqual(keyframe);
    expect(specs[1].keyframe).toBeNull();
  });

  it("coerces a plain dict (untyped) screenplay defensively", () => {
    const dict = {
      title: "Loose",
      aspect_ratio: "9:16",
      shots: [{ action: "a runner crests a hill" }]
    };
    const specs = toShotSpecs(dict);
    expect(specs).toHaveLength(1);
    expect(specs[0].index).toBe(0);
    expect(specs[0].prompt).toContain("a runner crests a hill");
    // aspect ratio falls back to the screenplay's when no opt is given
    expect(specs[0].aspect_ratio).toBe("9:16");
    expect(specs[0].duration_seconds).toBe(4);
  });

  it("returns an empty list for a non-screenplay value", () => {
    expect(toShotSpecs(null)).toEqual([]);
    expect(toShotSpecs({})).toEqual([]);
  });
});

describe("planShotChain", () => {
  const spec = (index: number, keyframe: ShotSpec["keyframe"] = null): ShotSpec => ({
    index,
    prompt: `shot ${index}`,
    aspect_ratio: "16:9",
    duration_seconds: 4,
    keyframe
  });

  it("seeds the first shot from its keyframe and the rest from the previous clip", () => {
    const plan = planShotChain([
      spec(0, { type: "image", uri: "asset://kf.png" }),
      spec(1),
      spec(2)
    ]);
    expect(plan).toEqual([
      { index: 0, seedFrom: "keyframe" },
      { index: 1, seedFrom: "previous" },
      { index: 2, seedFrom: "previous" }
    ]);
  });

  it("seeds the first shot from nothing when it has no keyframe", () => {
    const plan = planShotChain([spec(0), spec(1)]);
    expect(plan[0]).toEqual({ index: 0, seedFrom: "none" });
    expect(plan[1]).toEqual({ index: 1, seedFrom: "previous" });
  });

  it("handles an empty spec list", () => {
    expect(planShotChain([])).toEqual([]);
  });
});
