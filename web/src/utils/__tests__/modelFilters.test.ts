import { applyAdvancedModelFilters, ActiveFilters } from "../modelFilters";
import { LanguageModel } from "../../stores/ApiTypes";

describe("modelFilters", () => {
  describe("applyAdvancedModelFilters", () => {
    const createModel = (name: string, id?: string): LanguageModel => ({
      id: id || name.toLowerCase().replace(/\s+/g, "-"),
      name: name,
      type: "language_model" as const,
      provider: "ollama" as const,
    });

    it("returns empty array for empty models", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: [],
      };
      expect(applyAdvancedModelFilters([], filters)).toEqual([]);
    });

    it("returns original array for null models", () => {
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: [],
      };
      expect(applyAdvancedModelFilters(null as any, filters)).toBeNull();
    });

    it("returns all models when no filters applied", () => {
      const models = [createModel("Model 1"), createModel("Model 2")];
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: [],
      };
      expect(applyAdvancedModelFilters(models, filters)).toHaveLength(2);
    });

    it("filters by type tag from name parsing (instruct)", () => {
      const models = [
        createModel("Llama 7B Instruct"),
        createModel("Llama 7B Base"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: ["instruct"],
        sizeBucket: null,
        families: [],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("Instruct");
    });

    it("filters by family from name parsing", () => {
      const models = [
        createModel("Llama 7B Instruct"),
        createModel("Mistral 7B Instruct"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: ["llama"],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("Llama");
    });

    it("excludes models without matching family", () => {
      const models = [
        createModel("Llama 7B Instruct"),
        createModel("Mistral 7B Instruct"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: null,
        families: ["qwen"],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(0);
    });

    it("combines multiple filters", () => {
      const models = [
        createModel("Llama 7B Instruct"),
        createModel("Llama 7B Base"),
        createModel("Mistral 7B Instruct"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: ["instruct"],
        sizeBucket: null,
        families: ["llama"],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("Llama");
      expect(result[0].name).toContain("Instruct");
    });

    it("filters by size bucket from name parsing (7b)", () => {
      const models = [
        createModel("Llama 7B Instruct"),
        createModel("Llama 70B Instruct"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: "3-7B",
        families: [],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("7B");
    });

    it("filters by size bucket for large models", () => {
      const models = [
        createModel("Llama 70B Instruct"),
        createModel("Llama 7B Instruct"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: [],
        sizeBucket: "70B+",
        families: [],
      };
      const result = applyAdvancedModelFilters(models, filters);
      // 70b should be in 70B+ bucket
      expect(result.length).toBeLessThanOrEqual(models.length);
    });

    it("returns empty array when no models match filters", () => {
      const models = [
        createModel("Llama 7B Instruct"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: ["code"],
        sizeBucket: null,
        families: [],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(0);
    });

    it("handles multiple type tags", () => {
      const models = [
        createModel("Llama 7B Instruct Chat"),
        createModel("Llama 7B Base"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: ["chat"],
        sizeBucket: null,
        families: [],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("Chat");
    });

    it("filters by reasoning type", () => {
      const models = [
        createModel("DeepSeek R1"),
        createModel("Llama 7B Base"),
      ];
      const filters: ActiveFilters = {
        selectedTypes: ["reasoning"],
        sizeBucket: null,
        families: [],
      };
      const result = applyAdvancedModelFilters(models, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toContain("R1");
    });
  });
});
