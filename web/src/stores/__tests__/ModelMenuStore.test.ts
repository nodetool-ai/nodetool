import {
  requiredSecretForProvider,
  computeProvidersList,
  filterModelsList,
  ALL_PROVIDERS,
  IMAGE_PROVIDERS,
  TTS_PROVIDERS,
  ASR_PROVIDERS,
  VIDEO_PROVIDERS,
  createModelMenuStore,
  createModelMenuSelector,
  type ModelSelectorModel
} from "../ModelMenuStore";

describe("ModelMenuStore Utilities", () => {
  describe("requiredSecretForProvider", () => {
    it("should return OPENAI_API_KEY for openai provider", () => {
      expect(requiredSecretForProvider("openai")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("openai-gpt-4")).toBe("OPENAI_API_KEY");
    });

    it("should return ANTHROPIC_API_KEY for anthropic provider", () => {
      expect(requiredSecretForProvider("anthropic")).toBe("ANTHROPIC_API_KEY");
    });

    it("should return GEMINI_API_KEY for google/gemini providers", () => {
      expect(requiredSecretForProvider("gemini")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("google")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("google-gemini-pro")).toBe("GEMINI_API_KEY");
    });

    it("should return HF_TOKEN for huggingface providers", () => {
      expect(requiredSecretForProvider("huggingface")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("hf_inference")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("huggingface_hf_inference")).toBe("HF_TOKEN");
    });

    it("should return REPLICATE_API_TOKEN for replicate provider", () => {
      expect(requiredSecretForProvider("replicate")).toBe("REPLICATE_API_TOKEN");
    });

    it("should return FAL_API_KEY for fal provider", () => {
      expect(requiredSecretForProvider("fal")).toBe("FAL_API_KEY");
      expect(requiredSecretForProvider("fal_ai")).toBe("FAL_API_KEY");
    });

    it("should return AIME_API_KEY for aime provider", () => {
      expect(requiredSecretForProvider("aime")).toBe("AIME_API_KEY");
    });

    it("should return null for unknown providers", () => {
      expect(requiredSecretForProvider("unknown")).toBeNull();
      expect(requiredSecretForProvider("")).toBeNull();
      expect(requiredSecretForProvider("ollama")).toBeNull();
      expect(requiredSecretForProvider("llama_cpp")).toBeNull();
      expect(requiredSecretForProvider("mlx")).toBeNull();
    });

    it("should be case insensitive", () => {
      expect(requiredSecretForProvider("OPENAI")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
    });
  });

  describe("computeProvidersList", () => {
    it("should return empty array for undefined models", () => {
      expect(computeProvidersList(undefined)).toEqual([]);
    });

    it("should return empty array for empty models array", () => {
      expect(computeProvidersList([])).toEqual([]);
    });

    it("should compute providers from models list", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "anthropic", id: "claude-3", name: "Claude 3" },
        { type: "image", provider: "openai", id: "dalle-3", name: "DALL-E 3" },
      ];
      
      const providers = computeProvidersList(models);
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
      expect(providers.length).toBe(2);
    });

    it("should count models per provider", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" },
        { type: "language", provider: "anthropic", id: "claude", name: "Claude" },
      ];
      
      const providers = computeProvidersList(models);
      expect(providers).toEqual(["anthropic", "openai"]);
    });

    it("should use 'Other' as provider for models without provider", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "other", id: "local", name: "Local" },
        { type: "language", provider: "other", id: "custom", name: "Custom" },
      ];
      
      const providers = computeProvidersList(models);
      expect(providers).toContain("other");
    });
  });

  describe("filterModelsList", () => {
    const mockModels: ModelSelectorModel[] = [
      { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
      { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5 Turbo" },
      { type: "language", provider: "anthropic", id: "claude-3-opus", name: "Claude 3 Opus" },
      { type: "language", provider: "anthropic", id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
      { type: "image", provider: "openai", id: "dalle-3", name: "DALL-E 3" },
      { type: "language", provider: "ollama", id: "llama2", name: "Llama 2" },
    ];

    it("should return all models when no filters applied", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result.length).toBe(mockModels.length);
    });

    it("should filter by selected provider", () => {
      const result = filterModelsList(mockModels, "openai", "", undefined);
      expect(result.length).toBe(3);
      expect(result.every((m) => m.provider === "openai")).toBe(true);
    });

    it("should handle gemini/google provider filtering case-insensitively", () => {
      const geminiModels: ModelSelectorModel[] = [
        { type: "language", provider: "gemini-pro", id: "gemini-1", name: "Gemini Pro" },
        { type: "language", provider: "google-gemini", id: "gemini-2", name: "Google Gemini" },
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
      ];
      
      const result1 = filterModelsList(geminiModels, "gemini", "", undefined);
      const result2 = filterModelsList(geminiModels, "google", "", undefined);
      
      expect(result1.length).toBe(2);
      expect(result2.length).toBe(2);
    });

    it("should filter by search term", () => {
      const result = filterModelsList(mockModels, null, "GPT", {});
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((m) => m.name.includes("GPT") || m.id.includes("GPT"))).toBe(true);
    });

    it("should filter by enabled providers", () => {
      const enabledProviders: Record<string, boolean> = {
        openai: true,
        anthropic: false,
      };
      
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result.some((m) => m.provider === "anthropic")).toBe(false);
      expect(result.some((m) => m.provider === "openai")).toBe(true);
      expect(result.some((m) => m.provider === "ollama")).toBe(true);
      expect(result.length).toBe(4);
    });

    it("should include all providers when selectedProvider is null and no enabled filter", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result.length).toBe(mockModels.length);
    });

    it("should sort alphabetically by name when not searching", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      const names = result.map((m) => m.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });

    it("should handle empty search term", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result.length).toBe(mockModels.length);
    });

    it("should handle models with various providers", () => {
      const modelsWithVarious: ModelSelectorModel[] = [
        { type: "language", provider: "local", id: "local-1", name: "Local 1" },
        { type: "language", provider: "custom", id: "local-2", name: "Local 2" },
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
      ];
      
      const result = filterModelsList(modelsWithVarious, null, "", undefined);
      expect(result.length).toBe(3);
    });
  });

  describe("Provider constants", () => {
    it("should have ALL_PROVIDERS defined", () => {
      expect(ALL_PROVIDERS).toContain("openai");
      expect(ALL_PROVIDERS).toContain("anthropic");
      expect(ALL_PROVIDERS).toContain("gemini");
      expect(ALL_PROVIDERS).toContain("ollama");
    });

    it("should have IMAGE_PROVIDERS same as ALL_PROVIDERS", () => {
      expect(IMAGE_PROVIDERS).toEqual(ALL_PROVIDERS);
    });

    it("should have TTS_PROVIDERS same as ALL_PROVIDERS", () => {
      expect(TTS_PROVIDERS).toEqual(ALL_PROVIDERS);
    });

    it("should have ASR_PROVIDERS same as ALL_PROVIDERS", () => {
      expect(ASR_PROVIDERS).toEqual(ALL_PROVIDERS);
    });

    it("should have VIDEO_PROVIDERS same as ALL_PROVIDERS", () => {
      expect(VIDEO_PROVIDERS).toEqual(ALL_PROVIDERS);
    });
  });
});

