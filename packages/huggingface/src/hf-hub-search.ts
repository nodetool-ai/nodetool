/**
 * HuggingFace Hub model search.
 *
 * Translates nodetool model types into `@huggingface/hub` `listModels` queries.
 * Translation between nodetool's hf.* types and HF Hub query parameters lives
 * in `HF_HUB_QUERY_CONFIG` below, with fallbacks for GENERIC_HF_TYPES (require
 * a --task) and llama.cpp-style model types enumerated in SUPPORTED_MODEL_TYPES.
 */

import { listModels } from "@huggingface/hub";
import type { PipelineType } from "@huggingface/hub";

import { resolveHfToken } from "./hf-auth.js";
import {
  GENERIC_HF_TYPES,
  HF_SEARCH_TYPE_CONFIG,
  SUPPORTED_MODEL_TYPES
} from "./hf-models.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single repo entry returned by the HF Hub API. */
export interface HfHubModel {
  id: string;
  pipeline_tag?: string | null;
  tags?: string[];
  downloads?: number;
  likes?: number;
  gated?: boolean | "auto" | "manual" | null;
  private?: boolean;
  library_name?: string | null;
  created_at?: string;
  last_modified?: string;
  /** Echoed from the nodetool side; not from HF API. */
  model_type?: string | null;
  /** Alias for id, for UnifiedModel compatibility. */
  repo_id?: string;
}

export interface SearchHfHubOptions {
  /** Nodetool HF model type (must map to a known query or be a GENERIC type with --task). */
  modelType: string;
  /** Optional HF Hub task filter (e.g. "text-to-speech"). Required for GENERIC_HF_TYPES. */
  task?: string;
  /** Cap on number of results (default: no cap). */
  limit?: number;
  /** HF Hub token; default: resolveHfToken(undefined). */
  token?: string | null;
}

