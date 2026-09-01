/**
 * The `segment_image` capability: what it sends to the provider, and what it
 * hands back. `runProviderPrediction` is stubbed — no provider or network.
 */

import { describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { MEDIA_CAPABILITIES, segmentImage } from "../src/capabilities/media.js";
import { SUPPORTED_CAPABILITIES } from "../src/capabilities/models.specs.js";

const tool = toolFromCapability(segmentImage.spec, segmentImage.impl, (context) =>
  createCapabilityRun({ context, gate: UNGATED })
);

function contextWithMasks(
  masks: unknown[]
): { context: ProcessingContext; predict: ReturnType<typeof vi.fn> } {
  const predict = vi.fn(async () => masks);
  const context = {
    userId: "user-1",
    runProviderPrediction: predict,
    workspace: {
      localDir: null,
      write: vi.fn(async () => {}),
      read: async () => new Uint8Array([1, 2, 3]),
      key: (p: string) => p
    }
  } as unknown as ProcessingContext;
  return { context, predict };
}

function maskBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
}

describe("segment_image", () => {
  it("is offered by the media module and findable through find_model", () => {
    expect(MEDIA_CAPABILITIES).toContain(segmentImage);
    expect(SUPPORTED_CAPABILITIES).toContain("segment_image");
  });

  it("forwards the prompt, points and box to the provider", async () => {
    const { context, predict } = contextWithMasks([]);

    await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image",
      input_file: "shot.png",
      prompt: "blood",
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4, include: false }
      ],
      box: { x: 5, y: 6, width: 7, height: 8 },
      max_masks: 4,
      min_confidence: 0.3
    });

    const call = predict.mock.calls[0][0] as Record<string, unknown>;
    expect(call["capability"]).toBe("segment_image");
    expect(call["model"]).toBe("fal-ai/sam-3-1/image");
    const params = call["params"] as Record<string, unknown>;
    expect(params["prompt"]).toBe("blood");
    // An omitted `include` means the point is part of the object.
    expect(params["points"]).toEqual([
      { x: 1, y: 2, include: true },
      { x: 3, y: 4, include: false }
    ]);
    expect(params["box"]).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(params["max_masks"]).toBe(4);
    expect(params["min_confidence"]).toBe(0.3);
  });

  it("sends no prompts at all when the caller gave none", async () => {
    const { context, predict } = contextWithMasks([]);

    await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image",
      input_file: "shot.png"
    });

    const params = (predict.mock.calls[0][0] as Record<string, unknown>)[
      "params"
    ] as Record<string, unknown>;
    expect(params["points"]).toBeUndefined();
    expect(params["box"]).toBeUndefined();
  });

  it("drops a malformed point rather than sending it", async () => {
    const { context, predict } = contextWithMasks([]);

    await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image",
      input_file: "shot.png",
      points: [{ x: 1, y: 2 }, { x: "left", y: 2 }, "nope"]
    });

    const params = (predict.mock.calls[0][0] as Record<string, unknown>)[
      "params"
    ] as Record<string, unknown>;
    expect(params["points"]).toEqual([{ x: 1, y: 2, include: true }]);
  });

  it("saves each mask and reports its label, score and box", async () => {
    const { context } = contextWithMasks([
      {
        mask: maskBytes(),
        mimeType: "image/png",
        width: 800,
        height: 600,
        label: "dog",
        confidence: 0.9,
        box: { x: 1, y: 2, width: 3, height: 4 }
      },
      { mask: maskBytes(), mimeType: "image/png" }
    ]);

    const result = (await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image",
      input_file: "shot.png"
    })) as Record<string, unknown>;

    expect(result["type"]).toBe("segmentation");
    expect(result["found"]).toBe(2);
    const masks = result["masks"] as Array<Record<string, unknown>>;
    expect(masks[0]["label"]).toBe("dog");
    expect(masks[0]["confidence"]).toBe(0.9);
    expect(masks[0]["box"]).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(masks[0]["path"]).toMatch(/^segment-mask-1/);
    // An unlabeled mask says so instead of inventing a name or a score.
    expect(masks[1]["label"]).toBeNull();
    expect(masks[1]["confidence"]).toBeNull();
  });

  it("reports finding nothing as an answer, not an error", async () => {
    const { context } = contextWithMasks([]);

    const result = (await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image",
      input_file: "shot.png"
    })) as Record<string, unknown>;

    expect(result["found"]).toBe(0);
    expect(result["masks"]).toEqual([]);
    expect(result["error"]).toBeUndefined();
  });

  it("rejects a missing input_file before calling the provider", async () => {
    const { context, predict } = contextWithMasks([]);

    const result = await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image"
    });

    expect(result).toEqual({ error: "input_file is required" });
    expect(predict).not.toHaveBeenCalled();
  });

  it("names the model when the provider refuses", async () => {
    const context = {
      userId: "user-1",
      runProviderPrediction: vi.fn(async () => {
        throw new Error("Unprocessable Entity");
      }),
      workspace: {
        localDir: null,
        write: vi.fn(async () => {}),
        read: async () => new Uint8Array([1]),
        key: (p: string) => p
      }
    } as unknown as ProcessingContext;

    const result = (await tool.process(context, {
      provider: "fal_ai",
      model: "fal-ai/flux/dev",
      input_file: "shot.png"
    })) as Record<string, unknown>;

    expect(String(result["error"])).toContain("fal_ai:fal-ai/flux/dev");
    expect(String(result["error"])).toContain("segment_image");
  });
});
