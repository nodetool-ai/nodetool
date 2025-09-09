import { describe, it, expect } from "@jest/globals";
import { applyAdvancedModelFilters, type ActiveFilters } from "../modelFilters";
import type { LanguageModel } from "../../stores/ApiTypes";

describe("modelFilters", () => {
  const mockModels: LanguageModel[] = [
    {
      id: "llama-3.2-1b-instruct",
      name: "Llama 3.2 1B Instruct",
      type: "language_model",
      provider: "local"
    },
    {
      id: "qwen-2.5-7b-instruct",
      name: "Qwen 2.5 7B Instruct",
      type: "language_model",
      provider: "local"
    },
    {
      id: "mistral-7b-base",
      name: "Mistral 7B Base",
      type: "language_model",
      provider: "local"
    },
    {
      id: "deepseek-coder-33b-instruct",
      name: "DeepSeek Coder 33B Instruct",
      type: "language_model",
      provider: "local"
    },
    {
      id: "qwq-32b-preview",
      name: "QwQ 32B Preview",
      type: "language_model",
      provider: "local"
    },
    {
      id: "phi-3-mini-4k-math",
      name: "Phi 3 Mini 4K Math",
      type: "language_model",
      provider: "local"
    },
    {
      id: "mixtral-8x7b-instruct",
      name: "Mixtral 8x7B Instruct",
      type: "language_model",
      provider: "local"
    },
    {
      id: "llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
      type: "language_model",
      provider: "local"
    }
  ];

  describe("applyAdvancedModelFilters", () => {
    it("should return all models when no filters are applied", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toEqual(mockModels);
    });

    it("should return empty array for empty input", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["instruct"],
        sizeBucket: "3-7B",
        families: ["llama"]
      };

      const result = applyAdvancedModelFilters([], filters);
      expect(result).toEqual([]);
    });

    it("should handle null or undefined models array", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: []
      };

      const result = applyAdvancedModelFilters(null as any, filters);
      expect(result).toBeNull();

      const result2 = applyAdvancedModelFilters(undefined as any, filters);
      expect(result2).toBeUndefined();
    });

    it("should filter by size bucket", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: "1-2B",
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("llama-3.2-1b-instruct");
    });

    it("should filter by multiple size buckets", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: "3-7B",
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      const ids = result.map(m => m.id);
      expect(ids).toContain("qwen-2.5-7b-instruct");
      expect(ids).toContain("mistral-7b-base");
    });

    it("should filter by type tags", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["base"],
        sizeBucket: null,
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("mistral-7b-base");
    });

    it("should filter by multiple type tags (OR logic)", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["code", "math"],
        sizeBucket: null,
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      const ids = result.map(m => m.id);
      expect(ids).toContain("deepseek-coder-33b-instruct");
      expect(ids).toContain("phi-3-mini-4k-math");
    });

    it("should filter by family", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: ["llama"]
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      const ids = result.map(m => m.id);
      expect(ids).toContain("llama-3.2-1b-instruct");
      expect(ids).toContain("llama-3.3-70b-instruct");
      expect(result).toHaveLength(2);
    });

    it("should filter by multiple families (OR logic)", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: ["mistral", "qwen", "mixtral"]
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      const ids = result.map(m => m.id);
      expect(ids).toContain("qwen-2.5-7b-instruct");
      expect(ids).toContain("mistral-7b-base");
      expect(ids).toContain("mixtral-8x7b-instruct");
    });

    it("should combine multiple filters (AND logic between filter types)", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["instruct"],
        sizeBucket: "3-7B",
        families: ["qwen"]
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("qwen-2.5-7b-instruct");
    });

    it("should handle reasoning type tag", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["reasoning"],
        sizeBucket: null,
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("qwq-32b-preview");
    });

    it("should handle MOE models in correct size buckets", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: "3-7B",
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      const ids = result.map(m => m.id);
      // Mixtral 8x7B gets parsed as 7B size (the model parser doesn't calculate total MOE size)
      expect(ids).toContain("mixtral-8x7b-instruct");
    });

    it("should handle 70B+ size bucket", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: "70B+",
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      // Since we have exactly 70B model, it should be in 35-70B bucket, not 70B+
      expect(result).toHaveLength(0);
    });

    it("should filter models with no matching family when family filter is applied", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: ["nonexistent"]
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toHaveLength(0);
    });

    it("should handle complex combined filters with no matches", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["chat"],
        sizeBucket: "70B+",
        families: ["phi"]
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      expect(result).toHaveLength(0);
    });

    it("should filter correctly when model has multiple type tags", () => {
      const filters: ActiveFilters = {
        selectedTypes: ["instruct"],
        sizeBucket: "16-34B",
        families: []
      };

      const result = applyAdvancedModelFilters(mockModels, filters);
      const ids = result.map(m => m.id);
      expect(ids).toContain("deepseek-coder-33b-instruct");
      // qwq-32b-preview doesn't have "instruct" in the name, only "reasoning"
      expect(result).toHaveLength(1);
    });
  });
});