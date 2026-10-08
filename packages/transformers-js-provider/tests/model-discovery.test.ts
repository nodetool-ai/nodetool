import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@nodetool-ai/transformers-js-nodes", async () => {
  return {
    KOKORO_VOICES: ["af_heart", "af_bella"] as const,
    getTransformersJsCacheDir: () => "/tmp/tjs-cache",
    isKokoroRepo: (id: string) => /kokoro/i.test(id),
    recommendedFor: (type: string) => {
      const M: Record<string, Array<{ repo_id: string }>> = {
        "tjs.text_generation": [
          { repo_id: "onnx-community/Qwen3-1.7B-ONNX" },
          { repo_id: "HuggingFaceTB/SmolLM3-3B-ONNX" }
        ],
        "tjs.text_to_speech": [
          { repo_id: "onnx-community/Kokoro-82M-v1.0-ONNX" },
          { repo_id: "Xenova/speecht5_tts" }
        ],
        "tjs.automatic_speech_recognition": [
          { repo_id: "onnx-community/whisper-large-v3-turbo" }
        ],
        "tjs.feature_extraction": [
          { repo_id: "Xenova/all-MiniLM-L6-v2" }
        ],
        "tjs.background_removal": [{ repo_id: "briaai/RMBG-1.4" }],
        "tjs.depth_estimation": [
          { repo_id: "onnx-community/depth-anything-v2-small" }
        ],
        "tjs.text_ranking": [
          { repo_id: "mixedbread-ai/mxbai-rerank-xsmall-v1" }
        ]
      };
      return M[type] ?? [];
    },
    scanTransformersJsCache: vi.fn(async () => [
      { repo_id: "onnx-community/Kokoro-82M-v1.0-ONNX", size_bytes: 100 },
      { repo_id: "onnx-community/Qwen3-1.7B-ONNX", size_bytes: 200 }
    ])
  };
});

import {
  discoverASRModels,
  discoverEmbeddingModels,
  discoverImageModels,
  discoverLanguageModels,
  discoverRerankModels,
  discoverTTSModels
} from "../src/model-discovery.js";

afterEach(() => vi.clearAllMocks());

describe("model-discovery", () => {
  it("language models include all recommended text-generation repos", async () => {
    const models = await discoverLanguageModels();
    const ids = models.map((m) => m.id);
    expect(ids).toContain("onnx-community/Qwen3-1.7B-ONNX");
    expect(ids).toContain("HuggingFaceTB/SmolLM3-3B-ONNX");
    for (const m of models) {
      expect(m.provider).toBe("transformers_js");
    }
  });

  it("TTS models populate Kokoro voices", async () => {
    const models = await discoverTTSModels();
    const kokoro = models.find((m) =>
      m.id.includes("Kokoro")
    );
    expect(kokoro?.voices).toEqual(["af_heart", "af_bella"]);
    const speecht5 = models.find((m) => m.id.includes("speecht5"));
    expect(speecht5?.voices).toBeUndefined();
  });

  it("ASR and embedding discovery returns recommended repos", async () => {
    const asr = await discoverASRModels();
    expect(asr.map((m) => m.id)).toContain(
      "onnx-community/whisper-large-v3-turbo"
    );

    const embed = await discoverEmbeddingModels();
    expect(embed.map((m) => m.id)).toContain("Xenova/all-MiniLM-L6-v2");
  });

  it("tags each image model with the capability it serves", async () => {
    const models = await discoverImageModels();
    expect(
      models.map((m) => [m.id, m.supportedTasks, m.adapter?.artifactRef?.modelType])
    ).toEqual([
      ["briaai/RMBG-1.4", ["remove_background"], "tjs.background_removal"],
      [
        "onnx-community/depth-anything-v2-small",
        ["estimate_depth"],
        "tjs.depth_estimation"
      ]
    ]);
  });

  it("lists reranking models with their download type", async () => {
    const [model] = await discoverRerankModels();
    expect(model.id).toBe("mixedbread-ai/mxbai-rerank-xsmall-v1");
    expect(model.adapter?.artifactRef?.modelType).toBe("tjs.text_ranking");
  });

  it("names the repository and download type each model loads", async () => {
    const [asr] = await discoverASRModels();
    expect(asr.adapter?.artifactRef).toEqual({
      source: "huggingface",
      repoId: "onnx-community/whisper-large-v3-turbo",
      modelType: "tjs.automatic_speech_recognition"
    });
    const [embed] = await discoverEmbeddingModels();
    expect(embed.adapter?.artifactRef?.modelType).toBe(
      "tjs.feature_extraction"
    );
  });

  it("does not duplicate when a repo is both recommended and cached", async () => {
    const lang = await discoverLanguageModels();
    const occurrences = lang.filter(
      (m) => m.id === "onnx-community/Qwen3-1.7B-ONNX"
    );
    expect(occurrences).toHaveLength(1);
  });
});
