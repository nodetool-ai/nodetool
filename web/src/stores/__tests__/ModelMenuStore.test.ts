import {
  requiredSecretForProvider,
  computeProvidersList,
  filterModelsList,
  ALL_PROVIDERS,
  type ModelSelectorModel
} from "../ModelMenuStore";

describe("ModelMenuStore utilities", () => {
  describe("requiredSecretForProvider", () => {
    it("returns OPENAI_API_KEY for openai provider", () => {
      expect(requiredSecretForProvider("openai")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OPENAI")).toBe("OPENAI_API_KEY");
    });

    it("returns ANTHROPIC_API_KEY for anthropic provider", () => {
      expect(requiredSecretForProvider("anthropic")).toBe("ANTHROPIC_API_KEY");
      expect(requiredSecretForProvider("Anthropic")).toBe("ANTHROPIC_API_KEY");
    });

    it("returns GEMINI_API_KEY for google/gemini providers", () => {
      expect(requiredSecretForProvider("gemini")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("google")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("Google")).toBe("GEMINI_API_KEY");
    });

    it("returns HF_TOKEN for huggingface providers", () => {
      expect(requiredSecretForProvider("huggingface")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("hf_inference")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("HF_TOKEN")).toBe("HF_TOKEN");
    });

    it("returns REPLICATE_API_TOKEN for replicate provider", () => {
      expect(requiredSecretForProvider("replicate")).toBe("REPLICATE_API_TOKEN");
    });

    it("returns FAL_API_KEY for fal provider", () => {
      expect(requiredSecretForProvider("fal")).toBe("FAL_API_KEY");
    });

    it("returns AIME_API_KEY for aime provider", () => {
      expect(requiredSecretForProvider("aime")).toBe("AIME_API_KEY");
    });

    it("returns null for unknown providers", () => {
      expect(requiredSecretForProvider("unknown")).toBeNull();
      expect(requiredSecretForProvider("custom")).toBeNull();
      expect(requiredSecretForProvider("")).toBeNull();
      expect(requiredSecretForProvider(undefined)).toBeNull();
    });

    it("handles case-insensitive matching", () => {
      expect(requiredSecretForProvider("OPENAI")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("Anthropic")).toBe("ANTHROPIC_API_KEY");
    });
  });

  describe("computeProvidersList", () => {
    it("returns empty array for undefined models", () => {
      expect(computeProvidersList(undefined)).toEqual([]);
    });

    it("returns empty array for empty models array", () => {
      expect(computeProvidersList([])).toEqual([]);
    });

    it("extracts unique providers from models", () => {
      const models = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "anthropic", id: "claude-3", name: "Claude 3" },
        { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" }
      ] as ModelSelectorModel[];

      const providers = computeProvidersList(models);
      expect(providers).toHaveLength(2);
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
    });

    it("sorts providers alphabetically", () => {
      const models = [
        { type: "language", provider: "z-provider", id: "z", name: "Z" },
        { type: "language", provider: "a-provider", id: "a", name: "A" },
        { type: "language", provider: "m-provider", id: "m", name: "M" }
      ] as ModelSelectorModel[];

      const providers = computeProvidersList(models);
      expect(providers).toEqual(["a-provider", "m-provider", "z-provider"]);
    });

    it("uses 'Other' for models without provider", () => {
      const models = [
        { type: "language", provider: "", id: "model-1", name: "Model 1" }
      ] as unknown as ModelSelectorModel[];

      const providers = computeProvidersList(models);
      expect(providers).toContain("Other");
    });

    it("counts models per provider correctly", () => {
      const models = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" },
        { type: "language", provider: "anthropic", id: "claude", name: "Claude" }
      ] as ModelSelectorModel[];

      const providers = computeProvidersList(models);
      expect(providers).toHaveLength(2);
    });
  });

  describe("filterModelsList", () => {
    const mockModels = [
      { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
      { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5 Turbo" },
      { type: "language", provider: "anthropic", id: "claude-3-opus", name: "Claude 3 Opus" },
      { type: "language", provider: "anthropic", id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
      { type: "language", provider: "gemini", id: "gemini-pro", name: "Gemini Pro" },
      { type: "image", provider: "stability", id: "sd-xl", name: "Stable Diffusion XL" }
    ] as ModelSelectorModel[];

    it("returns all models when no filters applied", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result).toHaveLength(6);
    });

    it("filters by selected provider", () => {
      const result = filterModelsList(mockModels, "openai", "", undefined);
      expect(result).toHaveLength(2);
      expect(result.every(m => m.provider === "openai")).toBe(true);
    });

    it("handles gemini/google provider matching", () => {
      const models = [
        { type: "language", provider: "gemini-pro", id: "gemini-1", name: "Gemini Pro" },
        { type: "language", provider: "google-ai", id: "gemini-2", name: "Google AI" }
      ] as ModelSelectorModel[];

      const result = filterModelsList(models, "gemini", "", undefined);
      expect(result).toHaveLength(2);
    });

    it("filters by search term", () => {
      const result = filterModelsList(mockModels, null, "GPT", undefined);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(m => m.name.toLowerCase().includes("gpt"))).toBe(true);
    });

    it("filters by search term with token matching", () => {
      const result = filterModelsList(mockModels, null, "Claude 3", undefined);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(m => m.name.includes("Claude"))).toBe(true);
    });

    it("filters by enabled providers", () => {
      const enabledProviders = { openai: true, anthropic: true };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result).toHaveLength(6);
    });

    it("excludes disabled providers when no provider selected", () => {
      const enabledProviders = { openai: false, anthropic: true };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result.every(m => m.provider !== "openai")).toBe(true);
      expect(result.some(m => m.provider === "anthropic")).toBe(true);
    });

    it("includes all providers when filtering by specific provider", () => {
      const enabledProviders = { openai: false };
      const result = filterModelsList(mockModels, "anthropic", "", enabledProviders);
      expect(result.every(m => m.provider === "anthropic")).toBe(true);
    });

    it("sorts results alphabetically by name", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      for (let i = 1; i < result.length; i++) {
        const nameA = result[i - 1].path || result[i - 1].name || result[i - 1].id;
        const nameB = result[i].path || result[i].name || result[i].id;
        expect(nameA.toLowerCase() <= nameB.toLowerCase()).toBe(true);
      }
    });

    it("handles empty search term", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result).toHaveLength(6);
    });

    it("handles whitespace in search term", () => {
      const result = filterModelsList(mockModels, null, "  GPT  ", undefined);
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns empty array when no models match filters", () => {
      const result = filterModelsList(mockModels, "nonexistent", "nonexistent", undefined);
      expect(result).toHaveLength(0);
    });

    it("uses id as fallback for sorting when name is missing", () => {
      const models = [
        { type: "language", provider: "openai", id: "zzz-model", name: "" },
        { type: "language", provider: "openai", id: "aaa-model", name: "" }
      ] as ModelSelectorModel[];

      const result = filterModelsList(models, null, "", undefined);
      expect(result[0].id).toBe("aaa-model");
      expect(result[1].id).toBe("zzz-model");
    });

    it("uses path for sorting when available", () => {
      const models = [
        { type: "language", provider: "openai", id: "model-1", name: "Model", path: "/z-path" },
        { type: "language", provider: "openai", id: "model-2", name: "Model", path: "/a-path" }
      ] as ModelSelectorModel[];

      const result = filterModelsList(models, null, "", undefined);
      expect(result[0].path).toBe("/a-path");
      expect(result[1].path).toBe("/z-path");
    });
  });

  describe("ALL_PROVIDERS constant", () => {
    it("contains major providers", () => {
      expect(ALL_PROVIDERS).toContain("openai");
      expect(ALL_PROVIDERS).toContain("anthropic");
      expect(ALL_PROVIDERS).toContain("gemini");
      expect(ALL_PROVIDERS).toContain("ollama");
    });

    it("contains huggingface variants", () => {
      expect(ALL_PROVIDERS).toContain("huggingface");
      expect(ALL_PROVIDERS).toContain("huggingface_replicate");
    });
  });
});
