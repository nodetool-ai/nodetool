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
