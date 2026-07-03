import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { TRPCError } from "@trpc/server";
import type { Context } from "../context.js";
import type { PythonBridge } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  RECOMMENDED_MODELS,
  OLLAMA_DEFAULT_URL,
  LMSTUDIO_DEFAULT_URL,
  type ProviderId,
  type RecommendedUnifiedModel
} from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";

function secretResolverFor(userId: string) {
  return (key: string) =>
    getStoredSecret(key, userId).then((v) => v ?? undefined);
}

const log = createLogger("nodetool.websocket.trpc.models");
import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  filterModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos
} from "@nodetool-ai/huggingface";
import {
  getTransformersJsCacheDir,
  isRepoCached,
  recommendedFor,
  scanTransformersJsCache,
  TJS_MODEL_TYPES,
  type TjsModelRef
} from "@nodetool-ai/transformers-js-nodes";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import { MODEL_SEARCH_KINDS } from "@nodetool-ai/protocol";
import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";
import { getSecret } from "@nodetool-ai/models";

// ── Local schemas (mirrored in packages/protocol/src/api-schemas/models.ts) ──

// Mirrors UnifiedModel in @nodetool-ai/protocol. Any field omitted here is
// stripped by the tRPC output validator — which is exactly how the `provider`
// field silently disappeared and broke the client-side provider filter.
const unifiedModelSchema = z.object({
  id: z.string(),
  type: z.string().nullish(),
  name: z.string(),
  provider: z.string().nullish(),
  repo_id: z.string().nullish(),
  path: z.string().nullish(),
  artifact_family: z.string().nullish(),
  artifact_component: z.string().nullish(),
  artifact_confidence: z.number().nullish(),
  artifact_evidence: z.array(z.string()).nullish(),
  cache_path: z.string().nullish(),
  allow_patterns: z.array(z.string()).nullish(),
  ignore_patterns: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  readme: z.string().nullish(),
  downloaded: z.boolean().nullish(),
  size_on_disk: z.number().nullish(),
  pipeline_tag: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  has_model_index: z.boolean().nullish(),
  downloads: z.number().nullish(),
  likes: z.number().nullish(),
  supported_tasks: z.array(z.string()).nullish(),
  trending_score: z.number().nullish(),
  image: z.string().nullish(),
  supports_tools: z.boolean().nullish(),
  voices: z.array(z.string()).nullish(),
  durations: z.array(z.number()).nullish(),
  resolutions: z.array(z.string()).nullish(),
  aspect_ratios: z.array(z.string()).nullish()
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

const hfHubSearchInput = z.object({
  /** Free-text search passed to the Hub's `search` param. */
  query: z.string().optional(),
  /** HF pipeline tag filter, e.g. "audio-text-to-text". */
  pipeline_tag: z.string().optional(),
  /** Max results (Hub caps high; we keep it modest for the UI). */
  limit: z.number().int().min(1).max(100).optional()
});

const hfByTypeInput = z.object({
  model_type: z.string().min(1)
});

const tjsByTypeInput = z.object({
  model_type: z.string().min(1)
});

const hfDeleteInput = z.object({
  repo_id: z.string().min(1)
});

/** Where a model route operates: the local cache (default) or an attached worker. */
const modelScope = z.enum(["local", "worker"]).default("local");

/**
 * Resolve the worker bridge for a `scope: "worker"` request. Requires an
 * attached worker whose image speaks the `models.*` bridge protocol; throws a
 * CONFLICT otherwise so the UI can surface a clear reason.
 */
async function requireWorkerBridge(
  ctx: Pick<Context, "pythonBridge" | "workerManager">
): Promise<PythonBridge> {
  if (!ctx.workerManager) {
    // Server wiring problem, not a runtime state the client can act on.
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Worker support is not configured on this server"
    });
  }
  const active = await ctx.workerManager.getActiveWorker();
  if (!active) {
    throw new TRPCError({ code: "CONFLICT", message: "No worker attached" });
  }
  if (!ctx.pythonBridge.supportsModelManagement()) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This worker's image is too old for model management. Upgrade the worker image."
    });
  }
  return ctx.pythonBridge;
}

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
    const key = `${model.provider ?? ""}::${model.repo_id ?? model.id ?? ""}::${model.path ?? ""}`;
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
  const checks = await Promise.all(
    snapshotDirs.map((snapshotDir) =>
      pathExists(join(snapshotDir, relativePath))
    )
  );
  return checks.some((exists) => exists);
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
  const getSecret = secretResolverFor(userId);
  const checks = await Promise.all(
    ids.map(async (id) => ({
      id,
      available: await isProviderConfigured(id, getSecret)
    }))
  );
  return checks.filter((c) => c.available).map((c) => c.id);
}

