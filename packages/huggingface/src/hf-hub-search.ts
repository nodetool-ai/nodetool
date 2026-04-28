/**
 * HuggingFace Hub model search.
 *
 * Queries https://huggingface.co/api/models to discover repos matching a
 * nodetool model type. Translation between nodetool's hf.* types and HF Hub
 * query parameters lives in `HF_HUB_QUERY_CONFIG` below, with fallbacks for
 * GENERIC_HF_TYPES (require a --task) and llama.cpp-style model types
 * enumerated in SUPPORTED_MODEL_TYPES.
 */

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
  filter?: string[];
  search?: string;
  pipeline_tag?: string;
  library?: string;
}

/**
 * Direct nodetool-type → HF Hub API query mapping.
 *
 * Only populated for types where the translation differs from
 * `HF_SEARCH_TYPE_CONFIG`. For hf.* types without an entry here, we derive
 * params from HF_SEARCH_TYPE_CONFIG at runtime.
 */
const HF_HUB_QUERY_CONFIG: Record<string, HfHubQueryParams> = {
  // llama.cpp GGUF types in SUPPORTED_MODEL_TYPES: filter to GGUF library.
  qwen2: { search: "qwen2", library: "gguf" },
  qwen3: { search: "qwen3", library: "gguf" },
  qwen_2_5_vl: { search: "qwen2.5-vl", library: "gguf" },
  qwen_3_vl: { search: "qwen3-vl", library: "gguf" },
  mistral3: { search: "mistral", library: "gguf" },
  gpt_oss: { search: "gpt-oss", library: "gguf" },
  llama: { search: "llama", library: "gguf" },
  gemma2: { search: "gemma-2", library: "gguf" },
  gemma3: { search: "gemma-3", library: "gguf" },
  gemma3n: { search: "gemma-3n", library: "gguf" },
  phi3: { search: "phi-3", library: "gguf" },
  phi4: { search: "phi-4", library: "gguf" }
};

/** Build HF Hub API query params from HF_SEARCH_TYPE_CONFIG for hf.* types. */
function deriveFromSearchConfig(
  modelType: string
): HfHubQueryParams | null {
  const cfg = HF_SEARCH_TYPE_CONFIG[modelType];
  if (!cfg) return null;
  const out: HfHubQueryParams = {};

  const pipelineTags = cfg["pipeline_tag"];
  if (Array.isArray(pipelineTags) && pipelineTags.length > 0) {
    out.pipeline_tag = pipelineTags[0]!;
  }

  const tagFilters = cfg["tag"];
  if (Array.isArray(tagFilters) && tagFilters.length > 0) {
    // Strip "*" wildcards — HF Hub API takes literal tags.
    const concrete = tagFilters
      .map((t) => t.replace(/\*/g, "").trim())
      .filter((t) => t.length > 0);
    if (concrete.length > 0) out.filter = concrete;
  }

  const repoPatterns = cfg["repo_pattern"];
  if (Array.isArray(repoPatterns) && !out.search) {
    const first = repoPatterns.find(
      (p) => !p.startsWith("*") && !p.endsWith("*") && !p.includes("*")
    );
    if (first) out.search = first;
    else {
      // Take the first pattern, stripping wildcards.
      const cleaned = repoPatterns[0]?.replace(/\*/g, "").trim();
      if (cleaned) out.search = cleaned;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

function buildQueryParams(
  modelType: string,
  task?: string
): HfHubQueryParams {
  const normalized = modelType.toLowerCase();

  if (GENERIC_HF_TYPES.has(normalized)) {
    if (!task) {
      throw new Error(
        `Model type '${modelType}' requires --task (e.g. 'text-to-image').`
      );
    }
    return { pipeline_tag: task.replace(/_/g, "-") };
  }

  if (task) {
    return { pipeline_tag: task.replace(/_/g, "-") };
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
// HTTP
// ---------------------------------------------------------------------------

const HF_API_BASE = "https://huggingface.co/api/models";

interface RawHfHubModel {
  id?: string;
  modelId?: string;
  pipeline_tag?: string | null;
  tags?: string[];
  downloads?: number;
  likes?: number;
  gated?: boolean | "auto" | "manual" | null;
  private?: boolean;
  library_name?: string | null;
  createdAt?: string;
  lastModified?: string;
}

function buildSearchUrl(params: HfHubQueryParams, limit?: number): string {
  const search = new URLSearchParams();
  if (params.pipeline_tag) search.set("pipeline_tag", params.pipeline_tag);
  if (params.library) search.set("library", params.library);
  if (params.search) search.set("search", params.search);
  if (params.filter) {
    for (const f of params.filter) search.append("filter", f);
  }
  if (limit && limit > 0) search.set("limit", String(limit));
  search.set("full", "false");
  return `${HF_API_BASE}?${search.toString()}`;
}

function normalizeRaw(raw: RawHfHubModel, modelType: string): HfHubModel {
  const id = raw.id ?? raw.modelId ?? "";
  return {
    id,
    pipeline_tag: raw.pipeline_tag ?? null,
    tags: raw.tags ?? [],
    downloads: raw.downloads ?? 0,
    likes: raw.likes ?? 0,
    gated: raw.gated ?? null,
    private: raw.private ?? false,
    library_name: raw.library_name ?? null,
    created_at: raw.createdAt,
    last_modified: raw.lastModified,
    model_type: modelType,
    repo_id: id
  };
}

/**
 * Search the HuggingFace Hub for models matching a nodetool model type.
 */
export async function searchHfHub(
  options: SearchHfHubOptions
): Promise<HfHubModel[]> {
  const params = buildQueryParams(options.modelType, options.task);
  const url = buildSearchUrl(params, options.limit);

  const token =
    options.token !== undefined
      ? options.token
      : await resolveHfToken(undefined);
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HF Hub search failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`
    );
  }
  const raw = (await res.json()) as RawHfHubModel[];
  return raw.map((r) => normalizeRaw(r, options.modelType));
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
        limit: perTypeLimit,
        token
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
      console.error(
        `listAllHfModels: ${modelType} failed — ${String(err)}`
      );
    }
  }

  let out = aggregated;
  if (repoOnly) {
    out = out.filter((m) => m.id.split("/").length <= 2);
  }
  return out;
}
