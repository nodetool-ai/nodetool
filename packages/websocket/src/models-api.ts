import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  BaseProvider,
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  type ASRModel,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
  type ProviderId,
  type TTSModel,
  type VideoModel,
} from "@nodetool/runtime";
import type { PythonStdioBridge } from "@nodetool/runtime";
import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos,
  type HFFileRequest,
} from "@nodetool/huggingface";
import type { UnifiedModel } from "@nodetool/protocol";

export type { UnifiedModel };

interface RecommendedUnifiedModel extends UnifiedModel {
  modality: "language" | "image" | "tts" | "asr" | "video";
  task?: "text_generation" | "embedding" | "text_to_image" | "image_to_image" | "text_to_video" | "image_to_video";
  provider?: ProviderId;
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

const LLAMA_CPP_MODEL_TYPES = new Set(["llama_cpp_model", "llama_cpp", "hf.gguf"]);

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
    provider: "openai",
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
    provider: "anthropic",
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
    provider: "openai",
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
    provider: "openai",
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
    provider: "openai",
  },
  {
    id: "whisper-1",
    type: "asr_model",
    name: "Whisper",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "asr",
    provider: "openai",
  },
  {
    id: "tts-1",
    type: "tts_model",
    name: "TTS 1",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "tts",
    provider: "openai",
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
    provider: "openai",
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
    provider: "openai",
  },
];

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function errorResponse(status: number, detail: string | Record<string, unknown>): Response {
  return jsonResponse({ detail }, { status });
}

