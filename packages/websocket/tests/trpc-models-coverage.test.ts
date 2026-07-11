/**
 * Additional coverage for the tRPC models router. Complements
 * trpc-models.test.ts by exercising the provider-aggregation procedures
 * (image/tts/asr/music/video/embedding by provider and the cross-provider
 * aggregates), the recommended-by-modality variants, availableForKind, the
 * live-Hub search, mediaOptions, server-availability filtering, and the
 * llama.cpp / path-hit branches of huggingfaceCacheStatus.
 *
 * External effects (provider instances, HF cache I/O, network fetch, disk) are
 * mocked so tests are hermetic and fast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    listRegisteredProviderIds: vi.fn(),
    isProviderConfigured: vi.fn(),
    getProvider: vi.fn()
  };
});

import {
  listRegisteredProviderIds,
  isProviderConfigured,
  getProvider
} from "@nodetool-ai/runtime";

vi.mock("@nodetool-ai/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/huggingface")>();
  return {
    ...actual,
    readCachedHfModels: vi.fn(),
    searchCachedHfModels: vi.fn(),
    getModelsByHfType: vi.fn(),
    deleteCachedHfModel: vi.fn(),
    getHuggingfaceFileInfos: vi.fn()
  };
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn().mockResolvedValue(null)
  };
});

vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(),
    readdir: vi.fn()
  };
});

import { access, readdir } from "node:fs/promises";

vi.mock("@nodetool-ai/transformers-js-nodes", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/transformers-js-nodes")>();
  return {
    ...actual,
    scanTransformersJsCache: vi.fn().mockResolvedValue([]),
    isRepoCached: vi.fn().mockResolvedValue(false),
    getTransformersJsCacheDir: vi.fn().mockReturnValue("/tmp/tjs-cache")
  };
});

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

function makeProvider(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getAvailableMusicModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    hasToolSupport: vi.fn().mockResolvedValue(true),
    getCapabilities: vi.fn(() => ["generate_message"]),
    ...overrides
  };
}

const listIds = listRegisteredProviderIds as ReturnType<typeof vi.fn>;
const isConfigured = isProviderConfigured as ReturnType<typeof vi.fn>;
const getProv = getProvider as ReturnType<typeof vi.fn>;

describe("models router — extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listIds.mockReturnValue([]);
    isConfigured.mockResolvedValue(false);
    getProv.mockResolvedValue(null);
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    delete process.env.NODETOOL_ENV;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ── recommended-by-modality variants ─────────────────────────────────────

  describe("recommended variants", () => {
    it("recommendedImageTextToImage yields only text_to_image image models", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedImageTextToImage();
      expect(Array.isArray(result)).toBe(true);
      for (const m of result) expect(m.type).toMatch(/image/);
    });

    it("recommendedImageImageToImage returns an array", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedImageImageToImage();
      expect(Array.isArray(result)).toBe(true);
    });

    it("recommendedLanguageTextGeneration returns language models", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedLanguageTextGeneration();
      for (const m of result) expect(m.type).toMatch(/language/);
    });

    it("recommendedAsr / Tts / Music / video variants each return arrays", async () => {
      const caller = createCaller(makeCtx());
      expect(Array.isArray(await caller.models.recommendedAsr())).toBe(true);
      expect(Array.isArray(await caller.models.recommendedTts())).toBe(true);
      expect(Array.isArray(await caller.models.recommendedMusic())).toBe(true);
      expect(
        Array.isArray(await caller.models.recommendedVideoTextToVideo())
      ).toBe(true);
      expect(
        Array.isArray(await caller.models.recommendedVideoImageToVideo())
      ).toBe(true);
    });
  });

  // ── recommended with check_servers=true ──────────────────────────────────

  describe("recommended check_servers", () => {
    it("filters recommended models by live server availability", async () => {
      // All reachability probes fail → local-server models are dropped, but
      // API-key providers are kept only if configured (here: none).
      const fetchMock = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal("fetch", fetchMock);
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommended({ check_servers: true });
      expect(Array.isArray(result)).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
    });

    it("returns the production stub set when NODETOOL_ENV=production", async () => {
      vi.stubEnv("NODETOOL_ENV", "production");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommended({ check_servers: true });
      expect(Array.isArray(result)).toBe(true);
      // production skips the network probes entirely
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── availableForKind ─────────────────────────────────────────────────────

  describe("availableForKind", () => {
    it("text_generation merges provider + curated, deduped by provider|id", async () => {
      listIds.mockReturnValue(["openai"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi
            .fn()
            .mockResolvedValue([
              { id: "gpt-x", name: "GPT X", provider: "openai" }
            ]),
          hasToolSupport: vi.fn().mockResolvedValue(true)
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.availableForKind({
        kind: "text_generation"
      });
      expect(result.some((m) => m.id === "gpt-x")).toBe(true);
    });

    it("embedding kind pulls embedding models from the provider", async () => {
      listIds.mockReturnValue(["openai"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableEmbeddingModels: vi
            .fn()
            .mockResolvedValue([
              { id: "emb-1", name: "Embed 1", provider: "openai" }
            ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.availableForKind({
        kind: "embedding"
      });
      const hit = result.find((m) => m.id === "emb-1");
      expect(hit?.type).toBe("embedding_model");
    });

    it("text_to_image filters by supportedTasks when present", async () => {
      listIds.mockReturnValue(["fal"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableImageModels: vi.fn().mockResolvedValue([
            {
              id: "keep",
              name: "Keep",
              provider: "fal",
              supportedTasks: ["text_to_image"]
            },
            {
              id: "drop",
              name: "Drop",
              provider: "fal",
              supportedTasks: ["image_to_image"]
            }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.availableForKind({
        kind: "text_to_image"
      });
      expect(result.some((m) => m.id === "keep")).toBe(true);
      expect(result.some((m) => m.id === "drop")).toBe(false);
    });

    it("text_to_speech / text_to_music / speech_to_text each map provider models", async () => {
      listIds.mockReturnValue(["p"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableTTSModels: vi
            .fn()
            .mockResolvedValue([{ id: "tts-1", name: "T", provider: "p" }]),
          getAvailableMusicModels: vi
            .fn()
            .mockResolvedValue([{ id: "mus-1", name: "M", provider: "p" }]),
          getAvailableASRModels: vi
            .fn()
            .mockResolvedValue([{ id: "asr-1", name: "A", provider: "p" }])
        })
      );
      const caller = createCaller(makeCtx());
      expect(
        (await caller.models.availableForKind({ kind: "text_to_speech" })).some(
          (m) => m.id === "tts-1"
        )
      ).toBe(true);
      expect(
        (await caller.models.availableForKind({ kind: "text_to_music" })).some(
          (m) => m.id === "mus-1"
        )
      ).toBe(true);
      expect(
        (await caller.models.availableForKind({ kind: "speech_to_text" })).some(
          (m) => m.id === "asr-1"
        )
      ).toBe(true);
    });

    it("image_to_video filters video models by supportedTasks", async () => {
      listIds.mockReturnValue(["p"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableVideoModels: vi.fn().mockResolvedValue([
            {
              id: "vid-keep",
              name: "V",
              provider: "p",
              supportedTasks: ["image_to_video"]
            },
            {
              id: "vid-drop",
              name: "V2",
              provider: "p",
              supportedTasks: ["text_to_video"]
            }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.availableForKind({
        kind: "image_to_video"
      });
      expect(result.some((m) => m.id === "vid-keep")).toBe(true);
      expect(result.some((m) => m.id === "vid-drop")).toBe(false);
    });

    it("swallows a provider error and still returns curated models", async () => {
      listIds.mockReturnValue(["boom"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi
            .fn()
            .mockRejectedValue(new Error("provider down"))
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.availableForKind({
        kind: "text_generation"
      });
      // curated RECOMMENDED_MODELS still present
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ── by-provider aggregation procedures ───────────────────────────────────

  describe("by-provider procedures", () => {
    it("imageByProvider maps provider image models", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableImageModels: vi
            .fn()
            .mockResolvedValue([{ id: "img-1", name: "Img", provider: "fal" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.imageByProvider({ provider: "fal" });
      expect(result[0].type).toBe("image_model");
      expect(result[0].id).toBe("img-1");
    });

    it("ttsByProvider returns [] when provider unconfigured", async () => {
      isConfigured.mockResolvedValue(false);
      const caller = createCaller(makeCtx());
      expect(await caller.models.ttsByProvider({ provider: "x" })).toEqual([]);
    });

    it("ttsByProvider maps tts models when configured", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableTTSModels: vi
            .fn()
            .mockResolvedValue([{ id: "t1", name: "T", provider: "x" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.ttsByProvider({ provider: "x" });
      expect(result[0].type).toBe("tts_model");
    });

    it("musicByProvider maps music models", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableMusicModels: vi
            .fn()
            .mockResolvedValue([{ id: "m1", name: "M", provider: "x" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.musicByProvider({ provider: "x" });
      expect(result[0].type).toBe("music_model");
    });

    it("asrByProvider maps asr models", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableASRModels: vi
            .fn()
            .mockResolvedValue([{ id: "a1", name: "A", provider: "x" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.asrByProvider({ provider: "x" });
      expect(result[0].type).toBe("asr_model");
    });

    it("videoByProvider maps video models", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableVideoModels: vi
            .fn()
            .mockResolvedValue([{ id: "v1", name: "V", provider: "x" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.videoByProvider({ provider: "x" });
      expect(result[0].type).toBe("video_model");
    });

    it("embeddingByProvider maps embedding models", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableEmbeddingModels: vi
            .fn()
            .mockResolvedValue([{ id: "e1", name: "E", provider: "x" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.embeddingByProvider({ provider: "x" });
      expect(result[0].type).toBe("embedding_model");
    });

    it("returns fallback [] when a by-provider call throws", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableImageModels: vi
            .fn()
            .mockRejectedValue(new Error("boom"))
        })
      );
      const caller = createCaller(makeCtx());
      expect(await caller.models.imageByProvider({ provider: "x" })).toEqual([]);
    });
  });

  // ── cross-provider aggregates ────────────────────────────────────────────

  describe("aggregate procedures", () => {
    it("music aggregates across providers", async () => {
      listIds.mockReturnValue(["a", "b"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockImplementation(async (id: string) =>
        makeProvider({
          getAvailableMusicModels: vi
            .fn()
            .mockResolvedValue([{ id: `${id}-m`, name: id, provider: id }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.music();
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.type === "music_model")).toBe(true);
    });

    it("asr aggregates across providers", async () => {
      listIds.mockReturnValue(["a"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableASRModels: vi
            .fn()
            .mockResolvedValue([{ id: "asr", name: "A", provider: "a" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.asr();
      expect(result[0].type).toBe("asr_model");
    });

    it("video aggregates across providers", async () => {
      listIds.mockReturnValue(["a"]);
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableVideoModels: vi
            .fn()
            .mockResolvedValue([{ id: "vid", name: "V", provider: "a" }])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.video();
      expect(result[0].type).toBe("video_model");
    });

    it("aggregate returns empty when no providers configured", async () => {
      listIds.mockReturnValue([]);
      const caller = createCaller(makeCtx());
      expect(await caller.models.music()).toEqual([]);
      expect(await caller.models.asr()).toEqual([]);
      expect(await caller.models.video()).toEqual([]);
    });
  });

  // ── mediaOptions ─────────────────────────────────────────────────────────

  describe("mediaOptions", () => {
    it("returns empty option arrays when the provider is unconfigured", async () => {
      isConfigured.mockResolvedValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.models.mediaOptions({
        provider: "fal",
        model: "m",
        task: "image"
      });
      expect(result).toEqual({
        aspectRatios: [],
        resolutions: [],
        durations: null
      });
    });

    it("returns the matching image model's aspect ratios and resolutions", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableImageModels: vi.fn().mockResolvedValue([
            {
              id: "m",
              name: "M",
              provider: "fal",
              aspectRatios: ["1:1", "16:9"],
              resolutions: ["512", "1024"]
            }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.mediaOptions({
        provider: "fal",
        model: "m",
        task: "image"
      });
      expect(result.aspectRatios).toEqual(["1:1", "16:9"]);
      expect(result.resolutions).toEqual(["512", "1024"]);
      expect(result.durations).toBeNull();
    });

    it("returns video durations for the matching video model", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableVideoModels: vi.fn().mockResolvedValue([
            {
              id: "v",
              name: "V",
              provider: "fal",
              aspectRatios: ["16:9"],
              resolutions: ["720p"],
              durations: [5, 10]
            }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.mediaOptions({
        provider: "fal",
        model: "v",
        task: "video"
      });
      expect(result.durations).toEqual([5, 10]);
    });

    it("returns empty arrays for an unknown model id", async () => {
      isConfigured.mockResolvedValue(true);
      getProv.mockResolvedValue(
        makeProvider({
          getAvailableImageModels: vi.fn().mockResolvedValue([])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.mediaOptions({
        provider: "fal",
        model: "missing",
        task: "image"
      });
      expect(result.aspectRatios).toEqual([]);
      expect(result.resolutions).toEqual([]);
    });
  });

  // ── huggingfaceHubSearch (live Hub) ──────────────────────────────────────

  describe("huggingfaceHubSearch", () => {
    it("returns [] when neither query nor pipeline_tag is given", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceHubSearch({});
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps Hub records to unified models on a successful response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "org/model-a",
            pipeline_tag: "text-generation",
            tags: ["llm"],
            downloads: 100,
            likes: 5,
            trendingScore: 9
          },
          { modelId: "org/model-b" },
          { pipeline_tag: "text-generation" } // no id/modelId → dropped
        ]
      });
      vi.stubGlobal("fetch", fetchMock);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceHubSearch({
        query: "gpt",
        limit: 10
      });
      expect(result).toHaveLength(2);
      const a = result.find((m) => m.id === "org/model-a");
      expect(a?.provider).toBe("huggingface");
      expect(a?.type).toBe("hf.text_generation");
      expect(a?.downloads).toBe(100);
    });

    it("returns [] on a non-OK Hub response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "down" })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceHubSearch({
        pipeline_tag: "text-to-image"
      });
      expect(result).toEqual([]);
    });

    it("returns [] when fetch rejects (network error)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ENOTFOUND"))
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceHubSearch({ query: "x" });
      expect(result).toEqual([]);
    });
  });

  // ── huggingfaceCacheStatus branches ──────────────────────────────────────

  describe("huggingfaceCacheStatus llama.cpp / path branches", () => {
    it("returns downloaded:false for a llama_cpp model with no path", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k",
          repo_id: "org/gguf",
          model_type: "hf.gguf",
          path: null,
          allow_patterns: null,
          ignore_patterns: null
        }
      ]);
      expect(result[0].downloaded).toBe(false);
    });

    it("returns downloaded:false for a llama_cpp model whose file is uncached", async () => {
      // access() rejects by default, readdir() returns [] → not cached
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k",
          repo_id: "org/gguf",
          model_type: "llama_cpp_model",
          path: "model.gguf",
          allow_patterns: null,
          ignore_patterns: null
        }
      ]);
      expect(result[0].downloaded).toBe(false);
    });

    it("uses allow/ignore patterns over a repo's cached file list", async () => {
      // Simulate a cached snapshot containing one weights file.
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (readdir as ReturnType<typeof vi.fn>).mockImplementation(
        async (dir: string) => {
          if (dir.endsWith("snapshots")) {
            return [{ name: "abc", isDirectory: () => true }] as never;
          }
          return [
            {
              name: "model.safetensors",
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false
            }
          ] as never;
        }
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k",
          repo_id: "org/repo",
          model_type: null,
          path: null,
          allow_patterns: "*.safetensors",
          ignore_patterns: "*.bin"
        }
      ]);
      expect(result[0].downloaded).toBe(true);
    });
  });

  // ── huggingfaceTryCacheRepos with a cache hit ────────────────────────────

  describe("huggingfaceTryCacheRepos with cached files", () => {
    it("reports downloaded:true when a snapshot has files", async () => {
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (readdir as ReturnType<typeof vi.fn>).mockImplementation(
        async (dir: string) => {
          if (dir.endsWith("snapshots")) {
            return [{ name: "snap1", isDirectory: () => true }] as never;
          }
          return [
            {
              name: "config.json",
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false
            }
          ] as never;
        }
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheRepos(["org/repo"]);
      expect(result[0].downloaded).toBe(true);
    });
  });
});
