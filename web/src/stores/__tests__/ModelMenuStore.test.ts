import {
  computeProvidersList,
  filterModelsList,
  requiredSecretForProvider,
  createModelMenuStore,
  ModelSelectorModel
} from "../ModelMenuStore";

describe("ModelMenuStore", () => {
  describe("requiredSecretForProvider", () => {
    it("returns OPENAI_API_KEY for openai provider", () => {
      expect(requiredSecretForProvider("openai")).toBe("OPENAI_API_KEY");
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
      expect(requiredSecretForProvider("HF_TOKEN")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("huggingface_hf_inference")).toBe("HF_TOKEN");
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
    });

    it("returns null for undefined input", () => {
      expect(requiredSecretForProvider(undefined)).toBeNull();
    });

    it("is case insensitive", () => {
      expect(requiredSecretForProvider("OPENAI")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("Anthropic")).toBe("ANTHROPIC_API_KEY");
    });
  });

  describe("computeProvidersList", () => {
    it("returns empty array for undefined models", () => {
      expect(computeProvidersList(undefined)).toEqual([]);
    });

    it("returns empty array for empty models", () => {
      expect(computeProvidersList([])).toEqual([]);
    });

    it("computes provider list from models", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "anthropic", id: "claude-3", name: "Claude 3" },
        { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" }
      ];

      const providers = computeProvidersList(models);

      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
      expect(providers.length).toBe(2);
    });

    it("sorts providers alphabetically", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "zebra", id: "z-1", name: "Z-Model" },
        { type: "language", provider: "alpha", id: "a-1", name: "A-Model" },
        { type: "language", provider: "middle", id: "m-1", name: "M-Model" }
      ];

      const providers = computeProvidersList(models);

      expect(providers).toEqual(["alpha", "middle", "zebra"]);
    });

    it("counts models per provider correctly", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" },
        { type: "language", provider: "anthropic", id: "claude-3", name: "Claude 3" }
      ];

      const providers = computeProvidersList(models);

      expect(providers.length).toBe(2);
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
    });

    it("handles null provider as 'Other'", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: null as any, id: "local", name: "Local Model" }
      ];

      const providers = computeProvidersList(models);

      expect(providers).toContain("openai");
      expect(providers).toContain("Other");
    });
  });

  describe("filterModelsList", () => {
    const mockModels: ModelSelectorModel[] = [
      { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
      { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5 Turbo" },
      { type: "language", provider: "anthropic", id: "claude-3-opus", name: "Claude 3 Opus" },
      { type: "language", provider: "anthropic", id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
      { type: "language", provider: "gemini", id: "gemini-pro", name: "Gemini Pro" },
      { type: "language", provider: "ollama", id: "llama2", name: "Llama 2" }
    ];

    it("returns all models when no filters applied", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result.length).toBe(mockModels.length);
    });

    it("filters by selected provider", () => {
      const result = filterModelsList(mockModels, "openai", "", undefined);
      expect(result.length).toBe(2);
      expect(result.every(m => m.provider === "openai")).toBe(true);
    });

    it("handles gemini/google provider matching", () => {
      const result = filterModelsList(mockModels, "gemini", "", undefined);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("gemini-pro");
    });

    it("filters by search term", () => {
      const result = filterModelsList(mockModels, null, "GPT", undefined);
      expect(result.length).toBe(2);
      expect(result.every(m => m.name.toLowerCase().includes("gpt"))).toBe(true);
    });

    it("filters by search term with token matching", () => {
      const result = filterModelsList(mockModels, null, "Claude 3", undefined);
      expect(result.length).toBeGreaterThan(0);
    });

    it("combines provider and search filters", () => {
      const result = filterModelsList(mockModels, "anthropic", "Opus", undefined);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("claude-3-opus");
    });

    it("filters out disabled providers", () => {
      const enabledProviders = { openai: false };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result.every(m => m.provider !== "openai")).toBe(true);
    });

    it("keeps enabled providers when no provider filter", () => {
      const enabledProviders = { anthropic: false };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result.every(m => m.provider !== "anthropic")).toBe(true);
      expect(result.some(m => m.provider === "openai")).toBe(true);
    });

    it("handles empty search term", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result.length).toBe(mockModels.length);
    });

    it("handles whitespace in search term", () => {
      const result = filterModelsList(mockModels, null, "  GPT  ", undefined);
      expect(result.length).toBe(2);
    });

    it("returns empty array when no models match", () => {
      const result = filterModelsList(mockModels, null, "nonexistent", undefined);
      expect(result.length).toBe(0);
    });

    it("sorts results alphabetically by name", () => {
      const result = filterModelsList(mockModels, "anthropic", "", undefined);
      const names = result.map(m => m.name);
      expect(names).toEqual(names.sort());
    });

    it("handles undefined models array", () => {
      const result = filterModelsList(undefined, null, "", undefined);
      expect(result).toEqual([]);
    });

    it("handles undefined enabledProviders", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result.length).toBe(mockModels.length);
    });
  });

  describe("createModelMenuStore", () => {
    beforeEach(() => {
      const store = createModelMenuStore<ModelSelectorModel>();
      store.setState(store.getInitialState());
    });

    it("creates store with correct initial state", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      const state = store.getState();

      expect(state.search).toBe("");
      expect(state.selectedProvider).toBeNull();
      expect(state.activeSidebarTab).toBe("favorites");
      expect(state.models).toEqual([]);
    });

    it("updates search value", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      
      store.getState().setSearch("GPT");

      expect(store.getState().search).toBe("GPT");
    });

    it("updates selected provider", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      
      store.getState().setSelectedProvider("openai");

      expect(store.getState().selectedProvider).toBe("openai");
    });

    it("updates active sidebar tab", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      
      store.getState().setActiveSidebarTab("recent");

      expect(store.getState().activeSidebarTab).toBe("recent");
    });

    it("sets all models", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" }
      ];

      store.getState().setAllModels(models);

      expect(store.getState().models).toEqual(models);
    });

    it("clears search", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      
      store.getState().setSearch("test");
      store.getState().setSearch("");

      expect(store.getState().search).toBe("");
    });

    it("clears selected provider", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      
      store.getState().setSelectedProvider("openai");
      store.getState().setSelectedProvider(null);

      expect(store.getState().selectedProvider).toBeNull();
    });
  });
});
