import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  type ProviderId
} from "@nodetool/runtime";
import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos
} from "@nodetool/huggingface";
import type { UnifiedModel } from "@nodetool/protocol";
import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";
import { getSecret } from "@nodetool/models";

// ── Local schemas (mirrored in packages/protocol/src/api-schemas/models.ts) ──

const unifiedModelSchema = z.object({
  id: z.string(),
  type: z.string().nullish(),
  name: z.string(),
  repo_id: z.string().nullish(),
  path: z.string().nullish(),
  downloaded: z.boolean().nullish(),
  tags: z.array(z.string()).nullish()
});

const modelsListOutput = z.array(unifiedModelSchema);

const providersOutput = z.array(
  z.object({
    provider: z.string(),
    capabilities: z.array(z.string())
  })
);

const recommendedInput = z.object({
  check_servers: z.boolean().optional().default(false)
});

const hfCacheCheckInput = z.object({
  repo_id: z.string().min(1),
  allow_pattern: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  ignore_pattern: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
});

const hfCacheCheckOutput = z.object({
  repo_id: z.string(),
  all_present: z.boolean(),
  total_files: z.number(),
  missing: z.array(z.string())
});

const hfFastCacheStatusItem = z.object({
  key: z.string(),
  repo_id: z.string(),
  model_type: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  allow_patterns: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  ignore_patterns: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
});

const hfFastCacheStatusInput = z.array(hfFastCacheStatusItem);

const hfFastCacheStatusOutput = z.array(
  z.object({
    key: z.string(),
    downloaded: z.boolean()
  })
);

const tryCacheFilesInput = z.array(
  z.object({
    repo_id: z.string().optional(),
    path: z.string().optional()
  })
);

const tryCacheFilesOutput = z.array(
  z.object({
    repo_id: z.string(),
    path: z.string(),
    downloaded: z.boolean()
  })
);

const tryCacheReposInput = z.array(z.string());

const tryCacheReposOutput = z.array(
  z.object({
    repo_id: z.string(),
    downloaded: z.boolean()
  })
);

const hfFileInfoInput = z.array(
  z.object({
    repo_id: z.string(),
    path: z.string()
  })
);

const hfSearchInput = z.object({
  query: z.string().optional(),
  type: z.string().optional()
});

const hfByTypeInput = z.object({
  model_type: z.string().min(1)
});

const hfDeleteInput = z.object({
  repo_id: z.string().min(1)
});

const ollamaModelSchema = z.object({
  type: z.string(),
  name: z.string(),
  repo_id: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
  details: z.record(z.string(), z.unknown())
});

const ollamaModelsOutput = z.array(ollamaModelSchema);

const providerInput = z.object({
  provider: z.string().min(1)
});

// ── Constants ──────────────────────────────────────────────────────

const LLAMA_CPP_MODEL_TYPES = new Set([
  "llama_cpp_model",
  "llama_cpp",
  "hf.gguf"
]);

interface RecommendedUnifiedModel extends UnifiedModel {
  modality: "language" | "image" | "tts" | "asr" | "video";
  task?:
    | "text_generation"
    | "embedding"
    | "text_to_image"
    | "image_to_image"
    | "text_to_video"
    | "image_to_video";
  provider?: ProviderId;
}

const RECOMMENDED_MODELS: RecommendedUnifiedModel[] = [
  {
    id: "gpt-4o-mini",
    type: "language_model",
    name: "GPT-4o mini",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "text_generation",
    provider: "openai"
  },
  {
    id: "claude-3-5-sonnet-latest",
    type: "language_model",
    name: "Claude 3.5 Sonnet",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "text_generation",
    provider: "anthropic"
  },
  {
    id: "text-embedding-3-small",
    type: "embedding_model",
    name: "Text Embedding 3 Small",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "embedding",
    provider: "openai"
  },
  {
    id: "gpt-image-1",
    type: "image_model",
    name: "GPT Image 1",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "image",
    task: "text_to_image",
    provider: "openai"
  },
  {
    id: "gpt-image-1",
    type: "image_model",
    name: "GPT Image 1",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "image",
    task: "image_to_image",
    provider: "openai"
  },
  {
    id: "whisper-1",
    type: "asr_model",
    name: "Whisper",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "asr",
    provider: "openai"
  },
  {
    id: "tts-1",
    type: "tts_model",
    name: "TTS 1",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "tts",
    provider: "openai"
  },
  {
    id: "sora-2",
    type: "video_model",
    name: "Sora 2",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "video",
    task: "text_to_video",
    provider: "openai"
  },
  {
    id: "sora-2",
    type: "video_model",
    name: "Sora 2",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "video",
    task: "image_to_video",
    provider: "openai"
  }
];

