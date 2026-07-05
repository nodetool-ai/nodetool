import { describe, it, expect, vi } from "vitest";
import { IMAGE_GENERATION_TOOL_NAME } from "@nodetool-ai/runtime";
import { ImageGenerationTool } from "../src/tools/image-generation-tool.js";

describe("ImageGenerationTool", () => {
  const tool = new ImageGenerationTool();

  it("uses the canonical image_generation name and a minimal schema", () => {
    expect(tool.name).toBe(IMAGE_GENERATION_TOOL_NAME);
    expect(tool.inputSchema.required).toEqual(["prompt"]);
    expect(Object.keys(tool.inputSchema.properties as object)).toEqual([
      "prompt"
    ]);
  });

  it("returns an error when prompt is missing", async () => {
    const result = (await tool.process({} as never, {})) as {
      error?: string;
    };
    expect(result.error).toBeDefined();
  });

  it("returns an error when prompt is empty", async () => {
    const result = (await tool.process({} as never, {
      prompt: ""
    })) as { error?: string };
    expect(result.error).toBeDefined();
  });

  it("falls back to a default provider+model and persists an asset", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const runProviderPrediction = vi.fn().mockResolvedValue(pngBytes);
    const createAsset = vi
      .fn()
      .mockResolvedValue({ id: "asset-123" });
    const context = {
      runProviderPrediction,
      createAsset
    } as never;

    const result = (await tool.process(context, {
      prompt: "a red fox in snow"
    })) as { type?: string; asset_id?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.type).toBe("image");
    expect(result.asset_id).toBe("asset-123");
    expect(runProviderPrediction).toHaveBeenCalledTimes(1);
    const call = runProviderPrediction.mock.calls[0][0];
    expect(call.provider).toBe("openai");
    expect(call.model).toBe("gpt-image-1");
    expect(call.capability).toBe("text_to_image");
    expect(call.params.prompt).toBe("a red fox in snow");
  });

  it("userMessage stays within the length budget", () => {
    const msg = tool.userMessage({ prompt: "a".repeat(200) });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});
