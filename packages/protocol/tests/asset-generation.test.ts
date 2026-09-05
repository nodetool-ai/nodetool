/**
 * The prompt and settings a generated asset carries. Both write paths (the
 * runtime generation seam, the workflow auto-save) build the fragment here, so
 * what one writes the asset viewer reads back unchanged.
 */

import { describe, it, expect } from "vitest";
import {
  ASSET_PARAM_MAX_CHARS,
  ASSET_PARAM_MAX_KEYS,
  ASSET_PROMPT_MAX_CHARS,
  buildAssetGenerationMetadata,
  readAssetGenerationMetadata
} from "../src/asset-generation.js";

describe("buildAssetGenerationMetadata", () => {
  it("keeps the prompt, the model and the scalar settings", () => {
    expect(
      buildAssetGenerationMetadata({
        prompt: "  a fox in snow  ",
        provider: "fal",
        model: "fal-ai/flux/dev",
        modelName: "FLUX.1 [dev]",
        capability: "text_to_image",
        params: {
          prompt: "a fox in snow",
          width: 1024,
          height: 1024,
          seed: 42,
          raw: true,
          loras: ["a", "b"]
        }
      })
    ).toEqual({
      prompt: "a fox in snow",
      generation: {
        provider: "fal",
        model: "fal-ai/flux/dev",
        model_name: "FLUX.1 [dev]",
        capability: "text_to_image",
        params: {
          width: 1024,
          height: 1024,
          seed: 42,
          raw: true,
          loras: ["a", "b"]
        }
      }
    });
  });

  it("drops what cannot be re-run: bytes, nested objects, internals, plumbing", () => {
    const { generation } = buildAssetGenerationMetadata({
      provider: "fal",
      model: "m",
      params: {
        images: [new Uint8Array([1, 2, 3])],
        image: { bytes: 40 },
        signal: new AbortController().signal,
        _tool_call_id: "call-1",
        output_file: "out.png",
        background: true,
        empty: "   ",
        nan: Number.NaN,
        steps: 30
      }
    });
    expect(generation?.params).toEqual({ steps: 30 });
  });

  it("caps the prompt, each string setting, and the number of settings", () => {
    const params: Record<string, unknown> = {
      style: "s".repeat(ASSET_PARAM_MAX_CHARS + 100)
    };
    for (let i = 0; i < ASSET_PARAM_MAX_KEYS + 10; i += 1) {
      params[`k${i}`] = i;
    }
    const meta = buildAssetGenerationMetadata({
      prompt: "p".repeat(ASSET_PROMPT_MAX_CHARS + 100),
      params
    });
    expect(meta.prompt).toHaveLength(ASSET_PROMPT_MAX_CHARS);
    expect(meta.generation?.params?.style).toHaveLength(ASSET_PARAM_MAX_CHARS);
    expect(Object.keys(meta.generation?.params ?? {})).toHaveLength(
      ASSET_PARAM_MAX_KEYS
    );
  });

  it("omits the model name when it repeats the id, and answers {} with nothing to keep", () => {
    expect(
      buildAssetGenerationMetadata({ model: "m", modelName: "m" }).generation
    ).toEqual({ model: "m" });
    expect(buildAssetGenerationMetadata({ prompt: "  ", params: {} })).toEqual({});
    expect(buildAssetGenerationMetadata({ prompt: 42, params: null })).toEqual({});
  });
});

describe("readAssetGenerationMetadata", () => {
  it("round-trips what the builder wrote", () => {
    const built = buildAssetGenerationMetadata({
      prompt: "a fox",
      provider: "fal",
      model: "m",
      nodeType: "nodetool.image.TextToImage",
      params: { seed: 7 }
    });
    expect(readAssetGenerationMetadata(built)).toEqual(built);
  });

  it("ignores unrelated metadata and re-validates a hand-written row", () => {
    expect(
      readAssetGenerationMetadata({
        generation_id: "g-1",
        generation_index: 3,
        prompt: "a fox"
      })
    ).toEqual({ prompt: "a fox" });

    expect(
      readAssetGenerationMetadata({
        generation: { model: 42, provider: "fal", params: { bad: { a: 1 }, seed: 7 } }
      })
    ).toEqual({ generation: { provider: "fal", params: { seed: 7 } } });

    for (const value of [null, undefined, "x", 5, ["a"]]) {
      expect(readAssetGenerationMetadata(value)).toEqual({});
    }
  });
});