// ── Helpers ────────────────────────────────────────────────────────

function isProduction(): boolean {
  const value = (
    process.env.NODETOOL_ENV ??
    process.env.NODE_ENV ??
    ""
  ).toLowerCase();
  return value === "production";
}

function dedupeModels(models: UnifiedModel[]): UnifiedModel[] {
  const seen = new Set<string>();
  const deduped: UnifiedModel[] = [];
  for (const model of models) {
    const key = `${model.repo_id ?? ""}::${model.path ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(model);
    }
  }
  return deduped;
}

function normalizePatterns(
  patterns: string | string[] | null | undefined
): string[] | null {
  if (patterns == null) return null;
  if (typeof patterns === "string") return patterns ? [patterns] : null;
  const cleaned = patterns.filter((p) => Boolean(p));
  return cleaned.length > 0 ? cleaned : null;
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = `^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`;
  return new RegExp(regex);
}

function matchesPattern(value: string, pattern: string): boolean {
  return wildcardToRegExp(pattern).test(value);
}

function isIgnored(path: string, ignorePatterns: string[] | null): boolean {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;
  return ignorePatterns.some((pattern) => matchesPattern(path, pattern));
}

function isDownloadedFromFiles(
  files: string[],
  allowPatterns: string[] | null,
  ignorePatterns: string[] | null
): boolean {
  if (files.length === 0) return false;

  if (allowPatterns && allowPatterns.length > 0) {
    return allowPatterns.every((pattern) =>
      files.some(
        (path) =>
          matchesPattern(path, pattern) && !isIgnored(path, ignorePatterns)
      )
    );
  }

  return files.some((path) => !isIgnored(path, ignorePatterns));
}

function getHfCacheRoot(): string {
  const cacheEnv = process.env.HUGGINGFACE_HUB_CACHE ?? process.env.HF_HOME;
  return cacheEnv
    ? join(cacheEnv, "hub")
    : join(homedir(), ".cache", "huggingface", "hub");
}

function repoToCacheDir(repoId: string): string {
  return `models--${repoId.replaceAll("/", "--")}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listSnapshotDirs(repoId: string): Promise<string[]> {
  const snapshotsRoot = join(
    getHfCacheRoot(),
    repoToCacheDir(repoId),
    "snapshots"
  );
  if (!(await pathExists(snapshotsRoot))) return [];
  const entries = await readdir(snapshotsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(snapshotsRoot, entry.name));
}

async function repoFileInCache(
  repoId: string,
  relativePath: string
): Promise<boolean> {
  const snapshotDirs = await listSnapshotDirs(repoId);
  for (const snapshotDir of snapshotDirs) {
    if (await pathExists(join(snapshotDir, relativePath))) {
      return true;
    }
  }
  return false;
}

async function listRepoCachedFiles(repoId: string): Promise<string[]> {
  const snapshotDirs = await listSnapshotDirs(repoId);
  const collected = new Set<string>();

  async function walk(root: string, current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(root, full);
        continue;
      }
      if (entry.isFile() || entry.isSymbolicLink()) {
        const rel = full.slice(root.length + 1).replaceAll("\\", "/");
        collected.add(rel);
      }
    }
  }

  for (const snapshotDir of snapshotDirs) {
    await walk(snapshotDir, snapshotDir);
  }

  return [...collected];
}

async function hasCachedFiles(repoId: string): Promise<boolean> {
  return (await listRepoCachedFiles(repoId)).length > 0;
}

