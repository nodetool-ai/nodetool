import {
  requiredSecretForProvider,
  computeProvidersList,
  filterModelsList,
  createModelMenuStore,
  SidebarTab,
  ModelSelectorModel
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
      expect(requiredSecretForProvider("hf_ollama")).toBe("HF_TOKEN");
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
  });

  describe("computeProvidersList", () => {
    it("returns empty array for undefined models", () => {
      expect(computeProvidersList(undefined)).toEqual([]);
    });

    it("returns empty array for empty models", () => {
      expect(computeProvidersList([])).toEqual([]);
    });

    it("extracts unique providers from models", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
        { type: "language", provider: "anthropic", id: "claude-3", name: "Claude 3" },
        { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" }
      ];
      const providers = computeProvidersList(models);
      expect(providers).toHaveLength(2);
      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
    });

    it("sorts providers alphabetically", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "zProvider", id: "m1", name: "M1" },
        { type: "language", provider: "aProvider", id: "m2", name: "M2" },
        { type: "language", provider: "mProvider", id: "m3", name: "M3" }
      ];
      const providers = computeProvidersList(models);
      expect(providers).toEqual(["aProvider", "mProvider", "zProvider"]);
    });

    it("handles models with null/undefined provider", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "m1", name: "M1" },
        { type: "language", provider: null as any, id: "m2", name: "M2" },
        { type: "language", provider: undefined as any, id: "m3", name: "M3" }
      ];
      const providers = computeProvidersList(models);
      expect(providers).toContain("openai");
      expect(providers).toContain("Other");
    });

    it("counts models per provider", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "m1", name: "M1" },
        { type: "language", provider: "openai", id: "m2", name: "M2" },
        { type: "language", provider: "anthropic", id: "m3", name: "M3" }
      ];
      const providers = computeProvidersList(models);
      expect(providers).toHaveLength(2);
    });
  });

  describe("filterModelsList", () => {
    const mockModels: ModelSelectorModel[] = [
      { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" },
      { type: "language", provider: "openai", id: "gpt-3.5", name: "GPT-3.5" },
      { type: "language", provider: "anthropic", id: "claude-3", name: "Claude 3 Opus" },
      { type: "language", provider: "anthropic", id: "claude-2", name: "Claude 2" },
      { type: "language", provider: "gemini", id: "gemini-pro", name: "Gemini Pro" }
    ];

    it("returns all models when no filters applied", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result).toHaveLength(5);
    });

    it("filters by selected provider", () => {
      const result = filterModelsList(mockModels, "openai", "", undefined);
      expect(result).toHaveLength(2);
      expect(result.every(m => m.provider === "openai")).toBe(true);
    });

    it("handles gemini/google provider filtering case-insensitively", () => {
      const result = filterModelsList(mockModels, "google", "", undefined);
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("gemini");
    });

    it("filters by search term", () => {
      const result = filterModelsList(mockModels, null, "gpt", undefined);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(m => 
        m.name.toLowerCase().includes("gpt") || 
        m.id.toLowerCase().includes("gpt")
      )).toBe(true);
    });

    it("filters by search term and provider together", () => {
      const result = filterModelsList(mockModels, "anthropic", "claude", undefined);
      expect(result).toHaveLength(2);
      expect(result.every(m => m.provider === "anthropic")).toBe(true);
    });

    it("filters out disabled providers when no provider selected", () => {
      const enabledProviders = { openai: false };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result.every(m => m.provider !== "openai")).toBe(true);
    });

    it("keeps all providers enabled by default", () => {
      const result = filterModelsList(mockModels, null, "", {});
      expect(result).toHaveLength(5);
    });

    it("sorts results alphabetically by name", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      const names = result.map(m => m.name);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sortedNames);
    });

    it("uses id as fallback for sorting when name is missing", () => {
      const modelsWithNoName: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "zzz-model", name: null as any },
        { type: "language", provider: "openai", id: "aaa-model", name: null as any }
      ];
      const result = filterModelsList(modelsWithNoName, null, "", undefined);
      expect(result[0].id).toBe("aaa-model");
      expect(result[1].id).toBe("zzz-model");
    });

    it("handles empty search term", () => {
      const result = filterModelsList(mockModels, null, "   ", undefined);
      expect(result).toHaveLength(5);
    });

    it("returns empty array when no models match filters", () => {
      const result = filterModelsList(mockModels, "unknown", "test", undefined);
      expect(result).toHaveLength(0);
    });
  });

  describe("createModelMenuStore", () => {
    let store: ReturnType<typeof createModelMenuStore>;

    beforeEach(() => {
      store = createModelMenuStore();
    });

    it("has correct initial state", () => {
      const state = store.getState();
      expect(state.search).toBe("");
      expect(state.selectedProvider).toBeNull();
      expect(state.activeSidebarTab).toBe("favorites");
      expect(state.models).toEqual([]);
    });

    describe("setSearch", () => {
      it("updates search value", () => {
        store.getState().setSearch("gpt");
        expect(store.getState().search).toBe("gpt");
      });

      it("allows empty string", () => {
        store.getState().setSearch("");
        expect(store.getState().search).toBe("");
      });
    });

    describe("setSelectedProvider", () => {
      it("updates selected provider", () => {
        store.getState().setSelectedProvider("openai");
        expect(store.getState().selectedProvider).toBe("openai");
      });

      it("allows null to clear selection", () => {
        store.getState().setSelectedProvider("openai");
        store.getState().setSelectedProvider(null);
        expect(store.getState().selectedProvider).toBeNull();
      });
    });

    describe("setActiveSidebarTab", () => {
      it("updates active sidebar tab", () => {
        store.getState().setActiveSidebarTab("recent");
        expect(store.getState().activeSidebarTab).toBe("recent");
      });

      it("allows switching back to favorites", () => {
        store.getState().setActiveSidebarTab("recent");
        store.getState().setActiveSidebarTab("favorites");
        expect(store.getState().activeSidebarTab).toBe("favorites");
      });
    });

    describe("setAllModels", () => {
      it("replaces all models", () => {
        const models: ModelSelectorModel[] = [
          { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" }
        ];
        store.getState().setAllModels(models);
        expect(store.getState().models).toEqual(models);
      });

      it("allows empty array", () => {
        store.getState().setAllModels([]);
        expect(store.getState().models).toEqual([]);
      });
    });

    it("supports multiple state updates", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" }
      ];

      store.getState().setSearch("gpt");
      store.getState().setSelectedProvider("openai");
      store.getState().setActiveSidebarTab("recent");
      store.getState().setAllModels(models);

      const state = store.getState();
      expect(state.search).toBe("gpt");
      expect(state.selectedProvider).toBe("openai");
      expect(state.activeSidebarTab).toBe("recent");
      expect(state.models).toHaveLength(1);
    });
  });
});
