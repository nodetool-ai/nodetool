import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@nodetool/transformers-js-nodes", async () => {
  return {
    KOKORO_VOICES: ["af_heart", "af_bella"] as const,
    getTransformersJsCacheDir: () => "/tmp/tjs-cache",
    isKokoroRepo: (id: string) => /kokoro/i.test(id),
    recommendedFor: (type: string) => {
      const M: Record<string, Array<{ repo_id: string }>> = {
        "tjs.text_generation": [
          { repo_id: "onnx-community/Qwen3.5-2B-ONNX" },
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
        ]
      };
      return M[type] ?? [];
    },
    scanTransformersJsCache: vi.fn(async () => [
      { repo_id: "onnx-community/Kokoro-82M-v1.0-ONNX", size_bytes: 100 },
      { repo_id: "onnx-community/Qwen3.5-2B-ONNX", size_bytes: 200 }
    ])
  };
});

import {
  discoverASRModels,
  discoverEmbeddingModels,
  discoverLanguageModels,
  discoverTTSModels
} from "../src/model-discovery.js";

afterEach(() => vi.clearAllMocks());

describe("model-discovery", () => {
  it("language models include all recommended text-generation repos", async () => {
    const models = await discoverLanguageModels();
    const ids = models.map((m) => m.id);
    expect(ids).toContain("onnx-community/Qwen3.5-2B-ONNX");
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

  it("does not duplicate when a repo is both recommended and cached", async () => {
    const lang = await discoverLanguageModels();
    const occurrences = lang.filter(
      (m) => m.id === "onnx-community/Qwen3.5-2B-ONNX"
    );
    expect(occurrences).toHaveLength(1);
  });
});
