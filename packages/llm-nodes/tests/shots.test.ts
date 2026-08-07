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

/**
 * The capability ShotChain asks for has to match the plan it just made.
 *
 * `planShotChain` marks the first shot `seedFrom: "none"` when the screenplay
 * carries no keyframe — a Director-authored screenplay never does, because it
 * is written from a brief before any image exists. The generate call ignored
 * that and always asked for `image_to_video`, handing the provider an empty
 * image list.
 *
 * That is not a soft no-op. The kie provider throws "The input image is empty."
 * (`kie-provider.ts`), so `Director -> ShotBatch -> ShotChain` could not run on
 * kie at all. Gemini/Veo accepted it and produced an unseeded clip, which is
 * how the mismatch survived: on the default model it looked like it worked.
 *
 * These assert the capability per shot, not that a clip came back — a test
 * that only checked for output would pass against the bug on any provider
 * tolerant of the empty list.
 */
describe("ShotChain capability routing", () => {
  function chainWith(specs: ShotSpec[]) {
    const calls: { capability: string; modelId: string; imageCount: number }[] = [];
    const node = new ShotChainNode();
    Object.assign(node, {
      model: { type: "video_model", provider: "kie", id: "kling-2.6/image-to-video" },
      shots: specs,
      aspect_ratio: "16:9",
      resolution: "720p"
    });
    const context = {
      runProviderPrediction: async (req: {
        capability: string;
        model: string;
        params: { images?: Uint8Array[] };
      }) => {
        calls.push({
          capability: req.capability,
          modelId: req.model,
          imageCount: req.params.images?.length ?? 0
        });
        // A 1x1 mp4 stand-in; ShotChain only needs bytes back.
        return new Uint8Array([0, 0, 0, 1]);
      }
    };
    return { node, context, calls };
  }

  const spec = (index: number): ShotSpec =>
    ({
      index,
      prompt: `shot ${index}`,
      duration_seconds: 3,
      aspect_ratio: "16:9",
      keyframe: null
    }) as ShotSpec;

  it("asks for text_to_video on an unseeded first shot", async () => {
    const { node, context, calls } = chainWith([spec(0)]);
    // extractLastFrame shells out to ffmpeg; one shot never reaches it.
    await (node as unknown as { process: (c: unknown) => Promise<unknown> }).process(
      context
    );
    expect(calls).toHaveLength(1);
    // Was "image_to_video" with images: [] — the call kie rejects outright.
    expect(calls[0].capability).toBe("text_to_video");
    expect(calls[0].imageCount).toBe(0);
  });
  it("uses the continuation model for a seeded shot, and Model when it is unset", async () => {
    // Seeded via an explicit keyframe rather than a previous clip:
    // extractLastFrame shells out to ffmpeg and returns null on failure, so a
    // fake clip can never seed shot 2. A keyframe reaches the same branch.
    const seededSpec = {
      index: 0,
      prompt: "shot 0",
      duration_seconds: 3,
      aspect_ratio: "16:9",
      // 1x1 transparent PNG — real bytes, so loadMediaRefBytes returns them.
      keyframe: {
        type: "image",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
      }
    } as unknown as ShotSpec;

    const withCont = chainWith([seededSpec]);
    Object.assign(withCont.node, {
      continuation_model: {
        type: "video_model",
        provider: "kie",
        id: "kling-2.6/image-to-video"
      },
      model: {
        type: "video_model",
        provider: "kie",
        id: "kling-2.6/text-to-video"
      }
    });
    await (
      withCont.node as unknown as { process: (c: unknown) => Promise<unknown> }
    ).process(withCont.context);
    expect(withCont.calls[0].capability).toBe("image_to_video");
    expect(withCont.calls[0].modelId).toBe("kling-2.6/image-to-video");

    // Unset continuation model: the seeded shot falls back to Model, which is
    // what every graph authored before this prop existed relies on.
    const noCont = chainWith([seededSpec]);
    Object.assign(noCont.node, {
      model: {
        type: "video_model",
        provider: "kie",
        id: "kling-2.6/image-to-video"
      }
    });
    await (
      noCont.node as unknown as { process: (c: unknown) => Promise<unknown> }
    ).process(noCont.context);
    expect(noCont.calls[0].modelId).toBe("kling-2.6/image-to-video");
  });
});
