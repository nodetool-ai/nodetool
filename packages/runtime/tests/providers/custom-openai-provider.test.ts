import { describe, it, expect, vi, afterEach } from "vitest";
import { CustomOpenAIProvider } from "../../src/providers/custom-openai-provider.js";
import {
  syncCustomProviders,
  listCustomProviderIds
} from "../../src/providers/custom-provider-registry.js";
import {
  getProvider,
  getRegisteredProvider,
  isProviderConfigured,
  registerProvider,
  unregisterProvider
} from "../../src/providers/provider-registry.js";
import { chatJsonResponse, mockChatFetch } from "./helpers/compat-fetch.js";

const CONFIG = {
  _providerId: "custom_myproxy",
  _baseUrlKey: "CUSTOM_MYPROXY_BASE_URL",
  _apiKeyKey: "CUSTOM_MYPROXY_API_KEY",
  CUSTOM_MYPROXY_BASE_URL: "https://proxy.example.com/v1",
  CUSTOM_MYPROXY_API_KEY: "sk-test"
};

afterEach(() => {
  syncCustomProviders([]);
});

describe("CustomOpenAIProvider", () => {
  it("reports the configured wire id", () => {
    const provider = new CustomOpenAIProvider(CONFIG);
    expect(provider.provider).toBe("custom_myproxy");
  });

  it("refuses a config with no base URL", () => {
    expect(
      () =>
        new CustomOpenAIProvider({
          ...CONFIG,
          CUSTOM_MYPROXY_BASE_URL: "  "
        })
    ).toThrow("CUSTOM_MYPROXY_BASE_URL is required");
  });

  it("trims a trailing slash off the base URL before probing models", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({ data: [{ id: "gpt-4o-mini" }] })
    );
    const provider = new CustomOpenAIProvider(
      { ...CONFIG, CUSTOM_MYPROXY_BASE_URL: "https://proxy.example.com/v1/" },
      { fetchFn }
    );
    await provider.getAvailableLanguageModels();
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://proxy.example.com/v1/models"
    );
  });

  it("maps the /models response onto language models", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [{ id: "llama-3", name: "Llama 3" }, { id: "mixtral" }, { name: "no id" }]
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });
    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "llama-3", name: "Llama 3", provider: "custom_myproxy" },
      { id: "mixtral", name: "mixtral", provider: "custom_myproxy" }
    ]);
  });

  it("returns the hand-listed models without calling the endpoint", async () => {
    const fetchFn = vi.fn();
    const provider = new CustomOpenAIProvider(
      { ...CONFIG, _models: ["a", "b"] },
      { fetchFn }
    );
    const models = await provider.getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(["a", "b"]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports no models when the endpoint refuses the probe", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 401 }));
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
  });

  it("sorts an aggregator listing into chat, image and video models", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          { id: "gpt-4o-mini" },
          { id: "flux-dev" },
          { id: "kling-v2" },
          { id: "agnes-canvas", type: "image" },
          { id: "agnes-chat", type: "chat" }
        ]
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });

    const [language, image, video] = await Promise.all([
      provider.getAvailableLanguageModels(),
      provider.getAvailableImageModels(),
      provider.getAvailableVideoModels()
    ]);

    // A kind decided by metadata leaves the chat list; one guessed from the id
    // stays there too, so a misread chat model is never unreachable.
    expect(language.map((m) => m.id)).toEqual([
      "gpt-4o-mini",
      "flux-dev",
      "kling-v2",
      "agnes-chat"
    ]);
    expect(image).toEqual([
      {
        id: "flux-dev",
        name: "flux-dev",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "agnes-canvas",
        name: "agnes-canvas",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ]);
    expect(video).toEqual([
      {
        id: "kling-v2",
        name: "kling-v2",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_video", "image_to_video"]
      }
    ]);
    // The three pickers share one listing request.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("offers models the user marked as image or video, listed or not", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "agnes-pro" }] })
    );
    const provider = new CustomOpenAIProvider(
      { ...CONFIG, _imageModels: ["agnes-pro"], _videoModels: ["agnes-motion"] },
      { fetchFn }
    );

    expect((await provider.getAvailableImageModels()).map((m) => m.id)).toEqual([
      "agnes-pro"
    ]);
    expect((await provider.getAvailableVideoModels()).map((m) => m.id)).toEqual([
      "agnes-motion"
    ]);
    expect(
      (await provider.getAvailableLanguageModels()).map((m) => m.id)
    ).toEqual(["gpt-4o-mini"]);
  });

  it("classifies hand-listed models without calling the endpoint", async () => {
    const fetchFn = vi.fn();
    const provider = new CustomOpenAIProvider(
      { ...CONFIG, _models: ["llama-3", "seedream-4"] },
      { fetchFn }
    );
    expect((await provider.getAvailableImageModels()).map((m) => m.id)).toEqual([
      "seedream-4"
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends the requested image size instead of snapping to OpenAI's sizes", () => {
    const provider = new CustomOpenAIProvider(CONFIG);
    expect(provider.resolveImageSize(1820, 1024)).toBe("1820x1024");
    expect(provider.resolveImageSize(null, 1024)).toBeNull();
  });

  it("exports both settings to a container, and omits a placeholder key", () => {
    const withKey = new CustomOpenAIProvider(CONFIG);
    expect(withKey.getContainerEnv()).toEqual({
      CUSTOM_MYPROXY_BASE_URL: "https://proxy.example.com/v1",
      CUSTOM_MYPROXY_API_KEY: "sk-test"
    });

    const withoutKey = new CustomOpenAIProvider({
      ...CONFIG,
      CUSTOM_MYPROXY_API_KEY: ""
    });
    expect(withoutKey.getContainerEnv()).toEqual({
      CUSTOM_MYPROXY_BASE_URL: "https://proxy.example.com/v1"
    });
  });
});

