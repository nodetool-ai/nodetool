import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  getProvider,
  getRegisteredProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  RECOMMENDED_MODELS,
  OLLAMA_DEFAULT_URL,
  LMSTUDIO_DEFAULT_URL,
  type ASRModel,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
  type MusicModel,
  type ProviderId,
  type RecommendedUnifiedModel,
  type TTSModel,
  type VideoModel
} from "@nodetool-ai/runtime";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { WorkerManager } from "@nodetool-ai/compute";
import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos,
  resolveWorkerHfToken,
  type HFFileRequest
} from "@nodetool-ai/huggingface";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import {
  modelRankings,
  rankedForTask,
  type ModelRankingsArtifact
} from "@nodetool-ai/model-pricing";
import {
  readyProviderExecution,
  resolveModelExecutionAvailability,
  type ProviderExecutionInfo
} from "./model-execution-availability.js";

export type { UnifiedModel };

/**
 * Optional dependencies threaded into the model routes so worker-scoped
 * requests can reach the attached worker. When absent, only `scope=local`
 * (the default) works and worker-scope requests fail with a clear `409`.
 */
export interface ModelsApiDeps {
  pythonBridge?: PythonBridge;
  workerManager?: WorkerManager;
}

/**
 * A `scope=worker` request needs an attached worker whose image speaks the
 * `models.*` bridge protocol. Returns the bridge on success, or a 409 Response
 * describing why the worker view is unavailable.
 */
async function requireWorkerBridge(
  deps: ModelsApiDeps
): Promise<PythonBridge | Response> {
  if (!deps.workerManager) {
    // Server wiring problem, not a runtime state the client can act on.
    return errorResponse(
      500,
      "Worker support is not configured on this server"
    );
  }
  const active = await deps.workerManager.getActiveWorker();
  if (!active) {
    return errorResponse(409, "No worker attached");
  }
  const bridge = deps.pythonBridge;
  if (!bridge || !bridge.supportsModelManagement()) {
    return errorResponse(
      409,
      "This worker's image is too old for model management. Upgrade the worker image."
    );
  }
  return bridge;
}

interface RepoPath {
  repo_id: string;
  path: string;
  downloaded: boolean;
}

interface CachedRepo {
  repo_id: string;
  downloaded: boolean;
}

interface ProviderInfo {
  provider: ProviderId;
  capabilities: string[];
  access: "in_process" | "local_service" | "remote_api";
  display_name: string;
}

interface HFCacheCheckRequest {
  repo_id: string;
  allow_pattern?: string | string[] | null;
  ignore_pattern?: string | string[] | null;
}

interface HFCacheCheckResponse {
  repo_id: string;
  all_present: boolean;
  total_files: number;
  missing: string[];
}

interface HFFastCacheStatusRequest {
  key: string;
  repo_id: string;
  model_type?: string | null;
  path?: string | null;
  allow_patterns?: string | string[] | null;
  ignore_patterns?: string | string[] | null;
}

interface HFFastCacheStatusResponse {
  key: string;
  downloaded: boolean;
}

const LLAMA_CPP_MODEL_TYPES = new Set([
  "llama_cpp_model",
  "llama_cpp",
  "hf.gguf"
]);

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

function errorResponse(
  status: number,
  detail: string | Record<string, unknown>
): Response {
  return jsonResponse({ detail }, { status });
}

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
  if (isString(patterns)) return patterns ? [patterns] : null;
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
  // HF_HUB_CACHE (modern) and HUGGINGFACE_HUB_CACHE already point AT the hub
  // directory that holds the `models--*` folders — they are used verbatim.
  // Only HF_HOME needs `/hub` appended. Appending it to the hub-cache vars
  // (the previous behavior) probed one level too deep, so every model showed as
  // not-downloaded. Mirrors electron/src/fileExplorer.ts.
  const hubDir = process.env.HF_HUB_CACHE ?? process.env.HUGGINGFACE_HUB_CACHE;
  if (hubDir) return hubDir;
  const hfHome = process.env.HF_HOME;
  if (hfHome) return join(hfHome, "hub");
  return join(homedir(), ".cache", "huggingface", "hub");
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

/**
 * Join `child` under `dir` but return null if the result escapes `dir` (a
 * caller-supplied "../.." path). Prevents the HF/llama cache-lookup helpers from
 * probing arbitrary host paths — a filesystem file-existence oracle otherwise.
 */
