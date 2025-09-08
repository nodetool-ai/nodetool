import { describe, it, expect } from "@jest/globals";
import { applyAdvancedModelFilters, type ActiveFilters } from "../modelFilters";
import type { LanguageModel } from "../../stores/ApiTypes";

describe("modelFilters", () => {
  const mockModels: LanguageModel[] = [
    {
      id: "llama-3.2-1b-instruct",
      name: "Llama 3.2 1B Instruct",
      context_length: 131072,
      architecture: {
        modality: "text",
        tokenizer: "llama3",
        instruct_type: "llama3"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 131072
      }
    },
    {
      id: "qwen-2.5-7b-instruct",
      name: "Qwen 2.5 7B Instruct",
      context_length: 32768,
      architecture: {
        modality: "text",
        tokenizer: "qwen",
        instruct_type: "qwen"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 32768
      }
    },
    {
      id: "mistral-7b-base",
      name: "Mistral 7B Base",
      context_length: 8192,
      architecture: {
        modality: "text",
        tokenizer: "mistral",
        instruct_type: null
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 8192
      }
    },
    {
      id: "deepseek-coder-33b-instruct",
      name: "DeepSeek Coder 33B Instruct",
      context_length: 16384,
      architecture: {
        modality: "text",
        tokenizer: "deepseek",
        instruct_type: "deepseek"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 16384
      }
    },
    {
      id: "qwq-32b-preview",
      name: "QwQ 32B Preview",
      context_length: 32768,
      architecture: {
        modality: "text",
        tokenizer: "qwq",
        instruct_type: "qwq"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 32768
      }
    },
    {
      id: "phi-3-mini-4k-math",
      name: "Phi 3 Mini 4K Math",
      context_length: 4096,
      architecture: {
        modality: "text",
        tokenizer: "phi",
        instruct_type: "phi"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 4096
      }
    },
    {
      id: "mixtral-8x7b-instruct",
      name: "Mixtral 8x7B Instruct",
      context_length: 32768,
      architecture: {
        modality: "text",
        tokenizer: "mistral",
        instruct_type: "mistral"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 32768
      }
    },
    {
      id: "llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
      context_length: 131072,
      architecture: {
        modality: "text",
        tokenizer: "llama3",
        instruct_type: "llama3"
      },
      pricing: {
        prompt: "0.00",
        completion: "0.00",
        image: "0.00",
        request: "0.00"
      },
      top_provider: {
        is_moderated: false,
        max_completion_tokens: 131072
      }
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