function isProduction(): boolean {
  const value = (process.env.NODETOOL_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
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

function normalizePatterns(patterns: string | string[] | null | undefined): string[] | null {
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
      files.some((path) => matchesPattern(path, pattern) && !isIgnored(path, ignorePatterns))
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
  const snapshotsRoot = join(getHfCacheRoot(), repoToCacheDir(repoId), "snapshots");
  if (!(await pathExists(snapshotsRoot))) return [];
  const entries = await readdir(snapshotsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(snapshotsRoot, entry.name));
}

async function repoFileInCache(repoId: string, relativePath: string): Promise<boolean> {
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

function toUnifiedLanguageModel(model: LanguageModel): UnifiedModel {
  return {
    id: model.id,
    type: "language_model",
    name: model.name,
    repo_id: null,
    path: model.id,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider],
  };
}

function toUnifiedModel(
  model: LanguageModel | ImageModel | VideoModel | TTSModel | ASRModel | EmbeddingModel,
  type: string
): UnifiedModel {
  return {
    id: model.id,
    type,
    name: model.name,
    repo_id: null,
    path: model.id,
    downloaded: model.provider === "ollama" || model.provider === "llama_cpp",
    tags: [model.provider],
  };
}

function toOllamaModel(model: LanguageModel): Record<string, unknown> {
  return {
    type: "llama_model",
    name: model.name,
    repo_id: model.id,
    modified_at: "",
    size: 0,
    digest: "",
    details: {},
  };
}

// ---------------------------------------------------------------------------
// Provider access — delegates to the runtime's single provider registry.
// No duplicate registry here; the runtime's registerProvider() calls in
// providers/index.ts are the single source of truth.
// ---------------------------------------------------------------------------

import { PythonProvider, registerProvider } from "@nodetool/runtime";

/**
 * Register Python-only providers (HuggingFace Local, MLX) discovered
 * via the PythonBridge. Call after the bridge has connected.
 */
export async function registerPythonProviders(bridge: PythonStdioBridge): Promise<string[]> {
  const providers = await bridge.listProviders();
  const registered: string[] = [];
  for (const info of providers) {
    if (listRegisteredProviderIds().includes(info.id)) continue;
    const secrets: Record<string, string> = {};
    registerProvider(info.id, PythonProvider as any, { _bridge: bridge, _id: info.id, ...secrets });
    registered.push(info.id);
  }
  return registered;
}

/** Returns only providers whose required credentials are present (env or DB) for the given user. */
async function getAvailableProviderIds(userId = "1"): Promise<ProviderId[]> {
  const ids = listRegisteredProviderIds();
  const checks = await Promise.all(
    ids.map(async (id) => ({
      id,
      available: await isProviderConfigured(id, userId),
    })),
  );
  return checks.filter((c) => c.available).map((c) => c.id);
}

async function instantiateProvider(provider: ProviderId, userId = "1"): Promise<BaseProvider | null> {
  if (!(await isProviderConfigured(provider, userId))) return null;
  try {
    return await getProvider(provider, userId);
  } catch {
    return null;
  }
}

function providerCapabilities(provider: BaseProvider): string[] {
  const capabilities = ["generate_message", "generate_messages"];
  if (provider.getAvailableImageModels !== BaseProvider.prototype.getAvailableImageModels) {
    capabilities.push("text_to_image", "image_to_image");
  }
  if (provider.getAvailableVideoModels !== BaseProvider.prototype.getAvailableVideoModels) {
    capabilities.push("text_to_video", "image_to_video");
  }
  if (provider.getAvailableTTSModels !== BaseProvider.prototype.getAvailableTTSModels) {
    capabilities.push("text_to_speech");
  }
  if (provider.getAvailableASRModels !== BaseProvider.prototype.getAvailableASRModels) {
    capabilities.push("automatic_speech_recognition");
  }
  if (provider.getAvailableEmbeddingModels !== BaseProvider.prototype.getAvailableEmbeddingModels) {
    capabilities.push("generate_embedding");
  }
  return capabilities;
}

async function getProvidersInfo(userId = "1"): Promise<ProviderInfo[]> {
  const infos: ProviderInfo[] = [];
  for (const provider of await getAvailableProviderIds(userId)) {
    const instance = await instantiateProvider(provider, userId);
    if (!instance) continue;
    infos.push({ provider, capabilities: providerCapabilities(instance) });
  }
  return infos;
}

async function withProvider<T>(provider: ProviderId, run: (instance: BaseProvider) => Promise<T>, userId = "1"): Promise<T> {
  const instance = await instantiateProvider(provider, userId);
  if (!instance) {
    throw new Error(`Provider ${provider} not available`);
  }
  return run(instance);
}

async function getLanguageModelsByProvider(provider: ProviderId, userId = "1"): Promise<LanguageModel[]> {
  try {
    return await withProvider(provider, (instance) => instance.getAvailableLanguageModels(), userId);
  } catch {
    return [];
  }
}

async function getImageModelsByProvider(provider: ProviderId, userId = "1"): Promise<ImageModel[]> {
  try {
    return await withProvider(provider, (instance) => instance.getAvailableImageModels(), userId);
  } catch {
    return [];
  }
}

async function getTtsModelsByProvider(provider: ProviderId, userId = "1"): Promise<TTSModel[]> {
  try {
    return await withProvider(provider, (instance) => instance.getAvailableTTSModels(), userId);
  } catch {
    return [];
  }
}

async function getAsrModelsByProvider(provider: ProviderId, userId = "1"): Promise<ASRModel[]> {
  try {
    return await withProvider(provider, (instance) => instance.getAvailableASRModels(), userId);
  } catch {
    return [];
  }
}

async function getVideoModelsByProvider(provider: ProviderId, userId = "1"): Promise<VideoModel[]> {
  try {
    return await withProvider(provider, (instance) => instance.getAvailableVideoModels(), userId);
  } catch {
    return [];
  }
}

async function getEmbeddingModelsByProvider(provider: ProviderId, userId = "1"): Promise<EmbeddingModel[]> {
  try {
    return await withProvider(provider, (instance) => instance.getAvailableEmbeddingModels(), userId);
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

async function serverAllowsModel(model: RecommendedUnifiedModel, servers: Record<string, boolean>): Promise<boolean> {
  // Local server providers need reachability check
  if (model.provider === "ollama") return servers.ollama ?? false;
  if (model.provider === "llama_cpp") return servers.llama_cpp ?? false;
  if (model.provider === "lmstudio") return servers.lmstudio ?? false;
  if (model.provider === "vllm") return servers.vllm ?? false;
  // API-key providers: available if key is set (env or secrets DB)
  if (model.provider) return await isProviderConfigured(model.provider);
  return true;
}

async function getServerAvailability(): Promise<Record<string, boolean>> {
  // Skip localhost probes in production — local servers won't be available
  if (isProduction()) return { ollama: false, llama_cpp: false };

  const ollamaUrl = (process.env.OLLAMA_API_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const llamaUrl = process.env.LLAMA_CPP_URL?.replace(/\/+$/, "") ?? "";

  const [ollama, llama] = await Promise.all([
    isServerReachable(`${ollamaUrl}/api/tags`),
    llamaUrl ? isServerReachable(`${llamaUrl}/v1/models`) : Promise.resolve(false),
  ]);

  return { ollama, llama_cpp: llama };
}

async function recommendedModels(checkServers: boolean): Promise<UnifiedModel[]> {
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

function selectRecommended(modality: RecommendedUnifiedModel["modality"], task?: RecommendedUnifiedModel["task"]): UnifiedModel[] {
  return RECOMMENDED_MODELS.filter((model) => model.modality === modality && (!task || model.task === task));
}

async function getAllModels(userId = "1"): Promise<UnifiedModel[]> {
  const all: UnifiedModel[] = [];

  // Always include recommended models as a baseline
  all.push(...RECOMMENDED_MODELS);

  // Include language models from all available providers
  const availableIds = await getAvailableProviderIds(userId);
  for (const providerId of availableIds) {
    try {
      const models = await getLanguageModelsByProvider(providerId, userId);
      all.push(...models.map(toUnifiedLanguageModel));
    } catch {
      // Provider unavailable — skip
    }
  }

  // Include HuggingFace cached/recommended models
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

async function checkHfCache(body: HFCacheCheckRequest): Promise<HFCacheCheckResponse> {
  const allowPatterns = normalizePatterns(body.allow_pattern);
  const ignorePatterns = normalizePatterns(body.ignore_pattern);
  const files = await listRepoCachedFiles(body.repo_id);

  const missing: string[] = [];
  if (allowPatterns) {
    for (const pattern of allowPatterns) {
      const matched = files.some((path) => matchesPattern(path, pattern) && !isIgnored(path, ignorePatterns));
      if (!matched) {
        missing.push(pattern);
      }
    }
  }

  return {
    repo_id: body.repo_id,
    all_present: missing.length === 0,
    total_files: files.length,
    missing,
  };
}

async function isLlamaCppModelCached(repoId: string, filePath: string): Promise<boolean> {
  if (await repoFileInCache(repoId, filePath)) {
    return true;
  }

  const cacheRoot = process.env.LLAMA_CPP_CACHE_DIR ?? join(homedir(), "Library", "Caches", "llama.cpp", "hf");
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

async function fastCacheStatus(items: HFFastCacheStatusRequest[]): Promise<HFFastCacheStatusResponse[]> {
  return Promise.all(
    items.map(async (item) => {
      const allowPatterns = normalizePatterns(item.allow_patterns);
      const ignorePatterns = normalizePatterns(item.ignore_patterns);

      if (item.model_type && LLAMA_CPP_MODEL_TYPES.has(item.model_type)) {
        if (!item.path) return { key: item.key, downloaded: false };
        return {
          key: item.key,
          downloaded: await isLlamaCppModelCached(item.repo_id, item.path),
        };
      }

      if (item.path) {
        return {
          key: item.key,
          downloaded: await repoFileInCache(item.repo_id, item.path),
        };
      }

      const files = await listRepoCachedFiles(item.repo_id);
      return {
        key: item.key,
        downloaded: isDownloadedFromFiles(files, allowPatterns, ignorePatterns),
      };
    })
  );
}

export async function handleModelsApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = pathFromModelsPrefix(url.pathname);
  const userId = request.headers.get("x-user-id") ?? "1";

  if (path === "/providers") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getProvidersInfo(userId));
  }

  if (path === "/recommended") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    const checkServers = url.searchParams.get("check_servers") === "true";
    return jsonResponse(await recommendedModels(checkServers));
  }

  if (path === "/recommended/image") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("image"));
  }

  if (path === "/recommended/image/text-to-image") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("image", "text_to_image"));
  }

  if (path === "/recommended/image/image-to-image") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("image", "image_to_image"));
  }

  if (path === "/recommended/language") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("language"));
  }

  if (path === "/recommended/language/text-generation") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("language", "text_generation"));
  }

  if (path === "/recommended/language/embedding") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("language", "embedding"));
  }

  if (path === "/recommended/asr") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("asr"));
  }

  if (path === "/recommended/tts") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("tts"));
  }

  if (path === "/recommended/video/text-to-video") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("video", "text_to_video"));
  }

  if (path === "/recommended/video/image-to-video") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(selectRecommended("video", "image_to_video"));
  }

  if (path === "/all") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getAllModels(userId));
  }

  if (path === "/huggingface") {
    if (request.method === "GET") {
      if (isProduction()) return jsonResponse([]);
      try {
        const models = await readCachedHfModels();
        return jsonResponse(models);
      } catch {
        return jsonResponse([]);
      }
    }
    if (request.method === "DELETE") {
      const repoId = url.searchParams.get("repo_id");
      if (!repoId) return errorResponse(400, "Missing repo_id parameter");
      if (isProduction()) return jsonResponse(false);
      try {
        const deleted = await deleteCachedHfModel(repoId);
        return jsonResponse(deleted);
      } catch {
        return jsonResponse(false);
      }
    }
    return errorResponse(405, "Method not allowed");
  }

  if (path === "/huggingface/search") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    if (isProduction()) return jsonResponse([]);
    const rawQuery = url.searchParams.get("query") ?? undefined;
    const type = url.searchParams.get("type") ?? undefined;
    // Wrap bare queries with wildcards so "whisper" matches "openai/whisper-small"
    const query = rawQuery && !rawQuery.includes("*") ? `*${rawQuery}*` : rawQuery;
    try {
      const models = await searchCachedHfModels(
        query ? [query] : undefined,
        type ? [type] : undefined,
      );
      return jsonResponse(models);
    } catch {
      return jsonResponse([]);
    }
  }

  if (path.startsWith("/huggingface/type/")) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    const modelType = decodeURIComponent(path.slice("/huggingface/type/".length));
    if (!modelType) return jsonResponse([]);
    try {
      const models = await getModelsByHfType(modelType);
      return jsonResponse(models);
    } catch {
      return jsonResponse([]);
    }
  }

  if (path === "/ollama") {
    if (request.method === "DELETE") {
      if (isProduction()) return jsonResponse(false);
      return jsonResponse(false);
    }
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");

    const models = await getLanguageModelsByProvider("ollama", userId);
    return jsonResponse(models.map((model) => toOllamaModel(model)));
  }

  const llmProvider = parseProvider(path, "/llm/");
  if (llmProvider) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getLanguageModelsByProvider(llmProvider, userId));
  }

  const imageProvider = parseProvider(path, "/image/");
  if (imageProvider) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getImageModelsByProvider(imageProvider, userId));
  }

  if (path === "/tts") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    const availableIds = await getAvailableProviderIds(userId);
    const providers = await Promise.all(availableIds.map((provider) => getTtsModelsByProvider(provider, userId)));
    return jsonResponse(providers.flat());
  }

  const ttsProvider = parseProvider(path, "/tts/");
  if (ttsProvider) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getTtsModelsByProvider(ttsProvider, userId));
  }

  const asrProvider = parseProvider(path, "/asr/");
  if (asrProvider) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getAsrModelsByProvider(asrProvider, userId));
  }

  const videoProvider = parseProvider(path, "/video/");
  if (videoProvider) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getVideoModelsByProvider(videoProvider, userId));
  }

  const embeddingProvider = parseProvider(path, "/embedding/");
  if (embeddingProvider) {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(await getEmbeddingModelsByProvider(embeddingProvider, userId));
  }

  if (path === "/ollama_model_info") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    return jsonResponse(null);
  }

  if (path === "/huggingface/try_cache_files") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    const body = await parseJsonBody<Array<{ repo_id?: string; path?: string }>>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");

    const checked: RepoPath[] = await Promise.all(
      body.map(async (entry) => {
        const repoId = entry.repo_id ?? "";
        const repoPath = entry.path ?? "";
        return {
          repo_id: repoId,
          path: repoPath,
          downloaded: repoId.length > 0 && repoPath.length > 0 ? await repoFileInCache(repoId, repoPath) : false,
        };
      })
    );

    return jsonResponse(checked);
  }

  if (path === "/huggingface/try_cache_repos") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    const body = await parseJsonBody<string[]>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");

    const checked: CachedRepo[] = await Promise.all(
      body.map(async (repoId) => ({ repo_id: repoId, downloaded: await hasCachedFiles(repoId) }))
    );

    return jsonResponse(checked);
  }

  if (path === "/huggingface/check_cache") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    const body = await parseJsonBody<HFCacheCheckRequest>(request);
    if (!body || typeof body.repo_id !== "string" || body.repo_id.length === 0) {
      return errorResponse(400, "Invalid JSON body");
    }

    return jsonResponse(await checkHfCache(body));
  }

  if (path === "/huggingface/cache_status") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    const body = await parseJsonBody<HFFastCacheStatusRequest[]>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");
    return jsonResponse(await fastCacheStatus(body));
  }

  if (path === "/pull_ollama_model") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    if (isProduction()) return errorResponse(503, { status: "unavailable", message: "Not available in production" });
    // Streaming Ollama model pulls require Server-Sent Events with progress deltas.
    // The TS standalone server does not implement this streaming protocol yet.
    // Clients should use the Python backend or manage Ollama pulls directly via the Ollama HTTP API.
    return errorResponse(501, "Streaming Ollama model pulls are not available in the TS standalone server. Use the Ollama API directly or the Python backend.");
  }

  if (path === "/huggingface/file_info") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    if (isProduction()) return jsonResponse([]);
    const body = await parseJsonBody<HFFileRequest[]>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");
    try {
      const { getSecret } = await import("@nodetool/security");
      const token = (await getSecret("HF_TOKEN", "1")) ?? undefined;
      const infos = await getHuggingfaceFileInfos(body, token);
      return jsonResponse(infos);
    } catch {
      return jsonResponse([]);
    }
  }

  return null;
}

export function toUnifiedModelsFromLanguage(models: LanguageModel[]): UnifiedModel[] {
  return models.map((model) => toUnifiedModel(model, "language_model"));
}