function safeJoinWithin(dir: string, child: string): string | null {
  const joined = join(dir, child);
  const rel = relative(dir, joined);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return joined;
  return null;
}

async function repoFileInCache(
  repoId: string,
  relativePath: string
): Promise<boolean> {
  const snapshotDirs = await listSnapshotDirs(repoId);
  const checks = await Promise.all(
    snapshotDirs.map((snapshotDir) => {
      const target = safeJoinWithin(snapshotDir, relativePath);
      return target ? pathExists(target) : Promise.resolve(false);
    })
  );
  return checks.some((exists) => exists);
}

async function listRepoCachedFiles(repoId: string): Promise<string[]> {
  const snapshotDirs = await listSnapshotDirs(repoId);
  const collected = new Set<string>();

  async function walk(root: string, current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    const promises = entries.map(async (entry) => {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(root, full);
        return;
      }
      if (entry.isFile() || entry.isSymbolicLink()) {
        const rel = full.slice(root.length + 1).replaceAll("\\", "/");
        collected.add(rel);
      }
    });
    await Promise.all(promises);
  }

  await Promise.all(snapshotDirs.map((dir) => walk(dir, dir)));

  return [...collected];
}

async function hasCachedFiles(repoId: string): Promise<boolean> {
  return (await listRepoCachedFiles(repoId)).length > 0;
}

function toUnifiedLanguageModel(model: LanguageModel): UnifiedModel {
  const registration = getRegisteredProvider(model.provider);
  return {
    id: model.id,
    type: "language_model",
    name: model.name,
    provider: model.provider,
    repo_id: null,
    path: null,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider],
    execution: registration
      ? readyProviderExecution(registration.metadata)
      : null
  };
}

function toUnifiedModel(
  model:
    | LanguageModel
    | ImageModel
    | VideoModel
    | TTSModel
    | ASRModel
    | MusicModel
    | EmbeddingModel,
  type: string
): UnifiedModel {
  const tts = type === "tts_model" ? (model as TTSModel) : null;
  const registration = getRegisteredProvider(model.provider);
  return {
    id: model.id,
    type,
    name: model.name,
    provider: model.provider,
    repo_id: null,
    path: null,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider],
    voices: tts?.voices ?? null,
    capabilities: tts?.capabilities ?? null,
    languages: tts?.languages ?? null,
    sample_rate: tts?.sampleRate ?? null,
    requires_reference_text: tts?.requiresReferenceText ?? null,
    adapter: tts?.adapter
      ? {
          state: tts.adapter.state,
          reason_code: tts.adapter.reasonCode ?? null,
          reason: tts.adapter.reason ?? null,
          artifact_ref: tts.adapter.artifactRef
            ? {
                source: tts.adapter.artifactRef.source,
                repo_id: tts.adapter.artifactRef.repoId,
                revision: tts.adapter.artifactRef.revision ?? null,
                path: tts.adapter.artifactRef.path ?? null
              }
            : null
        }
      : null,
    execution: registration
      ? readyProviderExecution(registration.metadata)
      : null
  };
}

function toOllamaModel(model: LanguageModel) {
  return {
    type: "llama_model",
    name: model.name,
    repo_id: model.id,
    modified_at: "",
    size: 0,
    digest: "",
    details: {}
  };
}

// ---------------------------------------------------------------------------
// Provider access — delegates to the runtime's single provider registry.
// No duplicate registry here; the runtime's registerProvider() calls in
// providers/index.ts are the single source of truth.
// ---------------------------------------------------------------------------

import { PythonProvider, registerProvider } from "@nodetool-ai/runtime";
import { isString } from "./lib/wire-values.js";

/**
 * Register Python-only providers (HuggingFace Local, MLX) discovered
 * via the Python stdio bridge. Call after the bridge has connected.
 */
export async function registerPythonProviders(
  bridge: PythonBridge
): Promise<string[]> {
  const providers = await bridge.listProviders();
  const registered: string[] = [];
  for (const info of providers) {
    const existingIds = listRegisteredProviderIds();
    // The TypeScript runtime already owns `huggingface` for the hosted
    // Inference API, while the Python worker uses the same id for local model
    // execution. Keep both available under stable public ids and retain the
    // worker id separately for bridge calls.
    const publicId =
      info.id === "huggingface" && existingIds.includes(info.id)
        ? "huggingface-local"
        : info.id;
    if (existingIds.includes(publicId)) continue;
    const secrets: Record<string, string> = {};
    registerProvider(
      publicId,
      PythonProvider as any,
      {
        _bridge: bridge,
        _id: publicId,
        _bridgeProviderId: info.id,
        ...secrets
      },
      {},
      {
        access: info.access ?? "in_process",
        displayName: info.display_name ?? publicId
      }
    );
    registered.push(publicId);
  }
  return registered;
}