async function instantiateProvider(
  provider: ProviderId,
  userId: string
): Promise<ProviderInstance | null> {
  const getSecret = secretResolverFor(userId);
  if (!(await isProviderConfigured(provider, getSecret))) {
    log.debug("Provider not configured", { provider, userId });
    return null;
  }
  try {
    return await getProvider(provider, getSecret);
  } catch (error) {
    log.warn("Provider instantiation failed", {
      provider,
      userId,
      error: summarizeError(error)
    });
    return null;
  }
}

/**
 * Run `fn`, log and return `fallback` on error. Unmasks silent provider
 * failures so the server log shows why a `*ByProvider` query came back empty.
 */
function summarizeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const summary: Record<string, unknown> = {
    name: error.name,
    message: error.message
  };

  const cause = error.cause;
  if (cause instanceof Error) {
    const causeSummary: Record<string, unknown> = {
      name: cause.name,
      message: cause.message
    };

    const causeWithFields = cause as Error & {
      code?: string;
      errno?: number;
      syscall?: string;
      address?: string;
      port?: number;
    };

    if (causeWithFields.code) {
      causeSummary.code = causeWithFields.code;
    }
    if (causeWithFields.errno != null) {
      causeSummary.errno = causeWithFields.errno;
    }
    if (causeWithFields.syscall) {
      causeSummary.syscall = causeWithFields.syscall;
    }
    if (causeWithFields.address) {
      causeSummary.address = causeWithFields.address;
    }
    if (causeWithFields.port != null) {
      causeSummary.port = causeWithFields.port;
    }

    summary.cause = causeSummary;
  }

  return summary;
}

async function safeProviderCall<T>(
  label: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.warn(`${label} failed`, { ...context, error: summarizeError(error) });
    return fallback;
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
  if (isProduction()) {
    return { ollama: false, llama_cpp: false, lmstudio: false, vllm: false };
  }

  // Resolve URLs the same way getProvider() does: secret store → env →
  // default. Otherwise a user-set URL in Settings → API Keys wouldn't filter
  // the recommended-models list correctly.
  const getSecret = secretResolverFor("1");
  const resolve = async (key: string, fallback: string): Promise<string> => {
    const fromStore = await getSecret(key);
    return (fromStore || process.env[key] || fallback).replace(/\/+$/, "");
  };

  const [ollamaUrl, llamaUrl, lmstudioUrl, vllmUrl] = await Promise.all([
    resolve("OLLAMA_API_URL", OLLAMA_DEFAULT_URL),
    resolve("LLAMA_CPP_URL", ""),
    resolve("LMSTUDIO_API_URL", LMSTUDIO_DEFAULT_URL),
    resolve("VLLM_BASE_URL", "")
  ]);

  const [ollama, llama, lmstudio, vllm] = await Promise.all([
    isServerReachable(`${ollamaUrl}/api/tags`),
    llamaUrl
      ? isServerReachable(`${llamaUrl}/v1/models`)
      : Promise.resolve(false),
    isServerReachable(`${lmstudioUrl}/v1/models`),
    vllmUrl ? isServerReachable(`${vllmUrl}/v1/models`) : Promise.resolve(false)
  ]);

  return { ollama, llama_cpp: llama, lmstudio, vllm };
}

