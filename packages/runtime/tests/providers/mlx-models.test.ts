/**
 * The MLX worker lists only cached repositories. The provider adds the
 * recommended chat models with a download target, so a fresh install has
 * MLX models to download in the picker.
 */
import { describe, expect, it, vi } from "vitest";

import { PythonProvider } from "../../src/providers/python-provider.js";
import {
  RECOMMENDED_MLX_IMAGE_MODELS,
  RECOMMENDED_MLX_LANGUAGE_MODELS
} from "../../src/providers/mlx-models.js";
import type { PythonBridgeBase } from "../../src/python-bridge-base.js";

function makeProvider(id: string, cached: Array<Record<string, unknown>>): PythonProvider {
  const bridge = { getProviderModels: vi.fn().mockResolvedValue(cached) };
  return new PythonProvider({
    _id: id,
    _bridge: bridge as unknown as PythonBridgeBase,
    _capabilities: ["generate_message"]
  });
}

describe("MLX recommended models", () => {
  it("offers every recommended model with its repository to download", async () => {
    const models = await makeProvider("mlx", []).getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(RECOMMENDED_MLX_LANGUAGE_MODELS.map((m) => m.repoId));
    expect(models[0]!.adapter).toEqual({
      state: "installed",
      artifactRef: { source: "huggingface", repoId: RECOMMENDED_MLX_LANGUAGE_MODELS[0]!.repoId }
    });
    expect(models.every((m) => m.provider === "mlx")).toBe(true);
  });

  it("lists a cached recommended model once and keeps other cached models", async () => {
    const recommended = RECOMMENDED_MLX_LANGUAGE_MODELS[0]!.repoId;
    const models = await makeProvider("mlx", [
      { id: recommended, name: "cached" },
      { id: "mlx-community/other-4bit", name: "other" }
    ]).getAvailableLanguageModels();
    expect(models.filter((m) => m.id === recommended)).toHaveLength(1);
    expect(models.at(-1)!.id).toBe("mlx-community/other-4bit");
  });

  it("leaves other Python providers unchanged", async () => {
    const models = await makeProvider("huggingface", []).getAvailableLanguageModels();
    expect(models).toEqual([]);
  });

  it("offers the recommended image models with their tasks", async () => {
    const models = await makeProvider("mlx", []).getAvailableImageModels();
    expect(models.map((m) => m.id)).toEqual(RECOMMENDED_MLX_IMAGE_MODELS.map((m) => m.repoId));
    const edit = models.find((m) => m.id.includes("qwen-image-edit"))!;
    expect(edit.supportedTasks).toEqual(["image_to_image"]);
    expect(edit.adapter?.artifactRef?.repoId).toBe(edit.id);
  });

  it("gives each speech model its repository as a download target", async () => {
    const provider = makeProvider("mlx", [
      { id: "mlx-community/Kokoro-82M-bf16", name: "Kokoro" },
      { id: "not a repo", name: "Other" }
    ]);
    const tts = await provider.getAvailableTTSModels();
    expect(tts[0]!.adapter?.artifactRef?.repoId).toBe("mlx-community/Kokoro-82M-bf16");
    expect(tts[1]!.adapter).toBeUndefined();
    const asr = await provider.getAvailableASRModels();
    expect(asr[0]!.adapter?.artifactRef?.repoId).toBe("mlx-community/Kokoro-82M-bf16");
  });

  it("adds no download targets to other Python providers' speech models", async () => {
    const provider = makeProvider("huggingface", [{ id: "hexgrad/Kokoro-82M", name: "Kokoro" }]);
    expect((await provider.getAvailableTTSModels())[0]!.adapter).toBeUndefined();
  });
});