describe("createModelMenuStore", () => {
  it("should create a store with default values", () => {
    const store = createModelMenuStore<ModelSelectorModel>();
    
    const state = store.getState();
    expect(state.search).toBe("");
    expect(state.selectedProvider).toBeNull();
    expect(state.activeSidebarTab).toBe("favorites");
    expect(state.models).toEqual([]);
  });

  it("should update search value", () => {
    const store = createModelMenuStore<ModelSelectorModel>();
    
    store.getState().setSearch("test");
    expect(store.getState().search).toBe("test");
  });

  it("should update selectedProvider value", () => {
    const store = createModelMenuStore<ModelSelectorModel>();
    
    store.getState().setSelectedProvider("openai");
    expect(store.getState().selectedProvider).toBe("openai");
    
    store.getState().setSelectedProvider(null);
    expect(store.getState().selectedProvider).toBeNull();
  });

  it("should update activeSidebarTab value", () => {
    const store = createModelMenuStore<ModelSelectorModel>();
    
    store.getState().setActiveSidebarTab("recent");
    expect(store.getState().activeSidebarTab).toBe("recent");
  });

  it("should update models array", () => {
    const store = createModelMenuStore<ModelSelectorModel>();
    const models: ModelSelectorModel[] = [
      { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
    ];
    
    store.getState().setAllModels(models);
    expect(store.getState().models).toEqual(models);
  });

  it("should replace models array completely", () => {
    const store = createModelMenuStore<ModelSelectorModel>();
    
    store.getState().setAllModels([
      { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
    ]);
    
    store.getState().setAllModels([
      { type: "language", provider: "anthropic", id: "claude", name: "Claude" },
    ]);
    
    expect(store.getState().models.length).toBe(1);
    expect(store.getState().models[0].id).toBe("claude");
  });
});

describe("createModelMenuSelector", () => {
  it("should create store and selectors", () => {
    const selector = createModelMenuSelector<ModelSelectorModel>();
    
    expect(selector.useStore).toBeDefined();
    expect(selector.useData).toBeDefined();
  });

  it("should return independent stores for different model types", () => {
    const selector1 = createModelMenuSelector<LanguageModelMock>();
    const selector2 = createModelMenuSelector<ImageModelMock>();
    
    selector1.useStore.getState().setSearch("test1");
    selector2.useStore.getState().setSearch("test2");
    
    expect(selector1.useStore.getState().search).toBe("test1");
    expect(selector2.useStore.getState().search).toBe("test2");
  });
});

interface LanguageModelMock {
  type: "language";
  provider: string;
  id: string;
  name: string;
}

interface ImageModelMock {
  type: "image";
  provider: string;
  id: string;
  name: string;
}

interface ImageModelMock {
  type: "image";
  provider: string;
  id: string;
  name: string;
}
