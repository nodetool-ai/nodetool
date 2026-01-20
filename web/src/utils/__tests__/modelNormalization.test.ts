import type { LanguageModel } from "../../stores/ApiTypes";
import {
  normalizeModelMeta,
  buildMetaIndex,
  applyAdvancedModelFilters,
} from "../modelNormalization";

const createMockLanguageModel = (overrides?: Partial<LanguageModel>): LanguageModel => ({
  type: "language_model",
  id: "model-1",
  name: "Test Model",
  provider: "openai",
  ...overrides,
});

describe("modelNormalization", () => {
  describe("normalizeModelMeta", () => {
    it("extracts instruct tag from name", () => {
      const model = createMockLanguageModel({ name: "Llama-2-Instruct" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("instruct");
    });

    it("extracts chat tag from name", () => {
      const model = createMockLanguageModel({ name: "GPT-4-Chat" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("chat");
    });

    it("extracts base tag from name", () => {
      const model = createMockLanguageModel({ name: "Llama-2-Base" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("base");
    });

    it("extracts reasoning tag", () => {
      const model = createMockLanguageModel({ name: "DeepSeek-R1" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("reasoning");
    });

    it("extracts code tag", () => {
      const model = createMockLanguageModel({ name: "CodeLlama" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("code");
    });

    it("extracts math tag", () => {
      const model = createMockLanguageModel({ name: "Math-LLM" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("math");
    });

    it("extracts size in billions", () => {
      const model = createMockLanguageModel({ name: "Model-7b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeB).toBe(7);
      expect(result.sizeBucket).toBe("3-7B");
    });

    it("extracts size in millions", () => {
      const model = createMockLanguageModel({ name: "Model-1.5m" });
      const result = normalizeModelMeta(model);
      expect(result.sizeB).toBe(0.0015);
    });

    it("extracts family from name", () => {
      const model = createMockLanguageModel({ name: "Llama-3-8b" });
      const result = normalizeModelMeta(model);
      expect(result.family).toBe("llama");
    });

    it("extracts mistral family", () => {
      const model = createMockLanguageModel({ name: "Mistral-7B" });
      const result = normalizeModelMeta(model);
      expect(result.family).toBe("mistral");
    });

    it("extracts qwen family", () => {
      const model = createMockLanguageModel({ name: "Qwen-14B" });
      const result = normalizeModelMeta(model);
      expect(result.family).toBe("qwen");
    });

    it("extracts MOE configuration", () => {
      const model = createMockLanguageModel({ name: "Mixtral-8x7B" });
      const result = normalizeModelMeta(model);
      expect(result.moe).toBe("8x7B");
    });

    it("handles multiple type tags", () => {
      const model = createMockLanguageModel({ name: "CodeLlama-Instruct-7b" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toContain("code");
      expect(result.typeTags).toContain("instruct");
    });

    it("returns empty typeTags when none match", () => {
      const model = createMockLanguageModel({ name: "GenericModel" });
      const result = normalizeModelMeta(model);
      expect(result.typeTags).toEqual([]);
    });

    it("returns undefined sizeBucket when no size info", () => {
      const model = createMockLanguageModel({ name: "Model" });
      const result = normalizeModelMeta(model);
      expect(result.sizeB).toBeUndefined();
      expect(result.sizeBucket).toBeUndefined();
    });

    it("returns undefined family when none match", () => {
      const model = createMockLanguageModel({ name: "UnknownModel" });
      const result = normalizeModelMeta(model);
      expect(result.family).toBeUndefined();
    });

    it("returns undefined moe when none match", () => {
      const model = createMockLanguageModel({ name: "RegularModel" });
      const result = normalizeModelMeta(model);
      expect(result.moe).toBeUndefined();
    });

    it("handles case insensitive matching", () => {
      const model = createMockLanguageModel({ name: "LLAMA-2-CHAT" });
      const result = normalizeModelMeta(model);
      expect(result.family).toBe("llama");
    });
  });

  describe("bucketSizeByB", () => {
    it("returns 1-2B for 1B", () => {
      const model = createMockLanguageModel({ name: "Model-1b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("1-2B");
    });

    it("returns 1-2B for 2B", () => {
      const model = createMockLanguageModel({ name: "Model-2b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("1-2B");
    });

    it("returns 3-7B for 3B", () => {
      const model = createMockLanguageModel({ name: "Model-3b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("3-7B");
    });

    it("returns 8-15B for 8B", () => {
      const model = createMockLanguageModel({ name: "Model-8b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("8-15B");
    });

    it("returns 16-34B for 20B", () => {
      const model = createMockLanguageModel({ name: "Model-20b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("16-34B");
    });

    it("returns 35-70B for 50B", () => {
      const model = createMockLanguageModel({ name: "Model-50b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("35-70B");
    });

    it("returns 70B+ for 100B", () => {
      const model = createMockLanguageModel({ name: "Model-100b" });
      const result = normalizeModelMeta(model);
      expect(result.sizeBucket).toBe("70B+");
    });
  });

  describe("buildMetaIndex", () => {
    it("creates index with model and meta for each model", () => {
      const models = [
        createMockLanguageModel({ id: "model-1", name: "Llama-2-7b" }),
        createMockLanguageModel({ id: "model-2", name: "Mistral-7B" }),
      ];

      const result = buildMetaIndex(models);

      expect(result).toHaveLength(2);
      expect(result[0].model.id).toBe("model-1");
      expect(result[0].meta.sizeBucket).toBe("3-7B");
      expect(result[1].model.id).toBe("model-2");
      expect(result[1].meta.family).toBe("mistral");
    });

    it("handles empty array", () => {
      const result = buildMetaIndex([]);
      expect(result).toEqual([]);
    });
  });

  describe("applyAdvancedModelFilters", () => {
    const models = [
      createMockLanguageModel({ id: "m1", name: "Llama-2-Instruct-7b" }),
      createMockLanguageModel({ id: "m2", name: "Llama-2-Base-7b" }),
      createMockLanguageModel({ id: "m3", name: "Mistral-Instruct-7B" }),
      createMockLanguageModel({ id: "m4", name: "CodeLlama-7b" }),
    ];

    it("returns all models when no filters applied", () => {
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: null,
        families: [],
      });
      expect(result).toHaveLength(4);
    });

    it("filters by type tag", () => {
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["instruct"],
        sizeBucket: null,
        families: [],
      });
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toContain("m1");
      expect(result.map((m) => m.id)).toContain("m3");
    });

    it("filters by size bucket", () => {
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: "3-7B",
        families: [],
      });
      expect(result).toHaveLength(4);
    });

    it("filters by family", () => {
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: null,
        families: ["llama"],
      });
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toContain("m1");
      expect(result.map((m) => m.id)).toContain("m2");
    });

    it("combines multiple filters", () => {
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["instruct"],
        sizeBucket: null,
        families: ["llama"],
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("m1");
    });

    it("returns empty when no models match", () => {
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["reasoning"],
        sizeBucket: null,
        families: [],
      });
      expect(result).toHaveLength(0);
    });
  });
});
