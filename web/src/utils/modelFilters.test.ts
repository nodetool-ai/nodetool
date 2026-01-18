import { applyAdvancedModelFilters } from "./modelFilters";
import type { LanguageModel } from "../stores/ApiTypes";

describe("modelFilters", () => {
  describe("applyAdvancedModelFilters", () => {
    it("returns original array when empty", () => {
      const models: LanguageModel[] = [];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: null,
        families: []
      });
      expect(result).toEqual([]);
    });

    it("returns original array when models is empty", () => {
      const models: LanguageModel[] = [];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: ["instruct"],
        sizeBucket: "3-7B",
        families: ["llama"]
      });
      expect(result).toEqual([]);
    });

    it("filters by selected types", () => {
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

    it("filters by families", () => {
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

    it("returns all when selectedTypes is empty array", () => {
      const models = [
        { id: "llama-7b-instruct", name: "Llama 7B Instruct" } as LanguageModel,
        { id: "qwen-7b-chat", name: "Qwen 7B Chat" } as LanguageModel,
      ];
      const result = applyAdvancedModelFilters(models, {
        selectedTypes: [],
        sizeBucket: null,
        families: []
      });
      expect(result).toHaveLength(2);
    });

    it("returns all when families is empty array", () => {
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
  });
});
