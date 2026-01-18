/**
 * ModelMenuStore tests
 */

import { renderHook, act } from "@testing-library/react";
import {
  computeProvidersList,
  filterModelsList,
  requiredSecretForProvider,
  ALL_PROVIDERS,
  createModelMenuStore,
  ModelSelectorModel
} from "../ModelMenuStore";

const createMockModel = (
  overrides: Partial<ModelSelectorModel> = {}
): ModelSelectorModel => ({
  type: "language",
  provider: "openai",
  id: "gpt-4",
  name: "GPT-4",
  path: null,
  supported_tasks: ["text-generation"],
  ...overrides
});

describe("ModelMenuStore Helpers", () => {
  describe("requiredSecretForProvider", () => {
    it("returns OPENAI_API_KEY for openai provider", () => {
      expect(requiredSecretForProvider("openai")).toBe("OPENAI_API_KEY");
      expect(requiredSecretForProvider("OpenAI")).toBe("OPENAI_API_KEY");
    });

    it("returns ANTHROPIC_API_KEY for anthropic provider", () => {
      expect(requiredSecretForProvider("anthropic")).toBe("ANTHROPIC_API_KEY");
      expect(requiredSecretForProvider("Anthropic")).toBe("ANTHROPIC_API_KEY");
    });

    it("returns GEMINI_API_KEY for google providers", () => {
      expect(requiredSecretForProvider("gemini")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("google")).toBe("GEMINI_API_KEY");
      expect(requiredSecretForProvider("Gemini")).toBe("GEMINI_API_KEY");
    });

    it("returns HF_TOKEN for huggingface providers", () => {
      expect(requiredSecretForProvider("huggingface")).toBe("HF_TOKEN");
      expect(requiredSecretForProvider("hf_inference")).toBe("HF_TOKEN");
    });

    it("returns REPLICATE_API_TOKEN for replicate provider", () => {
      expect(requiredSecretForProvider("replicate")).toBe("REPLICATE_API_TOKEN");
    });

    it("returns FAL_API_KEY for fal provider", () => {
      expect(requiredSecretForProvider("fal")).toBe("FAL_API_KEY");
    });

    it("returns null for ollama provider", () => {
      expect(requiredSecretForProvider("ollama")).toBeNull();
    });

    it("returns null for llama_cpp provider", () => {
      expect(requiredSecretForProvider("llama_cpp")).toBeNull();
    });

    it("handles undefined provider", () => {
      expect(requiredSecretForProvider(undefined)).toBeNull();
    });

    it("handles empty string provider", () => {
      expect(requiredSecretForProvider("")).toBeNull();
    });
  });

  describe("ALL_PROVIDERS", () => {
    it("contains major AI providers", () => {
      expect(ALL_PROVIDERS).toContain("openai");
      expect(ALL_PROVIDERS).toContain("anthropic");
      expect(ALL_PROVIDERS).toContain("gemini");
      expect(ALL_PROVIDERS).toContain("ollama");
      expect(ALL_PROVIDERS).toContain("huggingface");
    });

    it("does not contain duplicate providers", () => {
      const uniqueProviders = new Set(ALL_PROVIDERS);
      expect(uniqueProviders.size).toBe(ALL_PROVIDERS.length);
    });
  });

  describe("computeProvidersList", () => {
    it("returns empty array for undefined models", () => {
      const result = computeProvidersList(undefined);
      expect(result).toEqual([]);
    });

    it("returns empty array for empty models", () => {
      const result = computeProvidersList([]);
      expect(result).toEqual([]);
    });

    it("extracts unique providers from models", () => {
      const models = [
        createMockModel({ provider: "openai", id: "gpt-4" }),
        createMockModel({ provider: "anthropic", id: "claude-3" }),
        createMockModel({ provider: "openai", id: "gpt-3.5" })
      ];

      const result = computeProvidersList(models);
      expect(result).toContain("openai");
      expect(result).toContain("anthropic");
      expect(result).toHaveLength(2);
    });

    it("counts models per provider", () => {
      const models = [
        createMockModel({ provider: "openai", id: "gpt-4" }),
        createMockModel({ provider: "openai", id: "gpt-3.5" }),
        createMockModel({ provider: "anthropic", id: "claude-3" })
      ];

      const result = computeProvidersList(models);
      expect(result).toContain("openai");
      expect(result).toContain("anthropic");
    });

    it("sorts providers alphabetically", () => {
      const models = [
        createMockModel({ provider: "zulu", id: "model-1" }),
        createMockModel({ provider: "alpha", id: "model-2" }),
        createMockModel({ provider: "middle", id: "model-3" })
      ];

      const result = computeProvidersList(models);
      expect(result[0]).toBe("alpha");
      expect(result[1]).toBe("middle");
      expect(result[2]).toBe("zulu");
    });

    it("handles null provider by mapping to 'Other'", () => {
      const models = [
        createMockModel({ provider: undefined, id: "model-1" }),
        createMockModel({ provider: undefined, id: "model-2" })
      ];

      const result = computeProvidersList(models);
      expect(result).toContain("Other");
    });

    it("filters out providers with zero models", () => {
      const models = [
        createMockModel({ provider: "openai", id: "gpt-4" }),
        createMockModel({ provider: "openai", id: "gpt-3.5" })
      ];

      const result = computeProvidersList(models);
      expect(result).not.toContain("anthropic");
    });
  });

  describe("filterModelsList", () => {
    const mockModels = [
      createMockModel({ provider: "openai", id: "gpt-4", name: "GPT-4" }),
      createMockModel({ provider: "openai", id: "gpt-3.5", name: "GPT-3.5 Turbo" }),
      createMockModel({ provider: "anthropic", id: "claude-3", name: "Claude 3" }),
      createMockModel({ provider: "anthropic", id: "claude-2", name: "Claude 2" }),
      createMockModel({ provider: "ollama", id: "llama2", name: "Llama 2" })
    ];

    it("returns all models when no filters applied", () => {
      const result = filterModelsList(mockModels, null, "", undefined);
      expect(result).toHaveLength(5);
    });

    it("returns empty array for undefined models", () => {
      const result = filterModelsList(undefined, null, "", undefined);
      expect(result).toEqual([]);
    });

    it("filters by selected provider", () => {
      const result = filterModelsList(mockModels, "openai", "", undefined);
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.provider === "openai")).toBe(true);
    });

    it("filters by google/gemini provider pattern", () => {
      const models = [
        createMockModel({ provider: "google/gemini-pro", id: "gemini-1" }),
        createMockModel({ provider: "gemini", id: "gemini-2" }),
        createMockModel({ provider: "anthropic", id: "claude-1" })
      ];

      const result = filterModelsList(models, "google/gemini-pro", "", undefined);
      expect(result).toHaveLength(2);
      expect(result.every((m) => /google|gemini/i.test(m.provider || ""))).toBe(true);
    });

    it("filters by enabled providers when no provider selected", () => {
      const enabledProviders = { openai: true, anthropic: false };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      // anthropic is explicitly disabled, ollama is not in the map (defaults to enabled)
      expect(result.every((m) => m.provider !== "anthropic")).toBe(true);
      expect(result.some((m) => m.provider === "openai")).toBe(true);
    });

    it("includes all providers when none are explicitly disabled", () => {
      const enabledProviders = { openai: true };
      const result = filterModelsList(mockModels, null, "", enabledProviders);
      expect(result).toHaveLength(5);
    });

    it("searches by name", () => {
      const result = filterModelsList(mockModels, null, "GPT", {});
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((m) => m.name?.includes("GPT"))).toBe(true);
    });

    it("searches by id", () => {
      const result = filterModelsList(mockModels, null, "gpt-4", {});
      expect(result.some((m) => m.id === "gpt-4")).toBe(true);
    });

    it("searches by provider", () => {
      const result = filterModelsList(mockModels, null, "anthropic", {});
      expect(result.some((m) => m.provider === "anthropic")).toBe(true);
    });

    it("handles case-insensitive search", () => {
      const result1 = filterModelsList(mockModels, null, "gpt", {});
      const result2 = filterModelsList(mockModels, null, "GPT", {});
      expect(result1.length).toBe(result2.length);
    });

    it("handles multi-word search", () => {
      const result = filterModelsList(mockModels, null, "GPT Turbo", {});
      expect(result.some((m) => m.name?.includes("GPT"))).toBe(true);
    });

    it("returns all models for empty search", () => {
      const result = filterModelsList(mockModels, null, "", {});
      expect(result).toHaveLength(5);
    });

    it("returns all models for whitespace-only search", () => {
      const result = filterModelsList(mockModels, null, "   ", {});
      expect(result).toHaveLength(5);
    });

    it("sorts results alphabetically by name", () => {
      const result = filterModelsList(mockModels, null, "", {});
      const names = result.map((m) => m.name || m.id);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sortedNames);
    });

    it("uses id as fallback when name is missing", () => {
      const models = [
        createMockModel({ id: "zzz-model", name: undefined }),
        createMockModel({ id: "aaa-model", name: undefined })
      ];

      const result = filterModelsList(models, null, "", {});
      expect(result[0].id).toBe("aaa-model");
      expect(result[1].id).toBe("zzz-model");
    });

    it("uses path for sorting when available", () => {
      const models = [
        createMockModel({ id: "model-a", path: "z-path", name: "Model A" }),
        createMockModel({ id: "model-b", path: "a-path", name: "Model B" })
      ];

      const result = filterModelsList(models, null, "", {});
      expect(result[0].id).toBe("model-b");
      expect(result[1].id).toBe("model-a");
    });

    it("combines provider filter with search", () => {
      const result = filterModelsList(mockModels, "openai", "GPT", {});
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.provider === "openai")).toBe(true);
    });
  });
});

