import { beforeEach, describe, expect, it, vi } from "vitest";

const tokenizer = vi.fn((texts: string[]) => ({ ids: texts }));
const processor = vi.fn(async (images: unknown[]) => ({ pixels: images }));
const textModel = vi.fn(async (inputs: { ids: string[] }) => ({
  text_embeds: { dims: [inputs.ids.length, 2], tolist: () => inputs.ids.map((_, i) => [i, 1]) }
}));
const visionModel = vi.fn(async (inputs: { pixels: unknown[] }) => ({
  image_embeds: { dims: [inputs.pixels.length, 2], tolist: () => inputs.pixels.map((_, i) => [1, i]) }
}));
const loads: Array<{ cls: string; repo: string; options: Record<string, unknown> }> = [];

function loader<T>(cls: string, value: T) {
  return {
    from_pretrained: async (repo: string, options: Record<string, unknown>) => {
      loads.push({ cls, repo, options });
      return value;
    }
  };
}

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  loadTransformers: async () => ({
    CLIPTokenizer: loader("CLIPTokenizer", tokenizer),
    CLIPImageProcessor: loader("CLIPImageProcessor", processor),
    CLIPTextModelWithProjection: loader("CLIPTextModelWithProjection", textModel),
    CLIPVisionModelWithProjection: loader("CLIPVisionModelWithProjection", visionModel)
  }),
  bytesToRawImage: async (bytes: Uint8Array, mime?: string) => ({ bytes, mime }),
  trackModelLoad: async <T>(_repo: string, load: (progress: () => void) => Promise<T>) => load(() => {})
}));

import {
  clearClipCache,
  clipImageEmbedding,
  clipTextEmbedding,
  isClipModel
} from "../src/clip-embeddings.js";
import { TransformersJsProvider } from "../src/transformers-js-provider.js";

describe("CLIP embeddings", () => {
  beforeEach(() => {
    clearClipCache();
    loads.length = 0;
    vi.clearAllMocks();
  });

  it("recognizes OpenAI CLIP checkpoints and nothing else", () => {
    expect(isClipModel("Xenova/clip-vit-base-patch32")).toBe(true);
    expect(isClipModel("openai/clip-vit-large-patch14")).toBe(true);
    expect(isClipModel("Xenova/all-MiniLM-L6-v2")).toBe(false);
    expect(isClipModel("jinaai/jina-clip-v2")).toBe(false);
    expect(isClipModel("Xenova/eclipse-model")).toBe(false);
  });

  it("reads the projected embeddings of both encoders", async () => {
    expect(await clipTextEmbedding(["a fox", "a dog"], "Xenova/clip-vit-base-patch32")).toEqual([
      [0, 1],
      [1, 1]
    ]);
    expect(tokenizer).toHaveBeenCalledWith(["a fox", "a dog"], { padding: true, truncation: true });
    const png = new Uint8Array([1, 2, 3]);
    expect(
      await clipImageEmbedding([{ data: png, mimeType: "image/png" }], "Xenova/clip-vit-base-patch32")
    ).toEqual([[1, 0]]);
    expect(processor).toHaveBeenCalledWith([{ bytes: png, mime: "image/png" }]);
    expect(loads.map((load) => load.cls).sort()).toEqual([
      "CLIPImageProcessor",
      "CLIPTextModelWithProjection",
      "CLIPTokenizer",
      "CLIPVisionModelWithProjection"
    ]);
    expect(loads.find((load) => load.cls === "CLIPVisionModelWithProjection")?.options.dtype).toBe("q8");
  });

  it("loads each encoder once per model", async () => {
    await clipTextEmbedding(["a"], "Xenova/clip-vit-base-patch32");
    await clipTextEmbedding(["b"], "Xenova/clip-vit-base-patch32");
    expect(loads.filter((load) => load.cls === "CLIPTextModelWithProjection")).toHaveLength(1);
  });

  it("routes a CLIP model's text and images through the provider", async () => {
    const provider = new TransformersJsProvider();
    expect(await provider.generateEmbedding({ text: "a fox", model: "Xenova/clip-vit-base-patch32" })).toEqual([
      [0, 1]
    ]);
    expect(
      await provider.generateImageEmbedding({
        images: [{ data: new Uint8Array([1]) }],
        model: "Xenova/clip-vit-base-patch32"
      })
    ).toEqual([[1, 0]]);
    await expect(
      provider.generateImageEmbedding({ images: [{ data: new Uint8Array([1]) }], model: "Xenova/all-MiniLM-L6-v2" })
    ).rejects.toThrow(/does not embed images/);
  });
});
