import { act } from "@testing-library/react";
import { useModelPreferencesStore } from "../ModelPreferencesStore";

describe("ModelPreferencesStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useModelPreferencesStore.setState({
      favorites: new Set<string>(),
      recents: [],
      onlyAvailable: false,
      enabledProviders: {},
      defaultModels: {}
    });
    // Clear console.log mock calls
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has empty favorites set", () => {
      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.size).toBe(0);
    });

    it("has empty recents array", () => {
      const { recents } = useModelPreferencesStore.getState();
      expect(recents).toEqual([]);
    });

    it("has onlyAvailable set to false", () => {
      const { onlyAvailable } = useModelPreferencesStore.getState();
      expect(onlyAvailable).toBe(false);
    });

    it("has empty enabledProviders", () => {
      const { enabledProviders } = useModelPreferencesStore.getState();
      expect(enabledProviders).toEqual({});
    });

    it("has empty defaultModels", () => {
      const { defaultModels } = useModelPreferencesStore.getState();
      expect(defaultModels).toEqual({});
    });
  });

  describe("toggleFavorite", () => {
    it("adds a favorite when not already favorited", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
      });

      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.has("openai:gpt-4")).toBe(true);
    });

    it("removes a favorite when already favorited", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
      });

      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.has("openai:gpt-4")).toBe(false);
    });

    it("handles multiple different favorites", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
        useModelPreferencesStore.getState().toggleFavorite("anthropic", "claude-3");
        useModelPreferencesStore.getState().toggleFavorite("google", "gemini-pro");
      });

      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.size).toBe(3);
      expect(favorites.has("openai:gpt-4")).toBe(true);
      expect(favorites.has("anthropic:claude-3")).toBe(true);
      expect(favorites.has("google:gemini-pro")).toBe(true);
    });

    it("can add and remove favorites independently", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
        useModelPreferencesStore.getState().toggleFavorite("anthropic", "claude-3");
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4"); // Remove
      });

      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.has("openai:gpt-4")).toBe(false);
      expect(favorites.has("anthropic:claude-3")).toBe(true);
    });
  });

  describe("isFavorite", () => {
    it("returns true for favorited model", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
      });

      const result = useModelPreferencesStore.getState().isFavorite("openai", "gpt-4");
      expect(result).toBe(true);
    });

    it("returns false for non-favorited model", () => {
      const result = useModelPreferencesStore.getState().isFavorite("openai", "gpt-4");
      expect(result).toBe(false);
    });

    it("returns false after unfavoriting", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
      });

      const result = useModelPreferencesStore.getState().isFavorite("openai", "gpt-4");
      expect(result).toBe(false);
    });
  });

  describe("addRecent", () => {
    it("adds a recent entry", () => {
      act(() => {
        useModelPreferencesStore.getState().addRecent({
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });

      const { recents } = useModelPreferencesStore.getState();
      expect(recents).toHaveLength(1);
      expect(recents[0].provider).toBe("openai");
      expect(recents[0].id).toBe("gpt-4");
      expect(recents[0].name).toBe("GPT-4");
      expect(recents[0].lastUsedAt).toBeDefined();
    });

    it("moves existing entry to front on re-add", () => {
      act(() => {
        useModelPreferencesStore.getState().addRecent({
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
        useModelPreferencesStore.getState().addRecent({
          provider: "anthropic",
          id: "claude-3",
          name: "Claude 3"
        });
        useModelPreferencesStore.getState().addRecent({
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });

      const { recents } = useModelPreferencesStore.getState();
      expect(recents).toHaveLength(2);
      expect(recents[0].id).toBe("gpt-4"); // Most recent should be first
      expect(recents[1].id).toBe("claude-3");
    });

    it("limits recents to MAX_RECENTS (8)", () => {
      act(() => {
        for (let i = 0; i < 10; i++) {
          useModelPreferencesStore.getState().addRecent({
            provider: "test",
            id: `model-${i}`,
            name: `Model ${i}`
          });
        }
      });

      const { recents } = useModelPreferencesStore.getState();
      expect(recents).toHaveLength(8);
    });

    it("maintains order by most recently used", () => {
      act(() => {
        useModelPreferencesStore.getState().addRecent({
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });
      
      // Small delay to ensure different timestamps
      act(() => {
        useModelPreferencesStore.getState().addRecent({
          provider: "anthropic",
          id: "claude-3",
          name: "Claude 3"
        });
      });

      const { recents } = useModelPreferencesStore.getState();
      expect(recents[0].id).toBe("claude-3"); // More recent
      expect(recents[1].id).toBe("gpt-4");
    });
  });

  describe("getRecent", () => {
    it("returns empty array when no recents", () => {
      const recents = useModelPreferencesStore.getState().getRecent();
      expect(recents).toEqual([]);
    });

    it("returns recents array", () => {
      act(() => {
        useModelPreferencesStore.getState().addRecent({
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });

      const recents = useModelPreferencesStore.getState().getRecent();
      expect(recents).toHaveLength(1);
      expect(recents[0].id).toBe("gpt-4");
    });
  });

  describe("setOnlyAvailable", () => {
    it("sets onlyAvailable to true", () => {
      act(() => {
        useModelPreferencesStore.getState().setOnlyAvailable(true);
      });

      const { onlyAvailable } = useModelPreferencesStore.getState();
      expect(onlyAvailable).toBe(true);
    });

    it("sets onlyAvailable to false", () => {
      act(() => {
        useModelPreferencesStore.getState().setOnlyAvailable(true);
        useModelPreferencesStore.getState().setOnlyAvailable(false);
      });

      const { onlyAvailable } = useModelPreferencesStore.getState();
      expect(onlyAvailable).toBe(false);
    });
  });

  describe("isProviderEnabled", () => {
    it("returns true by default for unknown providers", () => {
      const result = useModelPreferencesStore.getState().isProviderEnabled("unknown");
      expect(result).toBe(true);
    });

    it("returns true when provider is explicitly enabled", () => {
      act(() => {
        useModelPreferencesStore.getState().setProviderEnabled("openai", true);
      });

      const result = useModelPreferencesStore.getState().isProviderEnabled("openai");
      expect(result).toBe(true);
    });

    it("returns false when provider is disabled", () => {
      act(() => {
        useModelPreferencesStore.getState().setProviderEnabled("openai", false);
      });

      const result = useModelPreferencesStore.getState().isProviderEnabled("openai");
      expect(result).toBe(false);
    });
  });

  describe("setProviderEnabled", () => {
    it("enables a provider", () => {
      act(() => {
        useModelPreferencesStore.getState().setProviderEnabled("openai", true);
      });

      const { enabledProviders } = useModelPreferencesStore.getState();
      expect(enabledProviders["openai"]).toBe(true);
    });

    it("disables a provider", () => {
      act(() => {
        useModelPreferencesStore.getState().setProviderEnabled("openai", false);
      });

      const { enabledProviders } = useModelPreferencesStore.getState();
      expect(enabledProviders["openai"]).toBe(false);
    });

    it("handles multiple providers independently", () => {
      act(() => {
        useModelPreferencesStore.getState().setProviderEnabled("openai", true);
        useModelPreferencesStore.getState().setProviderEnabled("anthropic", false);
        useModelPreferencesStore.getState().setProviderEnabled("google", true);
      });

      const store = useModelPreferencesStore.getState();
      expect(store.isProviderEnabled("openai")).toBe(true);
      expect(store.isProviderEnabled("anthropic")).toBe(false);
      expect(store.isProviderEnabled("google")).toBe(true);
    });

    it("can toggle a provider", () => {
      act(() => {
        useModelPreferencesStore.getState().setProviderEnabled("openai", true);
        useModelPreferencesStore.getState().setProviderEnabled("openai", false);
        useModelPreferencesStore.getState().setProviderEnabled("openai", true);
      });

      const result = useModelPreferencesStore.getState().isProviderEnabled("openai");
      expect(result).toBe(true);
    });
  });

  describe("provider key format", () => {
    it("uses provider:id format for favorite keys", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("my-provider", "my-model-id");
      });

      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.has("my-provider:my-model-id")).toBe(true);
    });

    it("handles special characters in provider and id", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("provider-with-dashes", "model/with/slashes");
      });

      const { favorites } = useModelPreferencesStore.getState();
      expect(favorites.has("provider-with-dashes:model/with/slashes")).toBe(true);
    });
  });

  describe("state interactions", () => {
    it("favorites and recents are independent", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
        useModelPreferencesStore.getState().addRecent({
          provider: "anthropic",
          id: "claude-3",
          name: "Claude 3"
        });
      });

      const { favorites, recents } = useModelPreferencesStore.getState();
      expect(favorites.size).toBe(1);
      expect(recents).toHaveLength(1);
      expect(favorites.has("openai:gpt-4")).toBe(true);
      expect(recents[0].id).toBe("claude-3");
    });

    it("removing a favorite does not affect recents", () => {
      act(() => {
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4");
        useModelPreferencesStore.getState().addRecent({
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
        useModelPreferencesStore.getState().toggleFavorite("openai", "gpt-4"); // Remove favorite
      });

      const { favorites, recents } = useModelPreferencesStore.getState();
      expect(favorites.has("openai:gpt-4")).toBe(false);
      expect(recents).toHaveLength(1);
      expect(recents[0].id).toBe("gpt-4");
    });
  });

  describe("setDefaultModel", () => {
    it("sets a default model for a model type", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });

      const { defaultModels } = useModelPreferencesStore.getState();
      expect(defaultModels.language_model).toBeDefined();
      expect(defaultModels.language_model?.id).toBe("gpt-4");
      expect(defaultModels.language_model?.provider).toBe("openai");
      expect(defaultModels.language_model?.name).toBe("GPT-4");
      expect(defaultModels.language_model?.type).toBe("language_model");
    });

    it("sets a default model with path", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("image_model", {
          provider: "huggingface",
          id: "stable-diffusion",
          name: "Stable Diffusion",
          path: "stabilityai/stable-diffusion-xl-base-1.0"
        });
      });

      const { defaultModels } = useModelPreferencesStore.getState();
      expect(defaultModels.image_model?.path).toBe("stabilityai/stable-diffusion-xl-base-1.0");
    });

    it("overwrites an existing default model", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "anthropic",
          id: "claude-3",
          name: "Claude 3"
        });
      });

      const { defaultModels } = useModelPreferencesStore.getState();
      expect(defaultModels.language_model?.id).toBe("claude-3");
      expect(defaultModels.language_model?.provider).toBe("anthropic");
    });

    it("handles multiple model types independently", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
        useModelPreferencesStore.getState().setDefaultModel("image_model", {
          provider: "huggingface",
          id: "stable-diffusion",
          name: "Stable Diffusion"
        });
        useModelPreferencesStore.getState().setDefaultModel("tts_model", {
          provider: "openai",
          id: "tts-1",
          name: "TTS-1"
        });
      });

      const { defaultModels } = useModelPreferencesStore.getState();
      expect(defaultModels.language_model?.id).toBe("gpt-4");
      expect(defaultModels.image_model?.id).toBe("stable-diffusion");
      expect(defaultModels.tts_model?.id).toBe("tts-1");
    });
  });

  describe("getDefaultModel", () => {
    it("returns undefined when no default is set", () => {
      const result = useModelPreferencesStore.getState().getDefaultModel("language_model");
      expect(result).toBeUndefined();
    });

    it("returns the default model when set", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });

      const result = useModelPreferencesStore.getState().getDefaultModel("language_model");
      expect(result).toBeDefined();
      expect(result?.id).toBe("gpt-4");
    });

    it("returns undefined for unset model types while others are set", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
      });

      const langResult = useModelPreferencesStore.getState().getDefaultModel("language_model");
      const imageResult = useModelPreferencesStore.getState().getDefaultModel("image_model");
      
      expect(langResult).toBeDefined();
      expect(imageResult).toBeUndefined();
    });
  });

  describe("clearDefaultModel", () => {
    it("clears a set default model", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
        useModelPreferencesStore.getState().clearDefaultModel("language_model");
      });

      const result = useModelPreferencesStore.getState().getDefaultModel("language_model");
      expect(result).toBeUndefined();
    });

    it("does not affect other model types when clearing", () => {
      act(() => {
        useModelPreferencesStore.getState().setDefaultModel("language_model", {
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        });
        useModelPreferencesStore.getState().setDefaultModel("image_model", {
          provider: "huggingface",
          id: "stable-diffusion",
          name: "Stable Diffusion"
        });
        useModelPreferencesStore.getState().clearDefaultModel("language_model");
      });

      const langResult = useModelPreferencesStore.getState().getDefaultModel("language_model");
      const imageResult = useModelPreferencesStore.getState().getDefaultModel("image_model");
      
      expect(langResult).toBeUndefined();
      expect(imageResult).toBeDefined();
      expect(imageResult?.id).toBe("stable-diffusion");
    });

    it("handles clearing an unset model type gracefully", () => {
      act(() => {
        useModelPreferencesStore.getState().clearDefaultModel("language_model");
      });

      const result = useModelPreferencesStore.getState().getDefaultModel("language_model");
      expect(result).toBeUndefined();
    });
  });
});
