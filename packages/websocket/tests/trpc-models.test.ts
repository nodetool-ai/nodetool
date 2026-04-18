/**
 * Unit tests for the tRPC models router.
 *
 * Heavy external dependencies (provider instances, HF cache I/O) are mocked so
 * the tests remain fast and hermetic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// ── Mock @nodetool/runtime ─────────────────────────────────────────────────

vi.mock("@nodetool/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool/runtime")>();
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
} from "@nodetool/runtime";

// ── Mock @nodetool/huggingface ─────────────────────────────────────────────

vi.mock("@nodetool/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool/huggingface")>();
  return {
    ...actual,
    readCachedHfModels: vi.fn(),
    searchCachedHfModels: vi.fn(),
    getModelsByHfType: vi.fn(),
    deleteCachedHfModel: vi.fn(),
    getHuggingfaceFileInfos: vi.fn()
  };
});

import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos
} from "@nodetool/huggingface";

// ── Mock @nodetool/models ──────────────────────────────────────────────────

vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    getSecret: vi.fn()
  };
});

import { getSecret } from "@nodetool/models";

// ── Mock node:fs/promises & node:fs to avoid real disk I/O ────────────────

vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(),
    readdir: vi.fn()
  };
});

import { access, readdir } from "node:fs/promises";

// ── Helpers ────────────────────────────────────────────────────────────────

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

/** Minimal provider instance with all model-list methods returning empty arrays. */
function makeProvider(
  overrides: Partial<{
    getAvailableLanguageModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableImageModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableTTSModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableASRModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableEmbeddingModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableVideoModels: () => Promise<{ id: string; name: string; provider: string }[]>;
  }> = {}
) {
  return {
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    ...overrides
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("models router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no providers, no HF cache, no disk I/O errors
    (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (searchCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getModelsByHfType as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getHuggingfaceFileInfos as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // Default: disk access returns ENOENT (nothing cached)
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Authorization guard ──────────────────────────────────────────────────

  describe("auth guard (all protected procedures)", () => {
    it("providers throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.models.providers()).rejects.toThrow();
    });

    it("recommended throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.models.recommended({ check_servers: false })
      ).rejects.toThrow();
    });

    it("all throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.models.all()).rejects.toThrow();
    });
  });

  // ── providers ────────────────────────────────────────────────────────────

  describe("providers", () => {
    it("returns empty array when no providers are configured", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();
      expect(result).toEqual([]);
    });

    it("returns provider info for configured providers", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider()
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("openai");
      expect(result[0].capabilities).toContain("generate_message");
    });
  });

  // ── recommended ──────────────────────────────────────────────────────────

  describe("recommended", () => {
    it("returns an array of models without check_servers", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommended({ check_servers: false });
      expect(Array.isArray(result)).toBe(true);
      // RECOMMENDED_MODELS is a non-empty constant array
      expect(result.length).toBeGreaterThan(0);
    });

    it("every recommended model has id and name", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommended({ check_servers: false });
      for (const model of result) {
        expect(typeof model.id).toBe("string");
        expect(typeof model.name).toBe("string");
      }
    });
  });

  // ── recommendedImage ─────────────────────────────────────────────────────

  describe("recommendedImage", () => {
    it("returns only image-modality models", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedImage();
      expect(Array.isArray(result)).toBe(true);
      // All returned models should have an image-related type
      for (const model of result) {
        expect(model.type).toMatch(/image/);
      }
    });
  });

  // ── recommendedLanguage ──────────────────────────────────────────────────

  describe("recommendedLanguage", () => {
    it("returns models with language-related types", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedLanguage();
      // language modality includes language_model and embedding_model
      for (const model of result) {
        expect(model.type).toMatch(/language|embedding/);
      }
    });
  });

  // ── recommendedLanguageEmbedding ─────────────────────────────────────────

  describe("recommendedLanguageEmbedding", () => {
    it("returns embedding models", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedLanguageEmbedding();
      for (const model of result) {
        expect(model.type).toMatch(/embedding/);
      }
    });
  });

  // ── all ──────────────────────────────────────────────────────────────────

  describe("all", () => {
    it("returns an array (minimum: RECOMMENDED_MODELS)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.all();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("includes provider models when a provider is configured", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "gpt-extra", name: "GPT Extra", provider: "openai" }
          ])
        })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.all();
      const ids = result.map((m) => m.id);
      expect(ids).toContain("gpt-extra");
    });
  });

  // ── huggingfaceList ──────────────────────────────────────────────────────

  describe("huggingfaceList", () => {
    it("returns empty array when HF cache is empty", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceList();
      expect(result).toEqual([]);
    });

    it("returns HF models from cache", async () => {
      (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "bert-base",
          name: "BERT Base",
          type: "language_model",
          repo_id: "google/bert-base",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceList();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("bert-base");
    });

    it("returns empty array when readCachedHfModels throws", async () => {
      (readCachedHfModels as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("disk error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceList();
      expect(result).toEqual([]);
    });
  });

  // ── huggingfaceSearch ────────────────────────────────────────────────────

  describe("huggingfaceSearch", () => {
    it("returns matching models", async () => {
      (searchCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "whisper-tiny",
          name: "Whisper Tiny",
          type: "asr_model",
          repo_id: "openai/whisper-tiny",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceSearch({ query: "whisper" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("whisper-tiny");
    });

    it("returns empty array on error", async () => {
      (searchCachedHfModels as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("search error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceSearch({ query: "x" });
      expect(result).toEqual([]);
    });
  });

  // ── huggingfaceByType ────────────────────────────────────────────────────

  describe("huggingfaceByType", () => {
    it("returns models of the requested type", async () => {
      (getModelsByHfType as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "sd-1-5",
          name: "Stable Diffusion 1.5",
          type: "diffusers",
          repo_id: "runwayml/stable-diffusion-v1-5",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceByType({
        model_type: "diffusers"
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("sd-1-5");
    });

    it("returns empty array on error", async () => {
      (getModelsByHfType as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("hf error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceByType({
        model_type: "diffusers"
      });
      expect(result).toEqual([]);
    });
  });

  // ── huggingfaceDelete ────────────────────────────────────────────────────

  describe("huggingfaceDelete", () => {
    it("returns true on successful delete", async () => {
      (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceDelete({
        repo_id: "openai/whisper-tiny"
      });
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("delete error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceDelete({
        repo_id: "openai/whisper-tiny"
      });
      expect(result).toBe(false);
    });
  });

  // ── ollama ───────────────────────────────────────────────────────────────

  describe("ollama", () => {
    it("returns empty array when ollama is not configured", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.models.ollama();
      expect(result).toEqual([]);
    });

    it("returns ollama models when provider is configured", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "llama3", name: "Llama 3", provider: "ollama" }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.ollama();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Llama 3");
      expect(result[0].type).toBe("llama_model");
    });
  });

  // ── llmByProvider ────────────────────────────────────────────────────────

  describe("llmByProvider", () => {
    it("returns empty array when provider is not configured", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.models.llmByProvider({ provider: "openai" });
      expect(result).toEqual([]);
    });

    it("returns language models from the configured provider", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "gpt-4o", name: "GPT-4o", provider: "openai" }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.llmByProvider({ provider: "openai" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("gpt-4o");
      expect(result[0].type).toBe("language_model");
    });
  });

  // ── tts ──────────────────────────────────────────────────────────────────

  describe("tts", () => {
    it("returns empty array when no providers are configured", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.tts();
      expect(result).toEqual([]);
    });

    it("aggregates TTS models across providers", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai",
        "elevenlabs"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
        async (id: string) =>
          makeProvider({
            getAvailableTTSModels: vi.fn().mockResolvedValue([
              { id: `${id}-tts`, name: `${id} TTS`, provider: id }
            ])
          })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.tts();
      expect(result.length).toBe(2);
      for (const model of result) {
        expect(model.type).toBe("tts_model");
      }
    });
  });

  // ── huggingfaceTryCacheFiles ──────────────────────────────────────────────

  describe("huggingfaceTryCacheFiles", () => {
    it("returns downloaded:false for non-existent file", async () => {
      // access() already throws ENOENT by default
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheFiles([
        { repo_id: "some/repo", path: "model.bin" }
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].downloaded).toBe(false);
    });

    it("returns downloaded:false for empty repo_id or path", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheFiles([
        { repo_id: "", path: "" }
      ]);
      expect(result[0].downloaded).toBe(false);
    });
  });

  // ── huggingfaceTryCacheRepos ──────────────────────────────────────────────

  describe("huggingfaceTryCacheRepos", () => {
    it("returns downloaded:false when no snapshots exist", async () => {
      // readdir returns [] and access throws — nothing cached
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheRepos([
        "some/repo"
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].repo_id).toBe("some/repo");
      expect(result[0].downloaded).toBe(false);
    });
  });

  // ── huggingfaceCheckCache ──────────────────────────────────────────────────

  describe("huggingfaceCheckCache", () => {
    it("returns all_present:true when no allow_pattern and no cache", async () => {
      // No allow_pattern → missing is empty → all_present is true
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCheckCache({
        repo_id: "some/repo"
      });
      expect(result.repo_id).toBe("some/repo");
      expect(result.all_present).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("reports missing patterns when allow_pattern is specified", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCheckCache({
        repo_id: "some/repo",
        allow_pattern: "*.bin"
      });
      expect(result.all_present).toBe(false);
      expect(result.missing).toContain("*.bin");
    });
  });

  // ── huggingfaceCacheStatus ─────────────────────────────────────────────────

  describe("huggingfaceCacheStatus", () => {
    it("returns downloaded:false for a non-cached repo", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k1",
          repo_id: "some/repo",
          model_type: null,
          path: null,
          allow_patterns: null,
          ignore_patterns: null
        }
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("k1");
      expect(result[0].downloaded).toBe(false);
    });

    it("returns downloaded:false for a specific file not in cache", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k2",
          repo_id: "some/repo",
          model_type: null,
          path: "model.safetensors",
          allow_patterns: null,
          ignore_patterns: null
        }
      ]);
      expect(result[0].downloaded).toBe(false);
    });
  });

  // ── pullOllamaModel ──────────────────────────────────────────────────────

  describe("pullOllamaModel", () => {
    it("returns unavailable status (streaming not supported in TS server)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.pullOllamaModel({ model: "llama3" });
      expect(result.status).toBe("unavailable");
      expect(typeof result.message).toBe("string");
    });
  });

  // ── huggingfaceFileInfo ──────────────────────────────────────────────────

  describe("huggingfaceFileInfo", () => {
    it("returns file info from HuggingFace", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue("hf-token");
      (getHuggingfaceFileInfos as ReturnType<typeof vi.fn>).mockResolvedValue([
        { size: 1234, sha256: "abc" }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceFileInfo([
        { repo_id: "openai/whisper-tiny", path: "model.bin" }
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(1234);
    });

    it("returns empty array on error", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (getHuggingfaceFileInfos as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceFileInfo([
        { repo_id: "openai/whisper-tiny", path: "model.bin" }
      ]);
      expect(result).toEqual([]);
    });
  });

  // ── ollamaModelInfo (stub) ────────────────────────────────────────────────

  describe("ollamaModelInfo", () => {
    it("returns null (stub)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.ollamaModelInfo();
      expect(result).toBeNull();
    });
  });
});