describe("custom provider registry", () => {
  it("hands the marked image and video models to the provider", async () => {
    syncCustomProviders([
      {
        slug: "myproxy",
        name: "My Proxy",
        models: ["llama-3"],
        image_models: ["agnes-pro"],
        video_models: ["agnes-motion"]
      }
    ]);
    const provider = await getProvider("custom_myproxy", (key) =>
      key === "CUSTOM_MYPROXY_BASE_URL" ? "https://p.example.com/v1" : undefined
    );
    expect((await provider.getAvailableImageModels()).map((m) => m.id)).toEqual([
      "agnes-pro"
    ]);
    expect((await provider.getAvailableVideoModels()).map((m) => m.id)).toEqual([
      "agnes-motion"
    ]);
  });

  it("resolves both settings through getSecret at instantiation", async () => {
    syncCustomProviders([{ slug: "myproxy", name: "My Proxy" }]);
    const secrets: Record<string, string> = {
      CUSTOM_MYPROXY_BASE_URL: "https://proxy.example.com/v1",
      CUSTOM_MYPROXY_API_KEY: "sk-secret"
    };
    const provider = await getProvider(
      "custom_myproxy",
      (key) => secrets[key]
    );
    expect(provider.provider).toBe("custom_myproxy");
    expect(provider.getContainerEnv()).toEqual(secrets);
  });

  it("counts as unconfigured until the base URL resolves", async () => {
    syncCustomProviders([{ slug: "myproxy", name: "My Proxy" }]);
    expect(await isProviderConfigured("custom_myproxy", () => undefined)).toBe(
      false
    );
    expect(
      await isProviderConfigured("custom_myproxy", (key) =>
        key === "CUSTOM_MYPROXY_BASE_URL" ? "https://p.example.com/v1" : undefined
      )
    ).toBe(true);
  });

  it("drops ids that left the catalog and keeps the ones that stayed", () => {
    syncCustomProviders([
      { slug: "one", name: "One" },
      { slug: "two", name: "Two" }
    ]);
    expect(listCustomProviderIds().sort()).toEqual([
      "custom_one",
      "custom_two"
    ]);

    syncCustomProviders([{ slug: "two", name: "Two Renamed" }]);
    expect(listCustomProviderIds()).toEqual(["custom_two"]);
  });

  it("leaves providers that are not custom alone when syncing", () => {
    registerProvider("not_custom_at_all", CustomOpenAIProvider, {});
    syncCustomProviders([{ slug: "one", name: "One" }]);
    syncCustomProviders([]);
    expect(listCustomProviderIds()).toEqual([]);
    expect(getRegisteredProvider("not_custom_at_all")).not.toBeNull();
    unregisterProvider("not_custom_at_all");
  });
});