async function isLlamaCppModelCached(
  repoId: string,
  filePath: string
): Promise<boolean> {
  if (await repoFileInCache(repoId, filePath)) {
    return true;
  }

  const cacheRoot =
    process.env.LLAMA_CPP_CACHE_DIR ??
    join(homedir(), "Library", "Caches", "llama.cpp", "hf");
  const repoDir = join(cacheRoot, repoToCacheDir(repoId), "snapshots");
  if (!(await pathExists(repoDir))) return false;

  const snapshots = await readdir(repoDir, { withFileTypes: true });
  for (const snapshot of snapshots) {
    if (!snapshot.isDirectory()) continue;
    if (await pathExists(join(repoDir, snapshot.name, filePath))) {
      return true;
    }
    if (await pathExists(join(repoDir, snapshot.name, basename(filePath)))) {
      return true;
    }
  }

  return false;
}

type ProviderInstance = Awaited<ReturnType<typeof getProvider>>;

async function getAvailableProviderIds(userId: string): Promise<ProviderId[]> {
  const ids = listRegisteredProviderIds();
  const checks = await Promise.all(
    ids.map(async (id) => ({
      id,
      available: await isProviderConfigured(id, userId)
    }))
  );
  return checks.filter((c) => c.available).map((c) => c.id);
}

async function instantiateProvider(
  provider: ProviderId,
  userId: string
): Promise<ProviderInstance | null> {
  if (!(await isProviderConfigured(provider, userId))) return null;
  try {
    return await getProvider(provider, userId);
  } catch {
    return null;
  }
}

async function isServerReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function getServerAvailability(): Promise<Record<string, boolean>> {
  if (isProduction()) return { ollama: false, llama_cpp: false };

  const ollamaUrl = (
    process.env.OLLAMA_API_URL ?? "http://127.0.0.1:11434"
  ).replace(/\/+$/, "");
  const llamaUrl = process.env.LLAMA_CPP_URL?.replace(/\/+$/, "") ?? "";

  const [ollama, llama] = await Promise.all([
    isServerReachable(`${ollamaUrl}/api/tags`),
    llamaUrl
      ? isServerReachable(`${llamaUrl}/v1/models`)
      : Promise.resolve(false)
  ]);

  return { ollama, llama_cpp: llama };
}

async function serverAllowsModel(
  model: RecommendedUnifiedModel,
  servers: Record<string, boolean>
): Promise<boolean> {
  if (model.provider === "ollama") return servers.ollama ?? false;
  if (model.provider === "llama_cpp") return servers.llama_cpp ?? false;
  if (model.provider === "lmstudio") return servers.lmstudio ?? false;
  if (model.provider === "vllm") return servers.vllm ?? false;
  if (model.provider) return await isProviderConfigured(model.provider);
  return true;
}

async function getRecommendedModels(
  checkServers: boolean
): Promise<UnifiedModel[]> {
  const models = [...RECOMMENDED_MODELS];
  if (!checkServers) return models;
  const servers = await getServerAvailability();
  const filtered: UnifiedModel[] = [];
  for (const model of models) {
    if (await serverAllowsModel(model, servers)) {
      filtered.push(model);
    }
  }
  return filtered;
}

function selectRecommended(
  modality: RecommendedUnifiedModel["modality"],
  task?: RecommendedUnifiedModel["task"]
): UnifiedModel[] {
  return RECOMMENDED_MODELS.filter(
    (model) => model.modality === modality && (!task || model.task === task)
  );
}

function toUnifiedLanguageModel(model: {
  id: string;
  name: string;
  provider: string;
}): UnifiedModel {
  return {
    id: model.id,
    type: "language_model",
    name: model.name,
    repo_id: null,
    path: model.id,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider]
  };
}

function toUnifiedModel(
  model: { id: string; name: string; provider: string },
  type: string
): UnifiedModel {
  return {
    id: model.id,
    type,
    name: model.name,
    repo_id: null,
    path: model.id,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider]
  };
}

function toOllamaModel(model: { id: string; name: string }) {
  return {
    type: "llama_model",
    name: model.name,
    repo_id: model.id,
    modified_at: "",
    size: 0,
    digest: "",
    details: {} as Record<string, unknown>
  };
}

