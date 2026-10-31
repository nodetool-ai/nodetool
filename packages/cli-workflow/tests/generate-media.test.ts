import { describe, expect, it } from "vitest";
import {
  formatPricedModel,
  mediaToolCall,
  parseGenerateKind,
  priceAndSortModels
} from "../src/commands/generate-media.js";

describe("nodetool generate --kind", () => {
  it("accepts image, speech and video, with audio as a speech alias", () => {
    expect(parseGenerateKind(undefined)).toBe("image");
    expect(parseGenerateKind("audio")).toBe("speech");
    expect(parseGenerateKind("VIDEO")).toBe("video");
    expect(() => parseGenerateKind("music")).toThrow("image, speech, video");
  });

  it("builds the generate_speech arguments that tools call takes", () => {
    expect(
      mediaToolCall("speech", "openai", "gpt-4o-mini-tts", "Hello", { voice: "alloy", speed: "1.5", output: "/work/out/hi.mp3" }, "/work")
    ).toEqual({
      tool: "generate_speech",
      args: { provider: "openai", model: "gpt-4o-mini-tts", text: "Hello", voice: "alloy", speed: 1.5, output_file: "out/hi.mp3" }
    });
  });

  it("builds the generate_video arguments and rejects a non-numeric duration", () => {
    expect(
      mediaToolCall("video", "fal_ai", "m", "waves", { duration: "5", aspectRatio: "16:9", resolution: "720p" }, "/work")
    ).toEqual({
      tool: "generate_video",
      args: { provider: "fal_ai", model: "m", prompt: "waves", duration_seconds: 5, aspect_ratio: "16:9", resolution: "720p" }
    });
    expect(() => mediaToolCall("video", "fal_ai", "m", "w", { duration: "five" })).toThrow("--duration must be a number");
  });
});

describe("nodetool generate --list-models pricing", () => {
  it("puts catalog-priced models first, cheapest first, then unpriced models by name", () => {
    const sorted = priceAndSortModels("fal_ai", [
      { id: "zz/unknown-model", name: "Zeta unknown" },
      { id: "fal-ai/flux-pro/v1.1-ultra", name: "Flux Ultra" },
      { id: "aa/unknown-model", name: "Alpha unknown" },
      { id: "fal-ai/flux/schnell", name: "Flux Schnell" }
    ]);
    const priced = sorted.filter((model) => model.price !== null);
    expect(priced.length).toBeGreaterThan(0);
    for (let i = 1; i < priced.length; i++) {
      expect(priced[i].price).toBeGreaterThanOrEqual(priced[i - 1].price ?? 0);
    }
    expect(sorted.slice(priced.length).map((model) => model.id)).toEqual(
      expect.arrayContaining(["aa/unknown-model", "zz/unknown-model"])
    );
    expect(sorted.at(-1)?.id).toBe("zz/unknown-model");
  });

  it("prints the price column and a dash for an unpriced model", () => {
    expect(formatPricedModel({ id: "a", name: "a", price: 0.003, billing_unit: "image" })).toContain("$0.0030/image");
    expect(formatPricedModel({ id: "b", name: "B", price: null, billing_unit: null })).toMatch(/—\s+b {2}— B/);
  });
});
