import {
  normalizeModelMeta,
  buildMetaIndex,
  applyAdvancedModelFilters
} from "./modelNormalization";
import type { LanguageModel } from "../stores/ApiTypes";

describe("modelNormalization", () => {
  describe("normalizeModelMeta", () => {
    it("extracts type tags from model name", () => {
      const model = { id: "llama-7b-instruct", name: "Llama 7B Instruct" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toContain("instruct");
    });

    it("extracts chat tag", () => {
      const model = { id: "qwen-7b-chat", name: "Qwen 7B Chat" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toContain("chat");
    });

    it("extracts base tag", () => {
      const model = { id: "llama-7b-base", name: "Llama 7B Base" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toContain("base");
    });

    it("extracts size bucket for billion parameters", () => {
      const model = { id: "model-7b", name: "Model 7B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.sizeBucket).toBe("3-7B");
    });

    it("extracts size bucket for small models", () => {
      const model = { id: "model-1b", name: "Model 1B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.sizeBucket).toBe("1-2B");
    });

    it("extracts size bucket for medium models", () => {
      const model = { id: "model-13b", name: "Model 13B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.sizeBucket).toBe("8-15B");
    });

    it("extracts size bucket for large models", () => {
      const model = { id: "model-71b", name: "Model 71B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.sizeBucket).toBe("70B+");
    });

    it("extracts family from model name", () => {
      const model = { id: "llama-7b", name: "Llama 7B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.family).toBe("llama");
    });

    it("extracts mistral family", () => {
      const model = { id: "mistral-7b", name: "Mistral 7B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.family).toBe("mistral");
    });

    it("extracts deepseek family", () => {
      const model = { id: "deepseek-7b", name: "DeepSeek 7B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.family).toBe("deepseek");
    });

    it("extracts reasoning tag for r1 models", () => {
      const model = { id: "deepseek-r1", name: "DeepSeek R1" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toContain("reasoning");
    });

    it("extracts code tag for coder models", () => {
      const model = { id: "code-llama", name: "Code Llama" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toContain("code");
    });

    it("extracts math tag", () => {
      const model = { id: "math-llama", name: "Math Llama" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toContain("math");
    });

    it("extracts MoE architecture", () => {
      const model = { id: "mixtral-8x7b", name: "Mixtral 8x7B" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.moe).toBe("8x7B");
    });

    it("handles models with no matching tags", () => {
      const model = { id: "generic-model", name: "Generic Model" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.typeTags).toHaveLength(0);
      expect(meta.family).toBeUndefined();
      expect(meta.sizeBucket).toBeUndefined();
    });

    it("handles million parameters", () => {
      const model = { id: "model-1m", name: "Model 1M" } as LanguageModel;
      const meta = normalizeModelMeta(model);
      expect(meta.sizeB).toBe(0.001);
    });
  });

  describe("buildMetaIndex", () => {
    it("builds index with model and meta", () => {
      const models = [
        { id: "llama-7b", name: "Llama 7B" } as LanguageModel,
        { id: "qwen-7b", name: "Qwen 7B" } as LanguageModel,
      ];
      const index = buildMetaIndex(models);
      expect(index).toHaveLength(2);
      expect(index[0].model.id).toBe("llama-7b");
      expect(index[0].meta.family).toBe("llama");
    });

    it("handles empty array", () => {
      const index = buildMetaIndex([]);
      expect(index).toHaveLength(0);
    });
  });

  describe("applyAdvancedModelFilters", () => {
    it("returns all models when no filters", () => {
      const models = [
        { id: "llama-7b", name: "Llama 7B" } as LanguageModel,
        { id: "qwen-7b", name: "Qwen 7B" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: null,
        families: []
      });
      expect(result).toHaveLength(2);
    });

    it("filters by family", () => {
      const models = [
        { id: "llama-7b", name: "Llama 7B" } as LanguageModel,
        { id: "qwen-7b", name: "Qwen 7B" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: null,
        families: ["llama"]
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("llama-7b");
    });

    it("filters by type tag", () => {
      const models = [
        { id: "llama-7b-instruct", name: "Llama 7B Instruct" } as LanguageModel,
        { id: "llama-7b-base", name: "Llama 7B Base" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["instruct"],
        sizeBucket: null,
        families: []
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("llama-7b-instruct");
    });

    it("filters by size bucket", () => {
      const models = [
        { id: "model-3b", name: "Model 3B" } as LanguageModel,
        { id: "model-13b", name: "Model 13B" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: "3-7B",
        families: []
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("model-3b");
    });

    it("combines multiple filters", () => {
      const models = [
        { id: "llama-7b-instruct", name: "Llama 7B Instruct" } as LanguageModel,
        { id: "llama-7b-base", name: "Llama 7B Base" } as LanguageModel,
        { id: "qwen-7b-instruct", name: "Qwen 7B Instruct" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["instruct"],
        sizeBucket: null,
        families: ["llama"]
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("llama-7b-instruct");
    });

    it("returns empty array when no matches", () => {
      const models = [
        { id: "llama-7b-instruct", name: "Llama 7B Instruct" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["code"],
        sizeBucket: null,
        families: ["qwen"]
      });
      expect(result).toHaveLength(0);
    });
  });
});