async function getAllModels(userId: string): Promise<UnifiedModel[]> {
  const all: UnifiedModel[] = [];

  all.push(...RECOMMENDED_MODELS);

  const availableIds = await getAvailableProviderIds(userId);
  for (const providerId of availableIds) {
    try {
      const instance = await instantiateProvider(providerId, userId);
      if (!instance) continue;
      const models = await instance.getAvailableLanguageModels();
      all.push(...models.map(toUnifiedLanguageModel));
    } catch {
      // Provider unavailable — skip
    }
  }

  if (!isProduction()) {
    try {
      const hfModels = await readCachedHfModels();
      all.push(...hfModels);
    } catch {
      // HF models unavailable — continue without them
    }
  }

  return dedupeModels(all);
}

async function checkHfCache(body: {
  repo_id: string;
  allow_pattern?: string | string[] | null;
  ignore_pattern?: string | string[] | null;
}) {
  const allowPatterns = normalizePatterns(body.allow_pattern);
  const ignorePatterns = normalizePatterns(body.ignore_pattern);
  const files = await listRepoCachedFiles(body.repo_id);

  const missing: string[] = [];
  if (allowPatterns) {
    for (const pattern of allowPatterns) {
      const matched = files.some(
        (path) =>
          matchesPattern(path, pattern) && !isIgnored(path, ignorePatterns)
      );
      if (!matched) {
        missing.push(pattern);
      }
    }
  }

  return {
    repo_id: body.repo_id,
    all_present: missing.length === 0,
    total_files: files.length,
    missing
  };
}

// ── Router ─────────────────────────────────────────────────────────