async function serverAllowsModel(
  model: RecommendedUnifiedModel,
  servers: Record<string, boolean>
): Promise<boolean> {
  if (model.provider === "ollama") return servers.ollama ?? false;
  if (model.provider === "llama_cpp") return servers.llama_cpp ?? false;
  if (model.provider === "lmstudio") return servers.lmstudio ?? false;
  if (model.provider === "vllm") return servers.vllm ?? false;
  if (model.provider)
    return await isProviderConfigured(model.provider, secretResolverFor("1"));
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

interface HfHubModel {
  id?: string;
  modelId?: string;
  pipeline_tag?: string | null;
  tags?: string[];
  downloads?: number;
  likes?: number;
  trendingScore?: number;
  gated?: boolean | string;
}

/** Map a HF Hub API model record onto our UnifiedModel shape. */
function hubModelToUnified(
  m: HfHubModel,
  fallbackTag?: string
): UnifiedModel | null {
  const repoId = m.id ?? m.modelId;
  if (!repoId) return null;
  const tag = m.pipeline_tag ?? fallbackTag ?? undefined;
  // Hub pipeline tags are dash-cased ("audio-text-to-text"); our model types
  // are the same task underscore-cased and prefixed "hf.".
  const type = tag ? `hf.${tag.replace(/-/g, "_")}` : "hf.model";
  return {
    id: repoId,
    type,
    name: repoId,
    repo_id: repoId,
    provider: "huggingface",
    downloaded: false,
    pipeline_tag: m.pipeline_tag ?? null,
    tags: m.tags ?? null,
    downloads: m.downloads ?? null,
    likes: m.likes ?? null,
    trending_score: m.trendingScore ?? null
  };
}

/**
 * Search the live HuggingFace Hub (https://huggingface.co/api/models) by
 * free-text and/or pipeline tag. Returns downloadable repos sorted by
 * popularity. Network/HTTP failures degrade to an empty list.
 */
async function searchHuggingFaceHub(
  query: string | undefined,
  pipelineTag: string | undefined,
  limit: number
): Promise<UnifiedModel[]> {
  if (!query && !pipelineTag) return [];
  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (pipelineTag) params.set("pipeline_tag", pipelineTag);
  params.set("limit", String(limit));
  params.set("sort", "downloads");
  params.set("direction", "-1");

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://huggingface.co/api/models?${params.toString()}`,
      { headers }
    );
    if (!res.ok) {
      log.warn("HF Hub search failed: %d %s", res.status, res.statusText);
      return [];
    }
    const data = (await res.json()) as HfHubModel[];
    return data
      .map((m) => hubModelToUnified(m, pipelineTag))
      .filter((m): m is UnifiedModel => m !== null);
  } catch (err) {
    log.warn("HF Hub search error: %s", (err as Error).message);
    return [];
  }
}

function selectRecommended(
  modality: RecommendedUnifiedModel["modality"],
  task?: RecommendedUnifiedModel["task"]
): UnifiedModel[] {
  return RECOMMENDED_MODELS.filter(
    (model) => model.modality === modality && (!task || model.task === task)
  );
}

// ── Transformers.js helpers ────────────────────────────────────────

function tjsRefToUnified(
  ref: TjsModelRef,
  modelType: string,
  downloaded: boolean,
  sizeBytes: number | null
): UnifiedModel {
  return {
    id: ref.repo_id,
    type: modelType,
    name: ref.repo_id,
    provider: "transformers_js",
    repo_id: ref.repo_id,
    path: ref.path ?? null,
    downloaded,
    size_on_disk: sizeBytes ?? null
  };
}

/**
 * Find which `tjs.<task>` types each cached repo is recommended under.
 * A repo can match multiple types if listed in several recommended lists
 * (rare, but supported); we just return the set of (type, ref) pairings.
 */
