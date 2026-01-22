import {
  requiredSecretForProvider,
  computeProvidersList,
  filterModelsList,
  createModelMenuStore,
  SidebarTab
} from "../ModelMenuStore";

describe("requiredSecretForProvider", () => {
  it("returns OPENAI_API_KEY for openai", () => {
    expect(requiredSecretForProvider("openai")).toBe("OPENAI_API_KEY");
    expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
    expect(requiredSecretForProvider("OPENAI")).toBe("OPENAI_API_KEY");
  });

  it("returns ANTHROPIC_API_KEY for anthropic", () => {
    expect(requiredSecretForProvider("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(requiredSecretForProvider("Anthropic")).toBe("ANTHROPIC_API_KEY");
  });

  it("returns GEMINI_API_KEY for google/gemini providers", () => {
    expect(requiredSecretForProvider("gemini")).toBe("GEMINI_API_KEY");
    expect(requiredSecretForProvider("google")).toBe("GEMINI_API_KEY");
    expect(requiredSecretForProvider("Google")).toBe("GEMINI_API_KEY");
    expect(requiredSecretForProvider("gemini-pro")).toBe("GEMINI_API_KEY");
  });

  it("returns HF_TOKEN for huggingface variants", () => {
    expect(requiredSecretForProvider("huggingface")).toBe("HF_TOKEN");
    expect(requiredSecretForProvider("hf_")).toBe("HF_TOKEN");
    expect(requiredSecretForProvider("hf_inference")).toBe("HF_TOKEN");
  });

  it("returns REPLICATE_API_TOKEN for replicate", () => {
    expect(requiredSecretForProvider("replicate")).toBe("REPLICATE_API_TOKEN");
  });

  it("returns FAL_API_KEY for fal", () => {
    expect(requiredSecretForProvider("fal")).toBe("FAL_API_KEY");
    expect(requiredSecretForProvider("fal_ai")).toBe("FAL_API_KEY");
  });

  it("returns AIME_API_KEY for aime", () => {
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
    const result = computeProvidersList(undefined);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty models array", () => {
    const result = computeProvidersList([]);
    expect(result).toEqual([]);
  });

  it("computes provider counts from models", () => {
    const models = [
      { id: "1", provider: "openai", name: "GPT-4" } as any,
      { id: "2", provider: "anthropic", name: "Claude" } as any,
      { id: "3", provider: "openai", name: "GPT-3.5" } as any
    ];
    const result = computeProvidersList(models);
    expect(result).toEqual(["anthropic", "openai"]);
  });

  it("sorts providers alphabetically", () => {
    const models = [
      { id: "1", provider: "z-provider", name: "Z" } as any,
      { id: "2", provider: "a-provider", name: "A" } as any,
      { id: "3", provider: "m-provider", name: "M" } as any
    ];
    const result = computeProvidersList(models);
    expect(result).toEqual(["a-provider", "m-provider", "z-provider"]);
  });

  it("uses 'Other' for models without provider", () => {
    const models = [
      { id: "1", provider: undefined, name: "Unknown" } as any,
      { id: "2", provider: null as any, name: "Also Unknown" } as any
    ];
    const result = computeProvidersList(models);
    expect(result).toContain("Other");
  });

  it("filters out providers with zero count", () => {
    const models = [
      { id: "1", provider: "openai", name: "GPT" } as any
    ];
    const result = computeProvidersList(models);
    expect(result).not.toContain("anthropic");
  });
});

describe("filterModelsList", () => {
  const createModel = (id: string, provider: string, name: string): any => ({
    id,
    provider,
    name,
    type: "language_model"
  });

  const mockModels = [
    createModel("1", "openai", "GPT-4"),
    createModel("2", "openai", "GPT-3.5"),
    createModel("3", "anthropic", "Claude-3"),
    createModel("4", "anthropic", "Claude-2"),
    createModel("5", "google", "Gemini-Pro")
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

  it("handles gemini/google provider matching", () => {
    const result = filterModelsList(mockModels, "google", "", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("google");
  });

  it("filters by search term", () => {
    const result = filterModelsList(mockModels, null, "GPT", undefined);
    expect(result).toHaveLength(2);
  });

  it("filters by search term and provider", () => {
    const result = filterModelsList(mockModels, "anthropic", "Claude", undefined);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for non-matching search", () => {
    const result = filterModelsList(mockModels, null, "NonExistent", undefined);
    expect(result).toHaveLength(0);
  });

  it("filters models by enabled providers when no search term", () => {
    const enabledProviders = { openai: true, anthropic: false };
    const result = filterModelsList(mockModels, null, "", enabledProviders);
    // With enabledProviders, openai models pass (true), anthropic models fail (false)
    // Google models also pass (undefined !== false)
    const openaiCount = result.filter(m => m.provider === "openai").length;
    const anthropicCount = result.filter(m => m.provider === "anthropic").length;
    expect(openaiCount).toBeGreaterThan(0);
    expect(anthropicCount).toBe(0);
  });

  it("disables providers explicitly set to false", () => {
    const enabledProviders = { openai: false };
    const result = filterModelsList(mockModels, null, "", enabledProviders);
    expect(result.every(m => m.provider !== "openai")).toBe(true);
  });

  it("sorts results in consistent order", () => {
    const result = filterModelsList(mockModels, null, "", undefined);
    const names = result.map(m => m.name);
    // Verify sorting is deterministic
    const result2 = filterModelsList(mockModels, null, "", undefined);
    expect(result2.map(m => m.name)).toEqual(names);
    // Claude should come first (starts with C)
    expect(names[0]).toMatch(/^Claude/);
  });

  it("handles empty search term", () => {
    const result = filterModelsList(mockModels, null, "", undefined);
    expect(result).toHaveLength(5);
  });

  it("handles search with extra whitespace", () => {
    const result = filterModelsList(mockModels, null, "  GPT  ", undefined);
    expect(result).toHaveLength(2);
  });
});

describe("createModelMenuStore", () => {
  const store = createModelMenuStore();

  beforeEach(() => {
    store.setState(store.getInitialState());
  });

  it("has correct initial state", () => {
    const state = store.getState();
    expect(state.search).toBe("");
    expect(state.selectedProvider).toBeNull();
    expect(state.activeSidebarTab).toBe("favorites");
    expect(state.models).toEqual([]);
  });

  it("sets search value", () => {
    store.getState().setSearch("test");
    expect(store.getState().search).toBe("test");
  });

  it("sets selected provider", () => {
    store.getState().setSelectedProvider("openai");
    expect(store.getState().selectedProvider).toBe("openai");
  });

  it("sets selected provider to null", () => {
    store.setState({ selectedProvider: "openai" });
    store.getState().setSelectedProvider(null);
    expect(store.getState().selectedProvider).toBeNull();
  });

  it("sets active sidebar tab", () => {
    store.getState().setActiveSidebarTab("recent" as SidebarTab);
    expect(store.getState().activeSidebarTab).toBe("recent");
  });

  it("sets all models", () => {
    const models = [{ id: "1", name: "Test" }] as any;
    store.getState().setAllModels(models);
    expect(store.getState().models).toHaveLength(1);
    expect(store.getState().models[0].id).toBe("1");
  });

  it("replaces existing models when setting new ones", () => {
    store.setState({ models: [{ id: "1" }] as any });
    store.getState().setAllModels([{ id: "2" }] as any);
    expect(store.getState().models).toHaveLength(1);
    expect(store.getState().models[0].id).toBe("2");
  });
});
