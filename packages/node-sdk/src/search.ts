/**
 * Namespace-aware scorer for node metadata search.
 *
 * Used by the agent's local search tool to bias results toward
 * provider-agnostic core nodes (`nodetool.*`) and away from provider-specific
 * nodes (`openai.*`, `anthropic.*`, `gemini.*`, etc.).
 *
 * Pure functions only — no provider or runtime imports — so this module can
 * live in node-sdk and be consumed by any package that has node metadata.
 */

import type { NodeMetadata } from "./metadata.js";

/**
 * Root namespace prefixes that identify provider-specific node packages.
 * Nodes whose namespace starts with one of these (e.g. `openai.tts`,
 * `anthropic.agents`, `replicate.image`) are treated as provider nodes.
 *
 * The agent's search tool hides these by default; users browsing the node
 * picker UI still see them via the unbiased HTTP endpoint.
 */
export const PROVIDER_NAMESPACES: readonly string[] = [
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "groq",
  "cohere",
  "voyage",
  "huggingface",
  "fal",
  "replicate",
  "kie",
  "comfyui",
  "apify",
  "messaging",
  "search"
];

const PROVIDER_NAMESPACE_SET = new Set(PROVIDER_NAMESPACES);

export type NamespaceClass = "core" | "provider" | "other";

/**
 * Classify a node namespace into one of three buckets used for ranking.
 * - `core`: starts with `nodetool.` (the curated, provider-agnostic surface)
 * - `provider`: root segment is in `PROVIDER_NAMESPACES`
 * - `other`: utility libs like `lib.*`, third-party `mcp.*`, etc.
 */
export function namespaceClass(namespace: string | undefined): NamespaceClass {
  if (!namespace) return "other";
  if (namespace.startsWith("nodetool.") || namespace === "nodetool") {
    return "core";
  }
  const root = namespace.split(".")[0] ?? "";
  if (PROVIDER_NAMESPACE_SET.has(root)) return "provider";
  return "other";
}

export interface ScoreOptions {
  /** Include provider-specific nodes in results (default: false). */
  includeProviderNodes?: boolean;
  /**
   * Restrict to nodes whose namespace starts with this prefix.
   * Applied as a hard filter before scoring.
   */
  namespacePrefix?: string;
}

const FIELD_WEIGHTS = {
  title: 6,
  nodeType: 4,
  namespace: 2,
  description: 1
} as const;

const EXACT_TOKEN_BONUS = 2;
const CORE_MULTIPLIER = 1.5;

function fieldScore(
  field: string | undefined,
  term: string,
  weight: number
): number {
  if (!field) return 0;
  const lower = field.toLowerCase();
  if (!lower.includes(term)) return 0;
  let score = weight;
  // Exact-token bonus: term appears as a whole word/segment.
  const tokens = lower.split(/[\s._\-/]+/).filter(Boolean);
  if (tokens.includes(term)) score += weight * EXACT_TOKEN_BONUS;
  return score;
}

/**
 * Score a node against a list of search terms.
 * Returns 0 if the node should be hidden (no match, or provider node when
 * `includeProviderNodes` is false). Higher is more relevant.
 *
 * Terms are matched case-insensitively. Each matching field contributes
 * `FIELD_WEIGHTS[field]` plus an exact-token bonus when the term appears as a
 * whole token. Core (`nodetool.*`) namespaces get a 1.5× multiplier.
 */
export function scoreNodeMetadata(
  meta: NodeMetadata,
  terms: readonly string[],
  options: ScoreOptions = {}
): number {
  if (terms.length === 0) return 0;

  if (
    options.namespacePrefix &&
    !(meta.namespace ?? "").startsWith(options.namespacePrefix)
  ) {
    return 0;
  }

  const cls = namespaceClass(meta.namespace);
  if (cls === "provider" && !options.includeProviderNodes) return 0;

  let raw = 0;
  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase();
    if (!term) continue;
    raw += fieldScore(meta.title, term, FIELD_WEIGHTS.title);
    raw += fieldScore(meta.node_type, term, FIELD_WEIGHTS.nodeType);
    raw += fieldScore(meta.namespace, term, FIELD_WEIGHTS.namespace);
    raw += fieldScore(meta.description, term, FIELD_WEIGHTS.description);
  }

  if (raw === 0) return 0;
  return cls === "core" ? raw * CORE_MULTIPLIER : raw;
}

export interface ScoredNode<T extends NodeMetadata = NodeMetadata> {
  meta: T;
  score: number;
}

/**
 * Score and rank a list of node metadata against search terms.
 * Returns nodes with score > 0, sorted by score descending; ties broken
 * alphabetically on `node_type` for deterministic output.
 */
export function rankNodeMetadata<T extends NodeMetadata>(
  nodes: readonly T[],
  terms: readonly string[],
  options: ScoreOptions = {}
): ScoredNode<T>[] {
  const scored: ScoredNode<T>[] = [];
  for (const meta of nodes) {
    const score = scoreNodeMetadata(meta, terms, options);
    if (score > 0) scored.push({ meta, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.meta.node_type.localeCompare(b.meta.node_type);
  });
  return scored;
}
