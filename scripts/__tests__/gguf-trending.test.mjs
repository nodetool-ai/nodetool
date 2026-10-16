import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  displayName,
  isCandidate,
  modelKey,
  pickFile,
  renderModule,
  selectTrending
} from "../gguf/select.mjs";

const RULES = JSON.parse(readFileSync(new URL("../gguf/sources.json", import.meta.url), "utf8"));

const chat = (id, extra = {}) => ({
  id,
  pipeline_tag: "text-generation",
  gguf: { context_length: 131072 },
  ...extra
});
const file = (path, size) => ({ type: "file", path, size: 1, lfs: { size } });

describe("trending GGUF selection", () => {
  it("admits trusted publishers' chat models only", () => {
    expect(isCandidate(chat("unsloth/LFM2.5-24B-A2B-GGUF"), RULES)).toBe(true);
    expect(isCandidate(chat("unsloth/Qwen3.8-27B-GGUF", { pipeline_tag: undefined }), RULES)).toBe(true);
    // An unknown publisher, a blocked word, a text-to-image repo with a
    // language-model text encoder, and an embedding model.
    expect(isCandidate(chat("jialinyyzz/humanizer"), RULES)).toBe(false);
    expect(isCandidate(chat("unsloth/Qwen3.8-27B-Uncensored-GGUF"), RULES)).toBe(false);
    expect(isCandidate(chat("unsloth/Qwen-Image-2.1-GGUF", { pipeline_tag: "text-to-image" }), RULES)).toBe(false);
    expect(
      isCandidate(chat("unsloth/embeddinggemma-2-GGUF", { pipeline_tag: "feature-extraction" }), RULES)
    ).toBe(false);
    expect(isCandidate({ id: "unsloth/x-GGUF", pipeline_tag: "text-generation" }, RULES)).toBe(false);
    // An embedding repo without a feature-extraction tag.
    expect(isCandidate(chat("Qwen/Qwen3-Embedding-8B-GGUF"), RULES)).toBe(false);
  });

  it("picks the preferred single-file quantization under the size cap", () => {
    const files = [
      file("README.md", 10),
      file("Model-Q8_0.gguf", 8e9),
      file("mmproj-Model-Q4_K_M.gguf", 1e8),
      file("Model-Q4_K_S.gguf", 4e9),
      file("Model-Q4_K_M.gguf", 4.5e9)
    ];
    expect(pickFile(files, RULES)).toEqual({ path: "Model-Q4_K_M.gguf", size: 4.5e9 });
    // A split Q4_K_M and an oversized one fall through to the next quantization.
    expect(
      pickFile(
        [file("Q4_K_M/Model-Q4_K_M-00001-of-00002.gguf", 9e9), file("Model-Q4_K_S.gguf", 4e9)],
        RULES
      )
    ).toEqual({ path: "Model-Q4_K_S.gguf", size: 4e9 });
    expect(pickFile([file("Big-Q4_K_M.gguf", 90e9)], RULES)).toBeNull();
    // A 177B model whose only small Q4_K_M file is a draft head.
    expect(pickFile([file("MTP/mtp-Flash-Q4_K_M.gguf", 2e9)], RULES, 177e9)).toBeNull();
    expect(pickFile([file("Model-Q4_K_M.gguf", 4.5e9)], RULES, 8e9)).toEqual({
      path: "Model-Q4_K_M.gguf",
      size: 4.5e9
    });
  });

  it("names a model after its repo and download size", () => {
    expect(displayName("unsloth/LFM2.5-24B-A2B-GGUF", 14.4e9)).toBe("LFM2.5 24B A2B (14.4 GB)");
    expect(displayName("openbmb/MiniCPM-V-4.7-1B-gguf", 640e6)).toBe("MiniCPM V 4.7 1B (640 MB)");
    expect(modelKey("LiquidAI/LFM2.5-24B-A2B-GGUF")).toBe(modelKey("unsloth/LFM2.5-24B-A2B-GGUF"));
    // A repo that adds a draft head holds the same model.
    expect(modelKey("unsloth/Qwen3.6-35B-A3B-MTP-GGUF")).toBe(modelKey("unsloth/Qwen3.6-35B-A3B-GGUF"));
  });

  it("keeps trending order, one repo per base model, up to the limit", async () => {
    const repos = [
      chat("jialinyyzz/humanizer"),
      chat("LiquidAI/LFM2.5-24B-A2B-GGUF"),
      chat("unsloth/LFM2.5-24B-A2B-GGUF"),
      chat("unsloth/Huge-800B-GGUF"),
      chat("JetBrains/Mellum2.1-12B-A2.5B-Thinking-GGUF")
    ];
    const trees = {
      "LiquidAI/LFM2.5-24B-A2B-GGUF": [file("LFM2.5-24B-A2B-Q4_K_M.gguf", 14.4e9)],
      "unsloth/Huge-800B-GGUF": [file("Huge-Q4_K_M.gguf", 400e9)],
      "JetBrains/Mellum2.1-12B-A2.5B-Thinking-GGUF": [file("Mellum-Q4_K_M.gguf", 7.3e9)]
    };
    const { models, skipped } = await selectTrending(repos, { ...RULES, maxModels: 2 }, async (id) => trees[id] ?? []);
    expect(models.map((m) => m.repoId)).toEqual([
      "LiquidAI/LFM2.5-24B-A2B-GGUF",
      "JetBrains/Mellum2.1-12B-A2.5B-Thinking-GGUF"
    ]);
    expect(skipped).toEqual([
      { repoId: "jialinyyzz/humanizer", reason: "rules" },
      { repoId: "unsloth/LFM2.5-24B-A2B-GGUF", reason: "duplicate" },
      { repoId: "unsloth/Huge-800B-GGUF", reason: "no file fits" }
    ]);
  });

  it("writes a stable module the provider imports", () => {
    const module = renderModule([{ repoId: "a/B-GGUF", file: "B-Q4_K_M.gguf", name: "B (1.0 GB)" }]);
    expect(module).toContain('import type { RecommendedGguf } from "./node-llama-cpp-models.js";');
    expect(module).toContain('repoId: "a/B-GGUF"');
    expect(module).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(renderModule([])).toContain("TRENDING_CHAT_GGUFS: readonly RecommendedGguf[] = [];");
  });
});