function tjsCachedAsRecommended(repoId: string): TjsModelRef[] {
  const out: TjsModelRef[] = [];
  for (const type of TJS_MODEL_TYPES) {
    const match = recommendedFor(type).find((r) => r.repo_id === repoId);
    if (match) out.push(match);
  }
  return out;
}

function toUnifiedLanguageModel(
  model: {
    id: string;
    name: string;
    provider: string;
  },
  supportsTools?: boolean | null
): UnifiedModel {
  return {
    id: model.id,
    type: "language_model",
    name: model.name,
    provider: model.provider,
    repo_id: null,
    path: null,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider],
    supports_tools: supportsTools ?? null
  };
}

function toUnifiedModel(
  model: {
    id: string;
    name: string;
    provider: string;
    voices?: string[];
    supportedTasks?: string[];
    durations?: number[];
    resolutions?: string[];
    aspectRatios?: string[];
  },
  type: string
): UnifiedModel {
  return {
    id: model.id,
    type,
    name: model.name,
    provider: model.provider,
    repo_id: null,
    path: null,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider],
    voices: model.voices ?? null,
    supported_tasks: model.supportedTasks ?? null,
    durations: model.durations ?? null,
    resolutions: model.resolutions ?? null,
    aspect_ratios: model.aspectRatios ?? null
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
  const providerModelsPromises = availableIds.map(async (providerId) => {
    try {
      const instance = await instantiateProvider(providerId, userId);
      if (!instance) return [];
      const models = await instance.getAvailableLanguageModels();
      const toolFlags = await Promise.all(
        models.map((m) =>
          instance
            .hasToolSupport(m.id)
            .catch(() => null as boolean | null)
        )
      );
      return models.map((m, i) => toUnifiedLanguageModel(m, toolFlags[i]));
    } catch {
      // Provider unavailable — skip
      return [];
    }
  });

  const providerModelsArrays = await Promise.all(providerModelsPromises);
  for (const models of providerModelsArrays) {
    all.push(...models);
  }

  if (!isProduction()) {
    try {
      const hfModels = await readCachedHfModels();
      all.push(...hfModels);
    } catch {
      // HF models unavailable — continue without them
    }

    try {
      const cached = await scanTransformersJsCache(getTransformersJsCacheDir());
      for (const c of cached) {
        // Surface each cached repo under its first matched recommended type
        // (e.g. "tjs.text_generation") so it lands in the right sidebar bucket;
        // fall back to "tjs.cached" for repos not in any recommended list.
        const recommendedTypes = TJS_MODEL_TYPES.filter((t) =>
          recommendedFor(t).some((r) => r.repo_id === c.repo_id)
        );
        const modelType = recommendedTypes[0] ?? "tjs.cached";
        all.push(
          tjsRefToUnified({ repo_id: c.repo_id }, modelType, true, c.size_bytes)
        );
      }
    } catch {
      // Transformers.js cache unavailable — continue without it
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

// ── availableForKind helpers ───────────────────────────────────────

const availableForKindInput = z.object({
  kind: z.enum(MODEL_SEARCH_KINDS)
});

type ModelSearchKind = (typeof MODEL_SEARCH_KINDS)[number];

const KIND_TO_MODALITY: Record<ModelSearchKind, RecommendedUnifiedModel["modality"]> = {
  text_generation: "language",
  embedding: "language",
  text_to_image: "image",
  image_to_image: "image",
  text_to_speech: "tts",
  text_to_music: "music",
  speech_to_text: "asr",
  text_to_video: "video",
  image_to_video: "video"
};

async function collectProviderModelsForKind(
  userId: string,
  kind: ModelSearchKind
): Promise<UnifiedModel[]> {
  const out: UnifiedModel[] = [];
  const providerIds = await getAvailableProviderIds(userId);
  for (const providerId of providerIds) {
    await safeProviderCall(
      "availableForKind",
      { provider: providerId, kind, userId },
      async () => {
        const instance = await instantiateProvider(providerId, userId);
        if (!instance) return;
        switch (kind) {
          case "text_generation": {
            const models = await instance.getAvailableLanguageModels();
            const toolFlags = await Promise.all(
              models.map((m) =>
                instance.hasToolSupport(m.id).catch(() => null as boolean | null)
              )
            );
            models.forEach((m, i) =>
              out.push(toUnifiedLanguageModel(m, toolFlags[i]))
            );
            return;
          }
          case "embedding": {
            const models = await instance.getAvailableEmbeddingModels();
            for (const m of models) out.push(toUnifiedModel(m, "embedding_model"));
            return;
          }
          case "text_to_image":
          case "image_to_image": {
            const models = await instance.getAvailableImageModels();
            for (const m of models) {
              if (m.supportedTasks && !m.supportedTasks.includes(kind)) continue;
              out.push(toUnifiedModel(m, "image_model"));
            }
            return;
          }
          case "text_to_speech": {
            const models = await instance.getAvailableTTSModels();
            for (const m of models) out.push(toUnifiedModel(m, "tts_model"));
            return;
          }
          case "text_to_music": {
            const models = await instance.getAvailableMusicModels();
            for (const m of models) out.push(toUnifiedModel(m, "music_model"));
            return;
          }
          case "speech_to_text": {
            const models = await instance.getAvailableASRModels();
            for (const m of models) out.push(toUnifiedModel(m, "asr_model"));
            return;
          }
          case "text_to_video":
          case "image_to_video": {
            const models = await instance.getAvailableVideoModels();
            for (const m of models) {
              if (m.supportedTasks && !m.supportedTasks.includes(kind)) continue;
              out.push(toUnifiedModel(m, "video_model"));
            }
            return;
          }
        }
      },
      undefined
    );
  }
  return out;
}

function curatedForKind(kind: ModelSearchKind): UnifiedModel[] {
  const modality = KIND_TO_MODALITY[kind];
  // For text_generation/embedding/image/video, RECOMMENDED_MODELS entries are
  // tagged with the specific task. TTS, ASR and music entries have no task
  // field — modality alone is enough.
  const taskRequired =
    kind !== "text_to_speech" &&
    kind !== "speech_to_text" &&
    kind !== "text_to_music";
  return RECOMMENDED_MODELS.filter(
    (r) => r.modality === modality && (!taskRequired || r.task === kind)
  );
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
        infos.push({
          provider: providerId,
          capabilities: instance.getCapabilities()
        });
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
   * Recommended music-generation models.
   */
  recommendedMusic: protectedProcedure
    .query(() => selectRecommended("music")),

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
   * All models available to the user for a given task kind. Aggregates the
   * configured providers' enumerated models and merges the curated
   * RECOMMENDED_MODELS list as a fallback. Deduped by `(provider, id)`.
   * Powers `ui_search_models` for the workflow-builder agent.
   */
  availableForKind: protectedProcedure
    .input(availableForKindInput)
    .query(async ({ ctx, input }) => {
      const fromProviders = await collectProviderModelsForKind(
        ctx.userId,
        input.kind
      );
      const curated = curatedForKind(input.kind);
      const seen = new Set<string>();
      const deduped: UnifiedModel[] = [];
      for (const m of [...fromProviders, ...curated]) {
        const key = `${m.provider ?? ""}|${m.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(m);
      }
      return deduped;
    }),

  /**
   * All models (recommended + provider models + HF cached).
   */
  all: protectedProcedure
    .query(async ({ ctx }) => getAllModels(ctx.userId)),

  /**
   * HuggingFace cached models. `scope: "worker"` lists the attached worker's
   * cache via the Python bridge; the default `"local"` scans the local FS.
   */
  huggingfaceList: protectedProcedure
    .input(z.object({ scope: modelScope }).optional())
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      if (input?.scope === "worker") {
        const bridge = await requireWorkerBridge(ctx);
        return (await bridge.listCachedModels()) as UnifiedModel[];
      }
      if (isProduction()) return [];
      try {
        return await readCachedHfModels();
      } catch {
        return [];
      }
    }),

  /**
   * Delete a HuggingFace cached model. `scope: "worker"` deletes from the
   * attached worker's cache via the Python bridge.
   */
  huggingfaceDelete: protectedProcedure
    .input(hfDeleteInput.extend({ scope: modelScope }))
    .output(z.boolean())
    .mutation(async ({ ctx, input }) => {
      if (input.scope === "worker") {
        const bridge = await requireWorkerBridge(ctx);
        return bridge.deleteCachedModel(input.repo_id);
      }
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
   * Search the live HuggingFace Hub by free-text and/or pipeline tag.
   * Unlike `huggingfaceSearch` (which only scans the local cache), this hits
   * the online Hub so the Model Manager can browse & download any public repo.
   */
  huggingfaceHubSearch: protectedProcedure
    .input(hfHubSearchInput)
    .output(modelsListOutput)
    .query(async ({ input }) => {
      return await searchHuggingFaceHub(
        input.query,
        input.pipeline_tag,
        input.limit ?? 50
      );
    }),

  /**
   * HuggingFace models by type.
   */
  huggingfaceByType: protectedProcedure
    .input(hfByTypeInput.extend({ scope: modelScope }))
    .output(modelsListOutput)
    .query(async ({ ctx, input }) => {
      if (input.scope === "worker") {
        const bridge = await requireWorkerBridge(ctx);
        // The worker sends full UnifiedModel JSON; the bridge types it loosely.
        const cached = (await bridge.listCachedModels()) as unknown as Parameters<
          typeof filterModelsByHfType
        >[0];
        return filterModelsByHfType(
          cached,
          input.model_type
        ) as UnifiedModel[];
      }
      try {
        return await getModelsByHfType(input.model_type);
      } catch {
        return [];
      }
    }),

  /**
   * Transformers.js cached models (everything in the configured cache dir).
   */
  transformersJsList: protectedProcedure
    .output(modelsListOutput)
    .query(async () => {
      if (isProduction()) return [];
      try {
        const cached = await scanTransformersJsCache(getTransformersJsCacheDir());
        return cached.map((c) =>
          tjsRefToUnified(
            { repo_id: c.repo_id },
            "tjs.cached",
            true,
            c.size_bytes
          )
        );
      } catch {
        return [];
      }
    }),

  /**
   * Transformers.js models for a given `tjs.<task>` type.
   *
   * Merges the curated recommended list with anything already present in the
   * Transformers.js cache directory. Recommended entries always appear,
   * marked `downloaded` based on cache presence; off-list cached repos that
   * happen to be recommended under another type are NOT shown here (they only
   * show up under their own type or via `transformersJsList`).
   */
  transformersJsByType: protectedProcedure
    .input(tjsByTypeInput)
    .output(modelsListOutput)
    .query(async ({ input }) => {
      if (isProduction()) return [];
      const modelType = input.model_type;
      const recs = recommendedFor(modelType);
      const cacheDir = getTransformersJsCacheDir();

      const cached = await scanTransformersJsCache(cacheDir).catch(() => []);
      const cacheSizes = new Map(cached.map((c) => [c.repo_id, c.size_bytes]));

      const out: UnifiedModel[] = [];
      const seen = new Set<string>();

      for (const ref of recs) {
        out.push(
          tjsRefToUnified(
            ref,
            modelType,
            cacheSizes.has(ref.repo_id),
            cacheSizes.get(ref.repo_id) ?? null
          )
        );
        seen.add(ref.repo_id);
      }

      // Surface any cached repo that isn't recommended for this type but
      // also doesn't have a "home" type — so users see everything they
      // downloaded for this task without losing the recommended sort.
      for (const c of cached) {
        if (seen.has(c.repo_id)) continue;
        const homes = tjsCachedAsRecommended(c.repo_id);
        if (homes.length > 0) continue;
        out.push(
          tjsRefToUnified(
            { repo_id: c.repo_id },
            modelType,
            true,
            c.size_bytes
          )
        );
      }

      return out;
    }),

  /**
   * Recommended Transformers.js models for a given `tjs.<task>` type.
   *
   * Same curated list as the recommended-first half of `transformersJsByType`,
   * minus the off-list cached repos. Used by the model picker's
   * "Recommended downloads" panel so users can see what's worth fetching even
   * if nothing is cached yet.
   */
  transformersJsRecommended: protectedProcedure
    .input(tjsByTypeInput)
    .output(modelsListOutput)
    .query(async ({ input }) => {
      if (isProduction()) return [];
      const modelType = input.model_type;
      const recs = recommendedFor(modelType);
      if (recs.length === 0) return [];

      const cacheDir = getTransformersJsCacheDir();
      const cached = await scanTransformersJsCache(cacheDir).catch(() => []);
      const cacheSizes = new Map(cached.map((c) => [c.repo_id, c.size_bytes]));

      return recs.map((ref) =>
        tjsRefToUnified(
          ref,
          modelType,
          cacheSizes.has(ref.repo_id),
          cacheSizes.get(ref.repo_id) ?? null
        )
      );
    }),

  /**
   * Check whether a single Transformers.js repo is present in the cache.
   */
  transformersJsIsCached: protectedProcedure
    .input(z.object({ repo_id: z.string().min(1) }))
    .output(z.boolean())
    .query(async ({ input }) => {
      if (isProduction()) return false;
      try {
        return await isRepoCached(getTransformersJsCacheDir(), input.repo_id);
      } catch {
        return false;
      }
    }),

  /**
   * Ollama models.
   */
  ollama: protectedProcedure
    .output(ollamaModelsOutput)
    .query(async ({ ctx }) =>
      safeProviderCall(
        "ollama models",
        { provider: "ollama", userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider("ollama", ctx.userId);
          if (!instance) return [];
          const models = await instance.getAvailableLanguageModels();
          return models.map(toOllamaModel);
        },
        []
      )
    ),

  /**
   * LLM models by provider.
   */
  llmByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "llmByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableLanguageModels();
          const toolFlags = await Promise.all(
            models.map((m) =>
              instance
                .hasToolSupport(m.id)
                .catch(() => null as boolean | null)
            )
          );
          return models.map((m, i) =>
            toUnifiedLanguageModel(m, toolFlags[i])
          );
        },
        []
      )
    ),

  /**
   * Aspect ratios / resolutions / (video) durations a given model supports.
   * Empty arrays are intentional — the client falls back to the full static
   * lists when a model declares no constraints.
   */
  mediaOptions: protectedProcedure
    .input(
      z.object({
        provider: z.string().min(1),
        model: z.string().min(1),
        task: z.enum(["image", "video"])
      })
    )
    .output(
      z.object({
        aspectRatios: z.array(z.string()),
        resolutions: z.array(z.string()),
        durations: z.array(z.number()).nullish()
      })
    )
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "mediaOptions",
        { provider: input.provider, task: input.task, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) {
            return { aspectRatios: [], resolutions: [], durations: null };
          }
          if (input.task === "image") {
            const models = await instance.getAvailableImageModels();
            const m = models.find((x) => x.id === input.model);
            return {
              aspectRatios: m?.aspectRatios ?? [],
              resolutions: m?.resolutions ?? [],
              durations: null
            };
          }
          const models = await instance.getAvailableVideoModels();
          const m = models.find((x) => x.id === input.model);
          return {
            aspectRatios: m?.aspectRatios ?? [],
            resolutions: m?.resolutions ?? [],
            durations: m?.durations ?? null
          };
        },
        { aspectRatios: [], resolutions: [], durations: null }
      )
    ),

  /**
   * Image models by provider.
   */
  imageByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "imageByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableImageModels();
          return models.map((m) => toUnifiedModel(m, "image_model"));
        },
        []
      )
    ),

  /**
   * All TTS models across all providers.
   */
  tts: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map((providerId) =>
        safeProviderCall(
          "tts (aggregate)",
          { provider: providerId, userId: ctx.userId },
          async () => {
            const instance = await instantiateProvider(providerId, ctx.userId);
            if (!instance) return [] as UnifiedModel[];
            const models = await instance.getAvailableTTSModels();
            return models.map((m) => toUnifiedModel(m, "tts_model"));
          },
          [] as UnifiedModel[]
        )
      )
    );
    return results.flat();
  }),

  /**
   * TTS models by provider.
   */
  ttsByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "ttsByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableTTSModels();
          return models.map((m) => toUnifiedModel(m, "tts_model"));
        },
        []
      )
    ),

  /**
   * All music-generation models across all providers.
   */
  music: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map((providerId) =>
        safeProviderCall(
          "music (aggregate)",
          { provider: providerId, userId: ctx.userId },
          async () => {
            const instance = await instantiateProvider(providerId, ctx.userId);
            if (!instance) return [] as UnifiedModel[];
            const models = await instance.getAvailableMusicModels();
            return models.map((m) => toUnifiedModel(m, "music_model"));
          },
          [] as UnifiedModel[]
        )
      )
    );
    return results.flat();
  }),

  /**
   * Music-generation models by provider.
   */
  musicByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "musicByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableMusicModels();
          return models.map((m) => toUnifiedModel(m, "music_model"));
        },
        []
      )
    ),

  /**
   * All ASR models across all providers.
   */
  asr: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map((providerId) =>
        safeProviderCall(
          "asr (aggregate)",
          { provider: providerId, userId: ctx.userId },
          async () => {
            const instance = await instantiateProvider(providerId, ctx.userId);
            if (!instance) return [] as UnifiedModel[];
            const models = await instance.getAvailableASRModels();
            return models.map((m) => toUnifiedModel(m, "asr_model"));
          },
          [] as UnifiedModel[]
        )
      )
    );
    return results.flat();
  }),

  /**
   * ASR models by provider.
   */
  asrByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "asrByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableASRModels();
          return models.map((m) => toUnifiedModel(m, "asr_model"));
        },
        []
      )
    ),

  /**
   * All video models across all providers.
   */
  video: protectedProcedure.query(async ({ ctx }) => {
    const availableIds = await getAvailableProviderIds(ctx.userId);
    const results = await Promise.all(
      availableIds.map((providerId) =>
        safeProviderCall(
          "video (aggregate)",
          { provider: providerId, userId: ctx.userId },
          async () => {
            const instance = await instantiateProvider(providerId, ctx.userId);
            if (!instance) return [] as UnifiedModel[];
            const models = await instance.getAvailableVideoModels();
            return models.map((m) => toUnifiedModel(m, "video_model"));
          },
          [] as UnifiedModel[]
        )
      )
    );
    return results.flat();
  }),

  /**
   * Video models by provider.
   */
  videoByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "videoByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableVideoModels();
          return models.map((m) => toUnifiedModel(m, "video_model"));
        },
        []
      )
    ),

  /**
   * Embedding models by provider.
   */
  embeddingByProvider: protectedProcedure
    .input(providerInput)
    .output(modelsListOutput)
    .query(async ({ ctx, input }) =>
      safeProviderCall(
        "embeddingByProvider",
        { provider: input.provider, userId: ctx.userId },
        async () => {
          const instance = await instantiateProvider(
            input.provider as ProviderId,
            ctx.userId
          );
          if (!instance) return [];
          const models = await instance.getAvailableEmbeddingModels();
          return models.map((m) => toUnifiedModel(m, "embedding_model"));
        },
        []
      )
    ),

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
