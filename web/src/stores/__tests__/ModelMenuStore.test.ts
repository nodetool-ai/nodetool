import {
  createModelMenuStore,
  computeProvidersList,
  filterModelsList,
  requiredSecretForProvider,
  ModelSelectorModel,
  EnabledProvidersMap
} from "../ModelMenuStore";

describe("ModelMenuStore", () => {
  describe("requiredSecretForProvider", () => {
    it("returns OPENAI_API_KEY for OpenAI provider", () => {
      expect(requiredSecretForProvider("openai")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
    });

    it("returns ANTHROPIC_API_KEY for Anthropic provider", () => {
      expect(requiredSecretForProvider("anthropic")).toBe("ANTHROPIC_API_KEY");
      expect(requiredSecretForProvider("Anthropic")).toBe("ANTHROPIC_API_KEY");
    });

    it("returns GEMINI_API_KEY for Gemini/Google provider", () => {
      expect(requiredSecretForProvider("gemini")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("google")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("Gemini")).toBe("GEMINI_API_KEY");
    });

    it("returns HF_TOKEN for HuggingFace provider", () => {
      expect(requiredSecretForProvider("huggingface")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("hf_")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("HuggingFace")).toBe("HF_TOKEN");
    });

    it("returns REPLICATE_API_TOKEN for Replicate provider", () => {
      expect(requiredSecretForProvider("replicate")).toBe("REPLICATE_API_TOKEN");
    });

    it("returns FAL_API_KEY for FAL provider", () => {
      expect(requiredSecretForProvider("fal")).toBe("FAL_API_KEY");
    });

    it("returns AIME_API_KEY for AIME provider", () => {
      expect(requiredSecretForProvider("aime")).toBe("AIME_API_KEY");
    });

    it("returns null for providers without required secrets", () => {
      expect(requiredSecretForProvider("ollama")).toBeNull();
      expect(requiredSecretForProvider("local")).toBeNull();
      expect(requiredSecretForProvider("unknown")).toBeNull();
    });

    it("returns null for undefined provider", () => {
      expect(requiredSecretForProvider(undefined)).toBeNull();
    });

    it("returns null for empty string provider", () => {
      expect(requiredSecretForProvider("")).toBeNull();
    });
  });

  describe("computeProvidersList", () => {
    const createModel = (
      provider: string,
      id = "model-1"
    ): ModelSelectorModel => ({
      type: "language",
      provider,
      id,
      name: `Model ${id}`
    });

    it("returns empty array for undefined models", () => {
      expect(computeProvidersList(undefined)).toEqual([]);
    });

    it("returns empty array for empty models list", () => {
      expect(computeProvidersList([])).toEqual([]);
    });

    it("returns unique providers from models", () => {
      const models = [
        createModel("openai", "m1"),
        createModel("openai", "m2"),
        createModel("anthropic", "m3")
      ];

      const providers = computeProvidersList(models);

      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
      expect(providers).toHaveLength(2);
    });

    it("sorts providers alphabetically", () => {
      const models = [
        createModel("zeta", "m1"),
        createModel("alpha", "m2"),
        createModel("beta", "m3")
      ];

      const providers = computeProvidersList(models);

      expect(providers).toEqual(["alpha", "beta", "zeta"]);
    });

    it("handles models without provider by using 'Other'", () => {
      const models: ModelSelectorModel[] = [
        { type: "language", provider: "", id: "m1", name: "Model 1" }
      ];

      const providers = computeProvidersList(models);

      expect(providers).toContain("Other");
    });
  });

  describe("filterModelsList", () => {
    const createModel = (
      provider: string,
      id: string,
      name: string
    ): ModelSelectorModel => ({
      type: "language",
      provider,
      id,
      name
    });

    const models = [
      createModel("openai", "gpt-4", "GPT-4"),
      createModel("openai", "gpt-3.5", "GPT-3.5 Turbo"),
      createModel("anthropic", "claude-3", "Claude 3"),
      createModel("gemini", "gemini-pro", "Gemini Pro"),
      createModel("google", "palm", "PaLM")
    ];

    describe("provider filtering", () => {
      it("returns all models when no provider is selected", () => {
        const result = filterModelsList(models, null, "", undefined);
        expect(result).toHaveLength(5);
      });

      it("filters by exact provider match", () => {
        const result = filterModelsList(models, "openai", "", undefined);
        expect(result).toHaveLength(2);
        expect(result.every((m) => m.provider === "openai")).toBe(true);
      });

      it("filters Gemini and Google providers together", () => {
        const result = filterModelsList(models, "gemini", "", undefined);
        expect(result).toHaveLength(2);
        expect(
          result.every((m) => /gemini|google/i.test(m.provider))
        ).toBe(true);
      });

      it("filters by enabled providers when no provider is selected", () => {
        const enabledProviders: EnabledProvidersMap = {
          openai: true,
          anthropic: false,
          gemini: true,
          google: true
        };

        const result = filterModelsList(models, null, "", enabledProviders);
        expect(result.every((m) => m.provider !== "anthropic")).toBe(true);
      });

      it("treats missing enabled providers as enabled", () => {
        const enabledProviders: EnabledProvidersMap = {
          openai: false
        };

        const result = filterModelsList(models, null, "", enabledProviders);
        // openai should be filtered out, others should remain
        expect(result.every((m) => m.provider !== "openai")).toBe(true);
        expect(result.some((m) => m.provider === "anthropic")).toBe(true);
      });
    });

    describe("search filtering", () => {
      it("filters by search term matching name", () => {
        const result = filterModelsList(models, null, "Claude", undefined);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.some((m) => m.name === "Claude 3")).toBe(true);
      });

      it("filters by search term matching id", () => {
        const result = filterModelsList(models, null, "gpt-4", undefined);
        expect(result.some((m) => m.id === "gpt-4")).toBe(true);
      });

      it("filters by search term matching provider", () => {
        const result = filterModelsList(models, null, "openai", undefined);
        expect(result.every((m) => m.provider === "openai")).toBe(true);
      });

      it("performs case-insensitive search", () => {
        const result = filterModelsList(models, null, "CLAUDE", undefined);
        expect(result.some((m) => m.name === "Claude 3")).toBe(true);
      });

      it("handles multiple search tokens", () => {
        const result = filterModelsList(models, null, "gpt turbo", undefined);
        expect(result.some((m) => m.name === "GPT-3.5 Turbo")).toBe(true);
      });

      it("returns empty for non-matching search", () => {
        const result = filterModelsList(models, null, "nonexistent", undefined);
        expect(result).toHaveLength(0);
      });
    });

    describe("sorting", () => {
      it("sorts alphabetically by name when not searching", () => {
        const result = filterModelsList(models, null, "", undefined);
        const names = result.map((m) => m.name);

        // Check that names are sorted
        const sortedNames = [...names].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
        expect(names).toEqual(sortedNames);
      });
    });

    describe("edge cases", () => {
      it("handles undefined models", () => {
        const result = filterModelsList(undefined, null, "", undefined);
        expect(result).toEqual([]);
      });

      it("handles empty models array", () => {
        const result = filterModelsList([], null, "", undefined);
        expect(result).toEqual([]);
      });

      it("handles empty search string", () => {
        const result = filterModelsList(models, null, "", undefined);
        expect(result).toHaveLength(5);
      });

      it("handles whitespace-only search", () => {
        const result = filterModelsList(models, null, "   ", undefined);
        expect(result).toHaveLength(5);
      });
    });
  });

  describe("createModelMenuStore", () => {
    it("creates a store with correct initial state", () => {
      const store = createModelMenuStore<ModelSelectorModel>();
      const state = store.getState();

      expect(state.search).toBe("");
      expect(state.selectedProvider).toBeNull();
      expect(state.activeSidebarTab).toBe("favorites");
      expect(state.models).toEqual([]);
    });

    describe("setSearch", () => {
      it("updates search value", () => {
        const store = createModelMenuStore<ModelSelectorModel>();

        store.getState().setSearch("test query");

        expect(store.getState().search).toBe("test query");
      });

      it("allows clearing search", () => {
        const store = createModelMenuStore<ModelSelectorModel>();
        store.getState().setSearch("test");

        store.getState().setSearch("");

        expect(store.getState().search).toBe("");
      });
    });

    describe("setSelectedProvider", () => {
      it("updates selected provider", () => {
        const store = createModelMenuStore<ModelSelectorModel>();

        store.getState().setSelectedProvider("openai");

        expect(store.getState().selectedProvider).toBe("openai");
      });

      it("allows clearing selected provider", () => {
        const store = createModelMenuStore<ModelSelectorModel>();
        store.getState().setSelectedProvider("openai");

        store.getState().setSelectedProvider(null);

        expect(store.getState().selectedProvider).toBeNull();
      });
    });

    describe("setActiveSidebarTab", () => {
      it("updates active sidebar tab", () => {
        const store = createModelMenuStore<ModelSelectorModel>();

        store.getState().setActiveSidebarTab("recent");

        expect(store.getState().activeSidebarTab).toBe("recent");
      });

      it("can switch back to favorites", () => {
        const store = createModelMenuStore<ModelSelectorModel>();
        store.getState().setActiveSidebarTab("recent");

        store.getState().setActiveSidebarTab("favorites");

        expect(store.getState().activeSidebarTab).toBe("favorites");
      });
    });

    describe("setAllModels", () => {
      it("updates models array", () => {
        const store = createModelMenuStore<ModelSelectorModel>();
        const models: ModelSelectorModel[] = [
          { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" }
        ];

        store.getState().setAllModels(models);

        expect(store.getState().models).toEqual(models);
      });

      it("can clear models", () => {
        const store = createModelMenuStore<ModelSelectorModel>();
        store.getState().setAllModels([
          { type: "language", provider: "openai", id: "gpt-4", name: "GPT-4" }
        ]);

        store.getState().setAllModels([]);

        expect(store.getState().models).toEqual([]);
      });
    });

    describe("subscription", () => {
      it("notifies subscribers on state change", () => {
        const store = createModelMenuStore<ModelSelectorModel>();
        const listener = jest.fn();

        const unsubscribe = store.subscribe(listener);
        store.getState().setSearch("test");

        expect(listener).toHaveBeenCalled();

        unsubscribe();
      });
    });
  });
});