export interface ListAllHfModelsOptions {
  limit?: number;
  token?: string | null;
  /** If true, drop file-level entries and keep only repo-level entries. */
  repoOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Query translation
// ---------------------------------------------------------------------------

interface HfHubQueryParams {
  /** Tag filters — passed through as repeated `filter=` URL params. */
  tags?: string[];
  /** Free-text search against the model id. */
  query?: string;
  /** Pipeline tag (e.g. "text-to-image"). */
  task?: PipelineType;
  /** Post-filter: only keep results whose library_name matches this value. */
  libraryName?: string;
}

/**
 * Direct nodetool-type → HF Hub API query mapping.
 *
 * Only populated for types where the translation differs from
 * `HF_SEARCH_TYPE_CONFIG`. For hf.* types without an entry here, we derive
 * params from HF_SEARCH_TYPE_CONFIG at runtime.
 */
const HF_HUB_QUERY_CONFIG: Record<string, HfHubQueryParams> = {
  // llama.cpp GGUF types: post-filter by library_name (not tags) to match the
  // HF API's `library=gguf` parameter which filters on the library_name field.
  qwen2: { query: "qwen2", libraryName: "gguf" },
  qwen3: { query: "qwen3", libraryName: "gguf" },
  qwen_2_5_vl: { query: "qwen2.5-vl", libraryName: "gguf" },
  qwen_3_vl: { query: "qwen3-vl", libraryName: "gguf" },
  mistral3: { query: "mistral", libraryName: "gguf" },
  gpt_oss: { query: "gpt-oss", libraryName: "gguf" },
  llama: { query: "llama", libraryName: "gguf" },
  gemma2: { query: "gemma-2", libraryName: "gguf" },
  gemma3: { query: "gemma-3", libraryName: "gguf" },
  gemma3n: { query: "gemma-3n", libraryName: "gguf" },
  phi3: { query: "phi-3", libraryName: "gguf" },
  phi4: { query: "phi-4", libraryName: "gguf" }
};

/** Build HF Hub API query params from HF_SEARCH_TYPE_CONFIG for hf.* types. */
function deriveFromSearchConfig(modelType: string): HfHubQueryParams | null {
  const cfg = HF_SEARCH_TYPE_CONFIG[modelType];
  if (!cfg) return null;
  const out: HfHubQueryParams = {};

  const pipelineTags = cfg["pipeline_tag"];
  if (Array.isArray(pipelineTags) && pipelineTags.length > 0) {
    out.task = pipelineTags[0]! as PipelineType;
  }

  const tagFilters = cfg["tag"];
  if (Array.isArray(tagFilters) && tagFilters.length > 0) {
    // Strip "*" wildcards — HF Hub API takes literal tags.
    const concrete = tagFilters
      .map((t) => t.replace(/\*/g, "").trim())
      .filter((t) => t.length > 0);
    if (concrete.length > 0) out.tags = concrete;
  }

  const repoPatterns = cfg["repo_pattern"];
  if (Array.isArray(repoPatterns) && !out.query) {
    const first = repoPatterns.find(
      (p) => !p.startsWith("*") && !p.endsWith("*") && !p.includes("*")
    );
    if (first) out.query = first;
    else {
      // Take the first pattern, stripping wildcards.
      const cleaned = repoPatterns[0]?.replace(/\*/g, "").trim();
      if (cleaned) out.query = cleaned;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

function buildQueryParams(modelType: string, task?: string): HfHubQueryParams {
  const normalized = modelType.toLowerCase();

  if (GENERIC_HF_TYPES.has(normalized)) {
    if (!task) {
      throw new Error(
        `Model type '${modelType}' requires --task (e.g. 'text-to-image').`
      );
    }
    return { task: task.replace(/_/g, "-") as PipelineType };
  }

  if (task) {
    return { task: task.replace(/_/g, "-") as PipelineType };
  }

  const direct = HF_HUB_QUERY_CONFIG[normalized];
  if (direct) return direct;

  const derived = deriveFromSearchConfig(normalized);
  if (derived) return derived;

  throw new Error(
    `Unknown model type '${modelType}'. Run 'nodetool models hf-types' to list supported types.`
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search the HuggingFace Hub for models matching a nodetool model type.
 */
export async function searchHfHub(
  options: SearchHfHubOptions
): Promise<HfHubModel[]> {
  const params = buildQueryParams(options.modelType, options.task);

  const token =
    options.token !== undefined
      ? options.token
      : await resolveHfToken(undefined);

  const libraryFilter = params.libraryName?.toLowerCase();

  const out: HfHubModel[] = [];
  try {
    for await (const m of listModels({
      search: {
        ...(params.query ? { query: params.query } : {}),
        ...(params.task ? { task: params.task } : {}),
        ...(params.tags ? { tags: params.tags } : {})
      },
      ...(options.limit && !libraryFilter ? { limit: options.limit } : {}),
      additionalFields: ["tags", "library_name"],
      ...(token ? { accessToken: token } : {})
    })) {
      if (libraryFilter && m.library_name?.toLowerCase() !== libraryFilter) {
        continue;
      }
      const lastModified =
        m.updatedAt && !Number.isNaN(m.updatedAt.getTime())
          ? m.updatedAt.toISOString()
          : undefined;
      out.push({
        id: m.name,
        pipeline_tag: m.task ?? null,
        tags: m.tags ?? [],
        downloads: m.downloads,
        likes: m.likes,
        gated: m.gated,
        private: m.private,
        library_name: m.library_name ?? null,
        ...(lastModified ? { last_modified: lastModified } : {}),
        model_type: options.modelType,
        repo_id: m.name
      });
      if (options.limit && out.length >= options.limit) break;
    }
  } catch (err) {
    throw new Error(
      `HF Hub search failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return out;
}

/**
 * Iterate SUPPORTED_MODEL_TYPES, search each, aggregate, dedupe by id, limit.
 * Skips types that require a task when none is given.
 */
export async function listAllHfModels(
  options: ListAllHfModelsOptions = {}
): Promise<HfHubModel[]> {
  const { limit, token, repoOnly } = options;

  // Use a per-type cap when an overall limit is set so we don't pull way more
  // than needed up-front. Still dedupe + final-cap later.
  const perTypeLimit = limit ? Math.max(limit, 50) : undefined;

  const seen = new Set<string>();
  const aggregated: HfHubModel[] = [];

  for (const modelType of SUPPORTED_MODEL_TYPES) {
    if (GENERIC_HF_TYPES.has(modelType.toLowerCase())) continue;
    try {
      const results = await searchHfHub({
        modelType,
        ...(perTypeLimit ? { limit: perTypeLimit } : {}),
        ...(token !== undefined ? { token } : {})
      });
      for (const m of results) {
        if (!m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        aggregated.push(m);
        if (limit && aggregated.length >= limit) break;
      }
      if (limit && aggregated.length >= limit) break;
    } catch (err) {
      // One type failing shouldn't tank the whole list. Log + continue.
      console.error(`listAllHfModels: ${modelType} failed — ${String(err)}`);
    }
  }

  let out = aggregated;
  if (repoOnly) {
    out = out.filter((m) => m.id.split("/").length <= 2);
  }
  return out;
}
