import { describe, it, expect, vi, afterEach } from "vitest";
import type OpenAI from "openai";
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

describe("CustomOpenAIProvider under the cloud profile", () => {
  const saved = process.env.NODETOOL_NODE_PROFILE;
  afterEach(() => {
    if (saved === undefined) delete process.env.NODETOOL_NODE_PROFILE;
    else process.env.NODETOOL_NODE_PROFILE = saved;
  });

  it("refuses a private or plain-http base URL, which a local install allows", () => {
    const local = { ...CONFIG, CUSTOM_MYPROXY_BASE_URL: "http://127.0.0.1:8080/v1" };
    expect(() => new CustomOpenAIProvider(local)).not.toThrow();
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    expect(() => new CustomOpenAIProvider(local)).toThrow(/unsafe URL/);
    expect(
      () =>
        new CustomOpenAIProvider({
          ...CONFIG,
          CUSTOM_MYPROXY_BASE_URL: "https://169.254.169.254/v1"
        })
    ).toThrow(/unsafe URL/);
  });

  it("does not follow a redirect into a private host", async () => {
    process.env.NODETOOL_NODE_PROFILE = "cloud";
    const fetchFn = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://10.0.0.5/models" }
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, {
      fetchFn: fetchFn as unknown as typeof fetch
    });
    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://proxy.example.com/v1/models");
    // safeFetch follows redirects itself, checking every hop.
    expect(init.redirect).toBe("manual");
  });
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

  it("uses an exact listed capability as the only supported task", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          { id: "paint-from-text", capability: "text_to_image" },
          { id: "paint-from-image", capability: "image_to_image" },
          { id: "clip-from-text", capability: "text_to_video" },
          { id: "clip-from-image", capability: "image_to_video" },
          { id: "legacy-painter", type: "image", capability: "image" },
          { id: "legacy-clip", type: "video" }
        ]
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });

    const image = await provider.getAvailableImageModels();
    const video = await provider.getAvailableVideoModels();

    expect(image.map(({ id, supportedTasks }) => ({ id, supportedTasks }))).toEqual([
      { id: "paint-from-text", supportedTasks: ["text_to_image"] },
      { id: "paint-from-image", supportedTasks: ["image_to_image"] },
      {
        id: "legacy-painter",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ]);
    expect(video.map(({ id, supportedTasks }) => ({ id, supportedTasks }))).toEqual([
      { id: "clip-from-text", supportedTasks: ["text_to_video"] },
      { id: "clip-from-image", supportedTasks: ["image_to_video"] },
      {
        id: "legacy-clip",
        supportedTasks: ["text_to_video", "image_to_video"]
      }
    ]);
  });

  it("lets an exact capability override a contradictory broad type", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          {
            id: "typed-video-but-image",
            type: "video",
            capability: "text_to_image"
          },
          {
            id: "typed-image-but-video",
            type: "image",
            capability: "image_to_video"
          }
        ]
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });

    expect(await provider.getAvailableImageModels()).toEqual([
      {
        id: "typed-video-but-image",
        name: "typed-video-but-image",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image"]
      }
    ]);
    expect(await provider.getAvailableVideoModels()).toEqual([
      {
        id: "typed-image-but-video",
        name: "typed-image-but-video",
        provider: "custom_myproxy",
        supportedTasks: ["image_to_video"]
      }
    ]);
  });

  it("consolidates duplicate rows by id and kind without widening exact capabilities", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          {
            id: "shared-painter",
            name: "First painter name",
            capability: "image_to_image"
          },
          { id: "shared-painter", name: "Ignored name", type: "image" },
          { id: "shared-painter", capability: "image_to_image" },
          { id: "shared-painter", capability: "text_to_image" },
          { id: "legacy-painter", type: "image" },
          { id: "legacy-painter", type: "image", capability: "unknown" },
          { id: "cross-kind", capability: "text_to_image" },
          { id: "cross-kind", capability: "text_to_video" }
        ]
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });

    expect(await provider.getAvailableImageModels()).toEqual([
      {
        id: "shared-painter",
        name: "First painter name",
        provider: "custom_myproxy",
        supportedTasks: ["image_to_image", "text_to_image"]
      },
      {
        id: "legacy-painter",
        name: "legacy-painter",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "cross-kind",
        name: "cross-kind",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image"]
      }
    ]);
    expect(await provider.getAvailableVideoModels()).toEqual([
      {
        id: "cross-kind",
        name: "cross-kind",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_video"]
      }
    ]);
  });

  it("offers manually marked models with legacy dual-task support", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          { id: "gpt-4o-mini" },
          { id: "agnes-pro", capability: "image_to_image" }
        ]
      })
    );
    const provider = new CustomOpenAIProvider(
      { ...CONFIG, _imageModels: ["agnes-pro"], _videoModels: ["agnes-motion"] },
      { fetchFn }
    );

    expect(await provider.getAvailableImageModels()).toEqual([
      {
        id: "agnes-pro",
        name: "agnes-pro",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ]);
    expect(await provider.getAvailableVideoModels()).toEqual([
      {
        id: "agnes-motion",
        name: "agnes-motion",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_video", "image_to_video"]
      }
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

  it("narrows picker options to a declared media profile", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          {
            id: "square-painter",
            capability: "text_to_image",
            sizes: ["768x768"]
          },
          {
            id: "clip-maker",
            capability: "text_to_video",
            sizes: ["1280x720", "720x1280"],
            durations: [5, 10]
          },
          { id: "plain-painter", type: "image" }
        ]
      })
    );
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn });

    expect(await provider.getAvailableImageModels()).toEqual([
      {
        id: "square-painter",
        name: "square-painter",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image"],
        aspectRatios: ["1:1"]
      },
      {
        id: "plain-painter",
        name: "plain-painter",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ]);
    expect(await provider.getAvailableVideoModels()).toEqual([
      {
        id: "clip-maker",
        name: "clip-maker",
        provider: "custom_myproxy",
        supportedTasks: ["text_to_video"],
        aspectRatios: ["16:9", "9:16"],
        resolutions: ["720p"],
        durations: [5, 10]
      }
    ]);
  });

  it("refuses an undeclared image size before calling the endpoint", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          { id: "square-painter", capability: "text_to_image", sizes: ["768x768"] }
        ]
      })
    );
    const generate = vi.fn(async () => ({
      data: [{ b64_json: Buffer.from([1, 2, 3]).toString("base64") }]
    }));
    const client = { images: { generate } } as unknown as OpenAI;
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn, client });
    const model = { id: "square-painter", name: "", provider: "custom_myproxy" };

    await expect(
      provider.textToImage({ model, prompt: "a fox", width: 1024, height: 1024 })
    ).rejects.toThrow(
      'Model "square-painter" does not accept size 1024x1024. The endpoint lists: 768x768.'
    );
    expect(generate).not.toHaveBeenCalled();

    await provider.textToImage({ model, prompt: "a fox", width: 768, height: 768 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0]).toMatchObject({ size: "768x768" });
  });

  it("refuses more edit images than the model declares", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          { id: "one-ref-edit", capability: "image_to_image", max_input_images: 1 }
        ]
      })
    );
    const edit = vi.fn();
    const client = { images: { edit } } as unknown as OpenAI;
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn, client });
    const model = { id: "one-ref-edit", name: "", provider: "custom_myproxy" };
    const png = new Uint8Array([1, 2, 3]);

    await expect(
      provider.imageToImage([png, png], { model, prompt: "merge" })
    ).rejects.toThrow('Model "one-ref-edit" accepts at most 1 input image, got 2.');
    expect(edit).not.toHaveBeenCalled();
  });

  it("sends the declared video size and duration instead of snapping", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({
        data: [
          {
            id: "clip-maker",
            capability: "text_to_video",
            sizes: ["960x540"],
            durations: [5, 10]
          }
        ]
      })
    );
    const create = vi.fn(async () => ({ id: "vid_1", status: "completed" }));
    const downloadContent = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]))
    );
    const client = {
      videos: { create, retrieve: vi.fn(), downloadContent }
    } as unknown as OpenAI;
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn, client });
    const model = { id: "clip-maker", name: "", provider: "custom_myproxy" };

    await expect(
      provider.textToVideo({ model, prompt: "waves", durationSeconds: 8 })
    ).rejects.toThrow(/does not accept a 8s duration/);
    expect(create).not.toHaveBeenCalled();

    await provider.textToVideo({
      model,
      prompt: "waves",
      aspectRatio: "16:9",
      resolution: "540p",
      durationSeconds: 5
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      size: "960x540",
      seconds: "5"
    });
  });

  it("keeps the OpenAI video defaults for a model with no profile", async () => {
    const fetchFn = mockChatFetch(
      chatJsonResponse({ data: [{ id: "plain-clip", type: "video" }] })
    );
    const create = vi.fn(async () => ({ id: "vid_1", status: "completed" }));
    const client = {
      videos: {
        create,
        retrieve: vi.fn(),
        downloadContent: vi.fn(async () => new Response(new Uint8Array([1])))
      }
    } as unknown as OpenAI;
    const provider = new CustomOpenAIProvider(CONFIG, { fetchFn, client });

    await provider.textToVideo({
      model: { id: "plain-clip", name: "", provider: "custom_myproxy" },
      prompt: "waves",
      durationSeconds: 6
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      size: "1280x720",
      seconds: "4"
    });
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

describe("syncCustomProviders with several users", () => {
  afterEach(() => {
    syncCustomProviders([], "alice");
    syncCustomProviders([], "bob");
  });

  it("keeps one user's provider registered when another user syncs", () => {
    syncCustomProviders([{ slug: "alicegw", name: "Alice" }], "alice");
    syncCustomProviders([{ slug: "bobgw", name: "Bob" }], "bob");
    expect(listCustomProviderIds().sort()).toEqual([
      "custom_alicegw",
      "custom_bobgw"
    ]);
  });

  it("drops a provider once no user wants it", () => {
    syncCustomProviders([{ slug: "shared", name: "A" }], "alice");
    syncCustomProviders([{ slug: "shared", name: "B" }], "bob");
    syncCustomProviders([], "alice");
    expect(listCustomProviderIds()).toEqual(["custom_shared"]);
    syncCustomProviders([], "bob");
    expect(listCustomProviderIds()).toEqual([]);
  });
});