const testModelMenuStore = createModelMenuStore<ModelSelectorModel>();

describe("ModelMenuStore", () => {
  beforeEach(() => {
    testModelMenuStore.setState(testModelMenuStore.getInitialState());
  });

  describe("initial state", () => {
    it("initializes with default values", () => {
      const { result } = renderHook(() => testModelMenuStore());

      expect(result.current.search).toBe("");
      expect(result.current.selectedProvider).toBeNull();
      expect(result.current.activeSidebarTab).toBe("favorites");
      expect(result.current.models).toEqual([]);
    });
  });

  describe("setSearch", () => {
    it("updates search value", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setSearch("gpt");
      });

      expect(result.current.search).toBe("gpt");
    });

    it("clears search when empty string passed", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setSearch("test search");
        result.current.setSearch("");
      });

      expect(result.current.search).toBe("");
    });
  });

  describe("setSelectedProvider", () => {
    it("sets selected provider", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setSelectedProvider("openai");
      });

      expect(result.current.selectedProvider).toBe("openai");
    });

    it("clears provider when null passed", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setSelectedProvider("openai");
        result.current.setSelectedProvider(null);
      });

      expect(result.current.selectedProvider).toBeNull();
    });
  });

  describe("setActiveSidebarTab", () => {
    it("sets sidebar tab to favorites", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setActiveSidebarTab("favorites");
      });

      expect(result.current.activeSidebarTab).toBe("favorites");
    });

    it("sets sidebar tab to recent", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setActiveSidebarTab("recent");
      });

      expect(result.current.activeSidebarTab).toBe("recent");
    });
  });

  describe("setAllModels", () => {
    it("replaces all models", () => {
      const { result } = renderHook(() => testModelMenuStore());
      const newModels = [
        createMockModel({ id: "model-1" }),
        createMockModel({ id: "model-2" })
      ];

      act(() => {
        result.current.setAllModels(newModels);
      });

      expect(result.current.models).toHaveLength(2);
      expect(result.current.models[0].id).toBe("model-1");
    });

    it("clears models when empty array passed", () => {
      const { result } = renderHook(() => testModelMenuStore());

      act(() => {
        result.current.setAllModels([createMockModel({ id: "model-1" })]);
        result.current.setAllModels([]);
      });

      expect(result.current.models).toEqual([]);
    });
  });

  describe("workflow", () => {
    it("handles complete search workflow", () => {
      const { result } = renderHook(() => testModelMenuStore());
      const models = [
        createMockModel({ id: "gpt-4", name: "GPT-4", provider: "openai" }),
        createMockModel({ id: "claude-3", name: "Claude 3", provider: "anthropic" })
      ];

      act(() => {
        result.current.setAllModels(models);
        result.current.setSelectedProvider("openai");
        result.current.setSearch("GPT");
      });

      expect(result.current.models).toHaveLength(2);
      expect(result.current.selectedProvider).toBe("openai");
      expect(result.current.search).toBe("GPT");
    });
  });
});