function secretResolverFor(userId: string) {
  return (key: string) =>
    getStoredSecret(key, userId).then((v) => v ?? undefined);
}

/** Returns only providers whose required credentials are present (env or DB) for the given user. */
async function getAvailableProviderIds(userId = "1"): Promise<ProviderId[]> {
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
  userId = "1"
): Promise<BaseProvider | null> {
  const getSecret = secretResolverFor(userId);
  if (!(await isProviderConfigured(provider, getSecret))) return null;
  try {
    return await getProvider(provider, getSecret);
  } catch {
    return null;
  }
}

async function getProvidersInfo(userId = "1"): Promise<ProviderInfo[]> {
  const providerIds = await getAvailableProviderIds(userId);
  const infos = await Promise.all(
    providerIds.map(async (provider) => {
      const instance = await instantiateProvider(provider, userId);
      if (!instance) return null;
      const metadata = getRegisteredProvider(provider)?.metadata;
      return {
        provider,
        capabilities: instance.getCapabilities() as string[],
        access: metadata?.access ?? "remote_api",
        display_name: metadata?.displayName ?? provider
      };
    })
  );
  return infos.filter((info): info is ProviderInfo => info !== null);
}

async function withProvider<T>(
  provider: ProviderId,
  run: (instance: BaseProvider) => Promise<T>,
  userId = "1"
): Promise<T> {
  const instance = await instantiateProvider(provider, userId);
  if (!instance) {
    throw new Error(`Provider ${provider} not available`);
  }
  return run(instance);
}

async function getLanguageModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<LanguageModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableLanguageModels(),
      userId
    );
  } catch {
    return [];
  }
}

async function getImageModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<ImageModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableImageModels(),
      userId
    );
  } catch {
    return [];
  }
}

async function getTtsModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<TTSModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableTTSModels(),
      userId
    );
  } catch {
    return [];
  }
}

async function getMusicModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<MusicModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableMusicModels(),
      userId
    );
  } catch {
    return [];
  }
}

async function getAsrModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<ASRModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableASRModels(),
      userId
    );
  } catch {
    return [];
  }
}

async function getVideoModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<VideoModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableVideoModels(),
      userId
    );
  } catch {
    return [];
  }
}

