import { z } from "zod";

// ── Shared model schema ─────────────────────────────────────────────

// Mirrors UnifiedModel in @nodetool/protocol/api-types. Keep fields in sync
// with the TS interface; zod strips unknown fields on both input and output
// validation, so an omitted property silently disappears from wire traffic.
export const unifiedModel = z.object({
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
  image: z.string().nullish()
});

// ── Provider info ───────────────────────────────────────────────────

export const providerInfo = z.object({
  provider: z.string(),
  capabilities: z.array(z.string())
});

export const providersOutput = z.array(providerInfo);

// ── Recommended models ──────────────────────────────────────────────

export const recommendedInput = z.object({
  check_servers: z.boolean().optional().default(false)
});

export const modelsListOutput = z.array(unifiedModel);

// ── HuggingFace cache check ─────────────────────────────────────────

export const hfCacheCheckInput = z.object({
  repo_id: z.string().min(1),
  allow_pattern: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  ignore_pattern: z.union([z.string(), z.array(z.string())]).nullable().optional()
});

export const hfCacheCheckOutput = z.object({
  repo_id: z.string(),
  all_present: z.boolean(),
  total_files: z.number(),
  missing: z.array(z.string())
});

// ── HuggingFace fast cache status ──────────────────────────────────

export const hfFastCacheStatusItem = z.object({
  key: z.string(),
  repo_id: z.string(),
  model_type: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  allow_patterns: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  ignore_patterns: z.union([z.string(), z.array(z.string())]).nullable().optional()
});

export const hfFastCacheStatusInput = z.array(hfFastCacheStatusItem);

export const hfFastCacheStatusResult = z.object({
  key: z.string(),
  downloaded: z.boolean()
});

export const hfFastCacheStatusOutput = z.array(hfFastCacheStatusResult);

// ── HuggingFace try cache files ─────────────────────────────────────

export const tryCacheFilesItem = z.object({
  repo_id: z.string().optional(),
  path: z.string().optional()
});

export const tryCacheFilesInput = z.array(tryCacheFilesItem);

export const repoPathResult = z.object({
  repo_id: z.string(),
  path: z.string(),
  downloaded: z.boolean()
});

export const tryCacheFilesOutput = z.array(repoPathResult);

// ── HuggingFace try cache repos ─────────────────────────────────────

export const tryCacheReposInput = z.array(z.string());

export const cachedRepoResult = z.object({
  repo_id: z.string(),
  downloaded: z.boolean()
});

export const tryCacheReposOutput = z.array(cachedRepoResult);

// ── HuggingFace file info ─────────────────────────────────────────

export const hfFileRequest = z.object({
  repo_id: z.string(),
  path: z.string()
});

export const hfFileInfoInput = z.array(hfFileRequest);

// Use unknown for file info since the shape comes from @nodetool/huggingface
export const hfFileInfoOutput = z.array(z.record(z.string(), z.unknown()));

// ── HuggingFace search ─────────────────────────────────────────────

export const hfSearchInput = z.object({
  query: z.string().optional(),
  type: z.string().optional()
});

// ── HuggingFace by type ────────────────────────────────────────────

export const hfByTypeInput = z.object({
  model_type: z.string().min(1)
});

// ── Provider-based queries ─────────────────────────────────────────

export const providerInput = z.object({
  provider: z.string().min(1)
});

// ── Huggingface delete ─────────────────────────────────────────────

export const hfDeleteInput = z.object({
  repo_id: z.string().min(1)
});

export const hfDeleteOutput = z.boolean();

// ── Ollama model info ──────────────────────────────────────────────

export const ollamaModel = z.object({
  type: z.string(),
  name: z.string(),
  repo_id: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
  details: z.record(z.string(), z.unknown())
});

export const ollamaModelsOutput = z.array(ollamaModel);

// ── Pull ollama model ──────────────────────────────────────────────

export const pullOllamaModelInput = z.object({
  model: z.string().min(1)
});

export const pullOllamaModelOutput = z.object({
  status: z.string(),
  message: z.string()
});

// ── Inferred types ─────────────────────────────────────────────────

export type UnifiedModelSchema = z.infer<typeof unifiedModel>;
export type ProviderInfo = z.infer<typeof providerInfo>;
export type ProvidersOutput = z.infer<typeof providersOutput>;
export type RecommendedInput = z.infer<typeof recommendedInput>;
export type ModelsListOutput = z.infer<typeof modelsListOutput>;
export type HfCacheCheckInput = z.infer<typeof hfCacheCheckInput>;
export type HfCacheCheckOutput = z.infer<typeof hfCacheCheckOutput>;
export type HfFastCacheStatusItem = z.infer<typeof hfFastCacheStatusItem>;
export type HfFastCacheStatusInput = z.infer<typeof hfFastCacheStatusInput>;
export type HfFastCacheStatusResult = z.infer<typeof hfFastCacheStatusResult>;
export type HfFastCacheStatusOutput = z.infer<typeof hfFastCacheStatusOutput>;
export type TryCacheFilesInput = z.infer<typeof tryCacheFilesInput>;
export type RepoPathResult = z.infer<typeof repoPathResult>;
export type TryCacheFilesOutput = z.infer<typeof tryCacheFilesOutput>;
export type TryCacheReposInput = z.infer<typeof tryCacheReposInput>;
export type CachedRepoResult = z.infer<typeof cachedRepoResult>;
export type TryCacheReposOutput = z.infer<typeof tryCacheReposOutput>;
export type HfFileRequest = z.infer<typeof hfFileRequest>;
export type HfFileInfoInput = z.infer<typeof hfFileInfoInput>;
export type HfSearchInput = z.infer<typeof hfSearchInput>;
export type HfByTypeInput = z.infer<typeof hfByTypeInput>;
export type ProviderInput = z.infer<typeof providerInput>;
export type HfDeleteInput = z.infer<typeof hfDeleteInput>;
export type OllamaModel = z.infer<typeof ollamaModel>;
export type OllamaModelsOutput = z.infer<typeof ollamaModelsOutput>;