export const modelsRouter = router({
  /**
   * List providers and their capabilities.
   */
  providers: protectedProcedure
    .output(providersOutput)
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const infos: Array<{ provider: string; capabilities: string[] }> = [];
      for (const providerId of await getAvailableProviderIds(userId)) {
        const instance = await instantiateProvider(providerId, userId);
        if (!instance) continue;
        infos.push({ provider: providerId, capabilities: ["generate_message", "generate_messages"] });
      }
      return infos;
    }),

  /**
   * Get recommended models, optionally checking local server availability.
   */
  recommended: protectedProcedure
    .input(recommendedInput)
    .query(async ({ input }) => {
      return getRecommendedModels(input.check_servers ?? false);
    }),

  /**
   * Recommended image models (all tasks).
   */
  recommendedImage: protectedProcedure
    .query(() => selectRecommended("image")),

  /**
   * Recommended text-to-image models.
   */
  recommendedImageTextToImage: protectedProcedure
    .query(() => selectRecommended("image", "text_to_image")),

  /**
   * Recommended image-to-image models.
   */
  recommendedImageImageToImage: protectedProcedure
    .query(() => selectRecommended("image", "image_to_image")),

  /**
   * Recommended language models (all tasks).
   */
  recommendedLanguage: protectedProcedure
    .query(() => selectRecommended("language")),

  /**
   * Recommended text-generation models.
   */
  recommendedLanguageTextGeneration: protectedProcedure
    .query(() => selectRecommended("language", "text_generation")),

  /**
   * Recommended embedding models.
   */
  recommendedLanguageEmbedding: protectedProcedure
    .query(() => selectRecommended("language", "embedding")),

  /**
   * Recommended ASR models.
   */
  recommendedAsr: protectedProcedure
    .query(() => selectRecommended("asr")),

  /**
   * Recommended TTS models.
   */
  recommendedTts: protectedProcedure
    .query(() => selectRecommended("tts")),

  /**
   * Recommended text-to-video models.
   */
  recommendedVideoTextToVideo: protectedProcedure
    .query(() => selectRecommended("video", "text_to_video")),

  /**
   * Recommended image-to-video models.
   */
  recommendedVideoImageToVideo: protectedProcedure
    .query(() => selectRecommended("video", "image_to_video")),

  /**
   * All models (recommended + provider models + HF cached).
   */
  all: protectedProcedure
    .query(async ({ ctx }) => getAllModels(ctx.userId)),

  /**
   * HuggingFace cached models.
   */
  huggingfaceList: protectedProcedure
    .output(modelsListOutput)
    .query(async () => {
      if (isProduction()) return [];
      try {
        return await readCachedHfModels();
      } catch {
        return [];
      }
    }),

  /**
   * Delete a HuggingFace cached model.
   */
  huggingfaceDelete: protectedProcedure
    .input(hfDeleteInput)
    .output(z.boolean())
    .mutation(async ({ input }) => {
      if (isProduction()) return false;
      try {
        return await deleteCachedHfModel(input.repo_id);
      } catch {
        return false;
      }
    }),

  /**
   * Search HuggingFace cached models.
   */
  huggingfaceSearch: protectedProcedure
    .input(hfSearchInput)
    .output(modelsListOutput)
    .query(async ({ input }) => {
      if (isProduction()) return [];
      const rawQuery = input.query;
      const type = input.type;
      const query =
        rawQuery && !rawQuery.includes("*") ? `*${rawQuery}*` : rawQuery;
      try {
        return await searchCachedHfModels(
          query ? [query] : undefined,
          type ? [type] : undefined
        );
      } catch {
        return [];
      }
    }),

  /**
   * HuggingFace models by type.
   */
  huggingfaceByType: protectedProcedure
    .input(hfByTypeInput)
    .output(modelsListOutput)
    .query(async ({ input }) => {
      try {
        return await getModelsByHfType(input.model_type);
      } catch {
        return [];
      }
    }),

  /**
   * Ollama models.
   */
  ollama: protectedProcedure
    .output(ollamaModelsOutput)
    .query(async ({ ctx }) => {
      try {
        const instance = await instantiateProvider("ollama", ctx.userId);
        if (!instance) return [];
        const models = await instance.getAvailableLanguageModels();
        return models.map(toOllamaModel);
      } catch {
        return [];
      }
    }),

  /**
   * LLM models by provider.
   */
  llmByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      try {
        const instance = await instantiateProvider(
          input.provider as ProviderId,
          ctx.userId
        );
        if (!instance) return [];
        const models = await instance.getAvailableLanguageModels();
        return models.map(toUnifiedLanguageModel);
      } catch {
        return [];
      }
    }),

  /**
   * Image models by provider.
   */
  imageByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      try {
        const instance = await instantiateProvider(
          input.provider as ProviderId,
          ctx.userId
        );
        if (!instance) return [];
        const models = await instance.getAvailableImageModels();
        return models.map((m) => toUnifiedModel(m, "image_model"));
      } catch {
        return [];
      }
    }),

  /**
   * All TTS models across all providers.
   */
  tts: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map(async (providerId) => {
        try {
          const instance = await instantiateProvider(providerId, ctx.userId);
          if (!instance) return [];
          const models = await instance.getAvailableTTSModels();
          return models.map((m) => toUnifiedModel(m, "tts_model"));
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  }),

  /**
   * TTS models by provider.
   */
  ttsByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      try {
        const instance = await instantiateProvider(
          input.provider as ProviderId,
          ctx.userId
        );
        if (!instance) return [];
        const models = await instance.getAvailableTTSModels();
        return models.map((m) => toUnifiedModel(m, "tts_model"));
      } catch {
        return [];
      }
    }),

  /**
   * All ASR models across all providers.
   */
  asr: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map(async (providerId) => {
        try {
          const instance = await instantiateProvider(providerId, ctx.userId);
          if (!instance) return [];
          const models = await instance.getAvailableASRModels();
          return models.map((m) => toUnifiedModel(m, "asr_model"));
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  }),

  /**
   * ASR models by provider.
   */
  asrByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      try {
        const instance = await instantiateProvider(
          input.provider as ProviderId,
          ctx.userId
        );
        if (!instance) return [];
        const models = await instance.getAvailableASRModels();
        return models.map((m) => toUnifiedModel(m, "asr_model"));
      } catch {
        return [];
      }
    }),

  /**
   * All video models across all providers.
   */
  video: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map(async (providerId) => {
        try {
          const instance = await instantiateProvider(providerId, ctx.userId);
          if (!instance) return [];
          const models = await instance.getAvailableVideoModels();
          return models.map((m) => toUnifiedModel(m, "video_model"));
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  }),

  /**
   * Video models by provider.
   */
  videoByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      try {
        const instance = await instantiateProvider(
          input.provider as ProviderId,
          ctx.userId
        );
        if (!instance) return [];
        const models = await instance.getAvailableVideoModels();
        return models.map((m) => toUnifiedModel(m, "video_model"));
      } catch {
        return [];
      }
    }),

  /**
   * Embedding models by provider.
   */
  embeddingByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      try {
        const instance = await instantiateProvider(
          input.provider as ProviderId,
          ctx.userId
        );
        if (!instance) return [];
        const models = await instance.getAvailableEmbeddingModels();
        return models.map((m) => toUnifiedModel(m, "embedding_model"));
      } catch {
        return [];
      }
    }),

  /**
   * Ollama model info (stub).
   */
  ollamaModelInfo: protectedProcedure.output(z.null()).query(() => null),

  /**
   * Check whether specific files exist in the HuggingFace cache.
   */
  huggingfaceTryCacheFiles: protectedProcedure
    .input(tryCacheFilesInput)
    .output(tryCacheFilesOutput)
    .mutation(async ({ input }) => {
      return Promise.all(
        input.map(async (entry) => {
          const repoId = entry.repo_id ?? "";
          const repoPath = entry.path ?? "";
          return {
            repo_id: repoId,
            path: repoPath,
            downloaded:
              repoId.length > 0 && repoPath.length > 0
                ? await repoFileInCache(repoId, repoPath)
                : false
          };
        })
      );
    }),

  /**
   * Check whether repos have cached files.
   */
  huggingfaceTryCacheRepos: protectedProcedure
    .input(tryCacheReposInput)
    .output(tryCacheReposOutput)
    .mutation(async ({ input }) => {
      return Promise.all(
        input.map(async (repoId) => ({
          repo_id: repoId,
          downloaded: await hasCachedFiles(repoId)
        }))
      );
    }),

  /**
   * Detailed check whether specific patterns exist in the HuggingFace cache.
   */
  huggingfaceCheckCache: protectedProcedure
    .input(hfCacheCheckInput)
    .output(hfCacheCheckOutput)
    .mutation(async ({ input }) => checkHfCache(input)),

  /**
   * Fast batch cache status check for multiple models.
   */
  huggingfaceCacheStatus: protectedProcedure
    .input(hfFastCacheStatusInput)
    .output(hfFastCacheStatusOutput)
    .mutation(async ({ input }) => {
      return Promise.all(
        input.map(async (item) => {
          const allowPatterns = normalizePatterns(item.allow_patterns);
          const ignorePatterns = normalizePatterns(item.ignore_patterns);

          if (item.model_type && LLAMA_CPP_MODEL_TYPES.has(item.model_type)) {
            if (!item.path) return { key: item.key, downloaded: false };
            return {
              key: item.key,
              downloaded: await isLlamaCppModelCached(item.repo_id, item.path)
            };
          }

          if (item.path) {
            return {
              key: item.key,
              downloaded: await repoFileInCache(item.repo_id, item.path)
            };
          }

          const files = await listRepoCachedFiles(item.repo_id);
          return {
            key: item.key,
            downloaded: isDownloadedFromFiles(
              files,
              allowPatterns,
              ignorePatterns
            )
          };
        })
      );
    }),

  /**
   * Pull an Ollama model (stub — streaming not supported via tRPC).
   */
  pullOllamaModel: protectedProcedure
    .input(z.object({ model: z.string().min(1) }))
    .output(
      z.object({
        status: z.string(),
        message: z.string()
      })
    )
    .mutation(() => ({
      status: "unavailable",
      message:
        "Streaming Ollama model pulls are not available in the TS standalone server. Use the Ollama API directly or the Python backend."
    })),

  /**
   * Get HuggingFace file info (size, sha256, etc.).
   */
  huggingfaceFileInfo: protectedProcedure
    .input(hfFileInfoInput)
    .output(z.array(z.record(z.string(), z.unknown())))
    .mutation(async ({ input }) => {
      if (isProduction()) return [];
      try {
        const token = (await getSecret("HF_TOKEN", "1")) ?? undefined;
        const infos = await getHuggingfaceFileInfos(
          input.map((i) => ({ repo_id: i.repo_id, path: i.path })),
          token
        );
        return infos as unknown as Record<string, unknown>[];
      } catch {
        return [];
      }
    })
});