async function getEmbeddingModelsByProvider(
  provider: ProviderId,
  userId = "1"
): Promise<EmbeddingModel[]> {
  try {
    return await withProvider(
      provider,
      (instance) => instance.getAvailableEmbeddingModels(),
      userId
    );
  } catch {
    return [];
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

async function serverAllowsModel(
  model: RecommendedUnifiedModel,
  servers: Record<string, boolean>
): Promise<boolean> {
  // Local server providers need reachability check
  if (model.provider === "ollama") return servers.ollama ?? false;
  if (model.provider === "llama_cpp") return servers.llama_cpp ?? false;
  if (model.provider === "lmstudio") return servers.lmstudio ?? false;
  if (model.provider === "vllm") return servers.vllm ?? false;
  // API-key providers: available if key is set (env or secrets DB)
  if (model.provider)
    return await isProviderConfigured(model.provider, secretResolverFor("1"));
  return true;
}

async function getServerAvailability(): Promise<Record<string, boolean>> {
  // Skip localhost probes in production — local servers won't be available
  if (isProduction()) {
    return { ollama: false, llama_cpp: false, lmstudio: false, vllm: false };
  }

  // Resolve URLs the same way getProvider() does: secret store → env → default.
  // Otherwise a user-set URL in Settings → API Keys wouldn't filter the
  // recommended-models list correctly.
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

async function recommendedModels(
  checkServers: boolean
): Promise<UnifiedModel[]> {
  const models = [...RECOMMENDED_MODELS];
  if (!checkServers) return models;
  const servers = await getServerAvailability();

  const allowedResults = await Promise.all(
    models.map((model) => serverAllowsModel(model, servers))
  );

  return models.filter((_, index) => allowedResults[index]);
}

function selectRecommended(
  modality: RecommendedUnifiedModel["modality"],
  task?: RecommendedUnifiedModel["task"]
): UnifiedModel[] {
  return RECOMMENDED_MODELS.filter(
    (model) => model.modality === modality && (!task || model.task === task)
  );
}

/**
 * The `type` a merged entry carries, by task — the same value the hand-pinned
 * RECOMMENDED_MODELS entries of that task carry. A task absent from this table
 * has no ranked surface here, so the merge is a no-op for it.
 */
const RANKED_TASK_MODEL_TYPE: Record<string, string> = {
  text_to_image: "image_model",
  image_to_image: "image_model",
  text_to_video: "video_model",
  image_to_video: "video_model",
  text_to_speech: "tts_model",
  text_to_music: "music_model"
};

/**
 * Append the ranked leaderboard for one task to the hand-pinned entries that
 * already answer an endpoint. RECOMMENDED_MODELS is the override list: its
 * entries keep their order and always come first; ranked models follow, best
 * rank first.
 *
 * One entry per canonical model, taking its first route — a model reachable
 * through FAL and kie is one row, not two. A canonical model any of whose
 * routes is already pinned is skipped, so an override is never duplicated by
 * the leaderboard.
 *
 * An empty artifact returns `base` unchanged, which is the shipped state until
 * the rankings sync writes a snapshot.
 */
export function mergeRankedRecommendations(
  base: UnifiedModel[],
  task: string,
  artifact: ModelRankingsArtifact = modelRankings
): UnifiedModel[] {
  const type = RANKED_TASK_MODEL_TYPE[task];
  if (!type) return base;

  const seen = new Set(
    base.map((model) => `${model.provider ?? ""}::${model.id}`)
  );
  const merged = [...base];

  for (const entry of rankedForTask(task, artifact)) {
    const keys = entry.routes.map(
      (route) => `${route.provider}::${route.modelId}`
    );
    if (keys.some((key) => seen.has(key))) continue;
    const route = entry.routes[0];
    if (!route) continue;
    for (const key of keys) {
      seen.add(key);
    }
    merged.push({
      id: route.modelId,
      type,
      name: entry.name,
      repo_id: null,
      path: null,
      downloaded: false,
      provider: route.provider
    });
  }

  return merged;
}

async function getAllModels(userId = "1"): Promise<UnifiedModel[]> {
  const all: UnifiedModel[] = [];

  // Always include recommended models as a baseline
  all.push(...RECOMMENDED_MODELS);

  // Include language models from all available providers
  const availableIds = await getAvailableProviderIds(userId);
  const providerModelsPromises = availableIds.map(async (providerId) => {
    try {
      const models = await getLanguageModelsByProvider(providerId, userId);
      return models.map(toUnifiedLanguageModel);
    } catch {
      // Provider unavailable — skip
      return [];
    }
  });

  const providerModelsArrays = await Promise.all(providerModelsPromises);
  for (const models of providerModelsArrays) {
    all.push(...models);
  }

  const localTtsModels = await Promise.all(
    availableIds
      .filter(
        (providerId) =>
          getRegisteredProvider(providerId)?.metadata.access !== "remote_api"
      )
      .map(async (providerId) => {
        try {
          return (await getTtsModelsByProvider(providerId, userId)).map(
            (model) => toUnifiedModel(model, "tts_model")
          );
        } catch {
          return [];
        }
      })
  );
  all.push(...localTtsModels.flat());

  // Include HuggingFace cached/recommended models
  if (!isProduction()) {
    try {
      const hfModels = await readCachedHfModels();
      all.push(...hfModels);
    } catch {
      // HF models unavailable — continue without them
    }
  }

  const configured = new Set(availableIds);
  const providerExecution = new Map<string, ProviderExecutionInfo>();
  for (const providerId of listRegisteredProviderIds()) {
    const metadata = getRegisteredProvider(providerId)?.metadata;
    if (!metadata) continue;
    providerExecution.set(providerId, {
      ...metadata,
      configured: configured.has(providerId)
    });
  }
  return resolveModelExecutionAvailability(
    dedupeModels(all),
    providerExecution
  );
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function pathFromModelsPrefix(pathname: string): string {
  const base = "/api/models";
  if (pathname === base) return "";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return pathname;
}

function parseProvider(path: string, prefix: string): ProviderId | null {
  if (!path.startsWith(prefix)) return null;
  const value = decodeURIComponent(path.slice(prefix.length));
  if (!value) return null;
  return value;
}

async function checkHfCache(
  body: HFCacheCheckRequest
): Promise<HFCacheCheckResponse> {
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
  const checkPromises = snapshots
    .filter((snapshot) => snapshot.isDirectory())
    .map(async (snapshot) => {
      const snapshotDir = join(repoDir, snapshot.name);
      const full = safeJoinWithin(snapshotDir, filePath);
      if (full && (await pathExists(full))) {
        return true;
      }
      // basename() is already contained, but route it through the same guard.
      const byBase = safeJoinWithin(snapshotDir, basename(filePath));
      if (byBase && (await pathExists(byBase))) {
        return true;
      }
      return false;
    });

  const results = await Promise.all(checkPromises);
  return results.some((exists) => exists);
}

async function fastCacheStatus(
  items: HFFastCacheStatusRequest[]
): Promise<HFFastCacheStatusResponse[]> {
  return Promise.all(
    items.map(async (item) => {
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
        downloaded: isDownloadedFromFiles(files, allowPatterns, ignorePatterns)
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Worker-scoped model download relay
// ---------------------------------------------------------------------------

/** Minimal sink the relay writes JSON progress frames to (the /ws/download socket). */
interface DownloadSocket {
  send(data: string): void;
}

/** The `start_download` command JSON, with the optional `scope: "worker"` flag. */
export interface StartDownloadCommand {
  command: string;
  repo_id?: string;
  path?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  model_type?: string | null;
  scope?: string;
}

/**
 * Relay a worker-scoped model download: forward each bridge `progress` frame
 * onto the /ws/download socket using the same JSON shape the local download
 * manager emits, so the web ModelDownloadStore consumes it unchanged.
 *
 * No attached worker (or an image too old for `models.*`) yields an `error`
 * progress frame instead. A mid-download failure (e.g. the worker detaching)
 * surfaces as an `error` frame too.
 *
 * `requestId` is the stable cancel key: it must match the id the web sends in
 * `cancel_download` (`path ? repo_id + "/" + path : repo_id`) so the bridge can
 * correlate a later `cancelModelDownload(requestId)` to this download. The
 * default reproduces that composite so callers that don't track cancellation
 * still get a sensible, matching id.
 */
export async function relayWorkerDownload(
  socket: DownloadSocket,
  bridge: PythonBridge | undefined,
  workerManager: WorkerManager | undefined,
  msg: StartDownloadCommand,
  requestId: string = msg.path
    ? `${msg.repo_id ?? ""}/${msg.path}`
    : (msg.repo_id ?? ""),
  userId: string = "1"
): Promise<void> {
  const repoId = msg.repo_id ?? "";
  // The worker already emits a terminal `error`-status progress frame on
  // failure (forwarded verbatim below); track it so the catch doesn't send a
  // second, redundant error frame.
  let sawError = false;
  const fail = (error: string) => {
    try {
      socket.send(
        JSON.stringify({
          status: "error",
          repo_id: repoId,
          path: msg.path ?? null,
          model_type: msg.model_type ?? null,
          downloaded_bytes: 0,
          total_bytes: 0,
          downloaded_files: 0,
          current_files: [],
          total_files: 0,
          error
        })
      );
    } catch {
      /* socket gone */
    }
  };

  if (!workerManager) {
    fail("Worker support is not configured on this server");
    return;
  }
  const active = await workerManager.getActiveWorker();
  if (!active) {
    fail("No worker attached");
    return;
  }
  if (!bridge || !bridge.supportsModelManagement()) {
    fail("This worker's image is too old for model management.");
    return;
  }

  // The worker has no HuggingFace credential of its own, so a gated repo 401s
  // unless this server supplies one. Resolved here, never taken from `msg` —
  // that JSON comes from the client.
  const token = await resolveWorkerHfToken((key) =>
    getStoredSecret(key, userId)
  );

  try {
    await bridge.downloadModel(
      {
        repo_id: repoId,
        path: msg.path ?? null,
        allow_patterns: msg.allow_patterns ?? null,
        ignore_patterns: msg.ignore_patterns ?? null,
        model_type: msg.model_type ?? null,
        token
      },
      (update) => {
        if (update.status === "error") {
          sawError = true;
        }
        try {
          socket.send(JSON.stringify(update));
        } catch {
          /* socket gone */
        }
      },
      requestId
    );
  } catch (err) {
    // Suppress the redundant error frame if the worker already forwarded one.
    if (!sawError) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }
}
