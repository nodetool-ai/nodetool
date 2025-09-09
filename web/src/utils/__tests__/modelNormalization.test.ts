import { describe, it, expect } from "@jest/globals";
import { normalizeModelMeta, buildMetaIndex } from "../modelNormalization";
import type { LanguageModel } from "../../stores/ApiTypes";

describe("modelNormalization", () => {
  describe("normalizeModelMeta", () => {
    it("should extract size in billions from model name", () => {
      const model: LanguageModel = {
        type: "language_model",
        provider: "local", 
        id: "test-7b",
        name: "Test Model 7B"
      };

      const result = normalizeModelMeta(model);
      expect(result.sizeB).toBe(7);
      expect(result.sizeBucket).toBe("3-7B");
    });

    it("should extract size with decimals", () => {
      const model: LanguageModel = {
        type: "language_model",
        provider: "local",
        id: "test-1.5b",
        name: "Test Model 1.5B"
      };

      const result = normalizeModelMeta(model);
      expect(result.sizeB).toBe(1.5);
      expect(result.sizeBucket).toBe("1-2B");
    });

    it("should convert size from millions to billions", () => {
      const model: LanguageModel = {
        type: "language_model",
        provider: "local",
        id: "test-350m",
        name: "Test Model 350M"
      };

      const result = normalizeModelMeta(model);
      expect(result.sizeB).toBe(0.35);
      expect(result.sizeBucket).toBe("1-2B");
    });

    it("should categorize size buckets correctly", () => {
      const testCases = [
        { size: "0.5b", expected: "1-2B" },
        { size: "2b", expected: "1-2B" },
        { size: "3b", expected: "3-7B" },
        { size: "7b", expected: "3-7B" },
        { size: "8b", expected: "8-15B" },
        { size: "15b", expected: "8-15B" },
        { size: "16b", expected: "16-34B" },
        { size: "34b", expected: "16-34B" },
        { size: "35b", expected: "35-70B" },
        { size: "70b", expected: "35-70B" },
        { size: "71b", expected: "70B+" },
        { size: "175b", expected: "70B+" }
      ];

      testCases.forEach(({ size, expected }) => {
        const model: LanguageModel = {
          type: "language_model",
          provider: "local",
          id: `test-${size}`,
          name: `Test Model ${size.toUpperCase()}`
        };

        const result = normalizeModelMeta(model);
        expect(result.sizeBucket).toBe(expected);
      });
    });

    it("should extract type tags", () => {
      const testCases = [
        { name: "Model Instruct", tags: ["instruct"] },
        { name: "Model Chat", tags: ["chat"] },
        { name: "Model Base", tags: ["base"] },
        { name: "Model SFT", tags: ["sft"] },
        { name: "Model DPO", tags: ["dpo"] },
        { name: "Model Reasoning", tags: ["reasoning"] },
        { name: "Model R1", tags: ["reasoning"] },
        { name: "QwQ Model", tags: ["reasoning"] },
        { name: "Model Code", tags: ["code"] },
        { name: "Model Coder", tags: ["code"] },
        { name: "Model Math", tags: ["math"] },
        { name: "Instruct Chat Model", tags: ["instruct", "chat"] },
        { name: "Code Math Instruct", tags: ["instruct", "code", "math"] }
      ];

      testCases.forEach(({ name, tags }) => {
        const model: LanguageModel = {
          id: "test",
          name,
          type: "language_model",
          provider: "local"
        };

        const result = normalizeModelMeta(model);
        expect(result.typeTags).toEqual(expect.arrayContaining(tags));
        expect(result.typeTags).toHaveLength(tags.length);
      });
    });

    it("should extract family from model name", () => {
      const testCases = [
        { name: "Llama 3 7B", family: "llama" },
        { name: "Mistral 7B", family: "mistral" },
        { name: "Mixtral 8x7B", family: "mixtral" },
        { name: "Qwen 2.5", family: "qwen" },
        { name: "Gemma 2B", family: "gemma" },
        { name: "Phi 3 Mini", family: "phi" },
        { name: "Yi 34B", family: "yi" },
        { name: "DeepSeek Coder", family: "deepseek" },
        { name: "QwQ 32B", family: "qwq" },
        { name: "Granite 3B", family: "granite" }
      ];

      testCases.forEach(({ name, family }) => {
        const model: LanguageModel = {
          id: "test",
          name,
          type: "language_model",
          provider: "local"
        };

        const result = normalizeModelMeta(model);
        expect(result.family).toBe(family);
      });
    });

    it("should handle model with no family match", () => {
      const model: LanguageModel = {
        type: "language_model",
        provider: "local",
        id: "unknown-model",
        name: "Unknown Model 7B"
      };

      const result = normalizeModelMeta(model);
      expect(result.family).toBeUndefined();
    });

    it("should extract MOE configuration", () => {
      const testCases = [
        { name: "Mixtral 8x7B", moe: "8x7B" },
        { name: "Model 4x2B", moe: "4x2B" },
        { name: "Test 16x3B", moe: "16x3B" },
        { name: "Model 8×7B", moe: "8x7B" } // with multiplication sign
      ];

      testCases.forEach(({ name, moe }) => {
        const model: LanguageModel = {
          id: "test",
          name,
          type: "language_model",
          provider: "local"
        };

        const result = normalizeModelMeta(model);
        expect(result.moe).toBe(moe);
      });
    });

    it("should handle model with no MOE configuration", () => {
      const model: LanguageModel = {
        type: "language_model",
        provider: "local",
        id: "llama-7b",
        name: "Llama 7B"
      };

      const result = normalizeModelMeta(model);
      expect(result.moe).toBeUndefined();
    });

    it("should use both name and id for extraction", () => {
      const model: LanguageModel = {
        id: "qwen-coder-7b",
        name: "Model Instruct",
        type: "language_model",
        provider: "local",
      };

      const result = normalizeModelMeta(model);
      expect(result.family).toBe("qwen");
      expect(result.typeTags).toContain("code");
      expect(result.typeTags).toContain("instruct");
      expect(result.sizeB).toBe(7);
    });

    it("should handle null or undefined name/id", () => {
      const model1: LanguageModel = {
        id: null as any,
        name: "Test 7B Instruct",
        type: "language_model",
        provider: "local",
      };

      const result1 = normalizeModelMeta(model1);
      expect(result1.sizeB).toBe(7);
      expect(result1.typeTags).toContain("instruct");

      const model2: LanguageModel = {
        id: "test-7b",
        name: undefined as any,
        type: "language_model",
        provider: "local",
      };

      const result2 = normalizeModelMeta(model2);
      expect(result2.sizeB).toBe(7);
    });

    it("should handle case insensitivity", () => {
      const model: LanguageModel = {
        id: "LLAMA-7B-INSTRUCT",
        name: "LLAMA MODEL 7B INSTRUCT",
        type: "language_model",
        provider: "local",
      };

      const result = normalizeModelMeta(model);
      expect(result.family).toBe("llama");
      expect(result.typeTags).toContain("instruct");
      expect(result.sizeB).toBe(7);
    });
  });

  describe("buildMetaIndex", () => {
    it("should build index for multiple models", () => {
      const models: LanguageModel[] = [
        {
          id: "llama-7b",
          name: "Llama 7B",
          type: "language_model",
          provider: "local"
        },
        {
          id: "mistral-7b-instruct",
          name: "Mistral 7B Instruct",
          type: "language_model",
          provider: "local"
        }
      ];

      const result = buildMetaIndex(models);
      
      expect(result).toHaveLength(2);
      expect(result[0].model).toBe(models[0]);
      expect(result[0].meta.family).toBe("llama");
      expect(result[0].meta.sizeB).toBe(7);
      
      expect(result[1].model).toBe(models[1]);
      expect(result[1].meta.family).toBe("mistral");
      expect(result[1].meta.typeTags).toContain("instruct");
    });

    it("should handle empty array", () => {
      const result = buildMetaIndex([]);
      expect(result).toEqual([]);
    });

    it("should preserve original model reference", () => {
      const model: LanguageModel = {
        id: "test",
        name: "Test",
        type: "language_model",
        provider: "local",
      };

      const result = buildMetaIndex([model]);
      expect(result[0].model).toBe(model);
    });
  });
});