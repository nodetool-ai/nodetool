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
  "atlascloud",
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
  // Stryker disable next-line StringLiteral: String.split always returns a non-empty array, so [0] is never undefined and the ?? "" never fires (equivalent).
  const root = namespace.split(".")[0] ?? "";
  if (PROVIDER_NAMESPACE_SET.has(root)) return "provider";
  return "other";
}

export interface ScoreOptions {
  /** Include provider-specific nodes in results (default: false). */
  includeProviderNodes?: boolean;
  /**
   * Restrict to nodes whose namespace starts with this prefix.
   * Applied as a hard filter before scoring. An explicit prefix also lifts
   * the provider-node exclusion — asking for `openai.` implies the caller
   * wants provider nodes.
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
  // Stryker disable next-line Regex,MethodExpression: dropping the + (or the .filter(Boolean)) only changes whether empty tokens appear, and empty tokens never match a non-empty term, so includes(term) is unchanged (equivalent).
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
  // Stryker disable next-line ConditionalExpression: with no terms the loop below runs zero times, leaving raw === 0 → returns 0 anyway (equivalent).
  if (terms.length === 0) return 0;

  if (
    options.namespacePrefix &&
    // Stryker disable next-line StringLiteral: the ?? "" default only changes the receiver of startsWith for an undefined namespace; no realistic prefix distinguishes "" from the seeded literal (equivalent).
    !(meta.namespace ?? "").startsWith(options.namespacePrefix)
  ) {
    return 0;
  }

  const cls = namespaceClass(meta.namespace);
  // A namespacePrefix is an explicit request for whatever lives under that
  // prefix, so it overrides the default provider-node exclusion.
  if (
    cls === "provider" &&
    !options.includeProviderNodes &&
    !options.namespacePrefix
  ) {
    return 0;
  }

  let raw = 0;
  // Each search term may itself be a multi-word phrase (agents often pass
  // ["text input string"] rather than ["text","input","string"]). Match on
  // individual words so a phrase doesn't collapse to a single substring probe
  // that almost never hits — this is the difference between 0 and many results.
  for (const rawTerm of terms) {
    for (const term of rawTerm.toLowerCase().split(/\s+/)) {
      if (!term) continue;
      raw += fieldScore(meta.title, term, FIELD_WEIGHTS.title);
      raw += fieldScore(meta.node_type, term, FIELD_WEIGHTS.nodeType);
      raw += fieldScore(meta.namespace, term, FIELD_WEIGHTS.namespace);
      raw += fieldScore(meta.description, term, FIELD_WEIGHTS.description);
    }
  }

  // Stryker disable next-line ConditionalExpression: when raw is 0 the core branch returns 0 * 1.5 === 0, so the guard cannot change the result (equivalent).
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
 *
 * For repeated searches over a stable node set, build a {@link NodeSearchIndex}
 * once and call its `rank` method instead — this function rebuilds the
 * per-field lowercasing/tokenization on every call.
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

/**
 * The four scored fields, paired with their weight, in the order they are
 * indexed. Kept parallel to {@link FIELD_WEIGHTS} so the indexed scorer and
 * {@link scoreNodeMetadata} stay in lockstep.
 */
const INDEXED_FIELDS = [
  FIELD_WEIGHTS.title,
  FIELD_WEIGHTS.nodeType,
  FIELD_WEIGHTS.namespace,
  FIELD_WEIGHTS.description
] as const;

interface IndexedField {
  /** Lowercased field text — `""` when the field is absent. */
  readonly lower: string;
  /** Lowercased whole-word/segment tokens, for the exact-token bonus. */
  readonly tokens: ReadonlySet<string>;
}

interface IndexedNode<T extends NodeMetadata> {
  readonly meta: T;
  readonly cls: NamespaceClass;
  readonly namespace: string;
  /** Parallel to {@link INDEXED_FIELDS}: title, node_type, namespace, description. */
  readonly fields: readonly IndexedField[];
}

function indexField(value: string | undefined): IndexedField {
  const lower = (value ?? "").toLowerCase();
  // Mirrors fieldScore's tokenization so exact-token bonuses match exactly.
  const tokens = new Set(lower.split(/[\s._\-/]+/).filter(Boolean));
  return { lower, tokens };
}

/**
 * Precomputed search index over a fixed set of node metadata.
 *
 * Building the index lowercases and tokenizes each node's title, node_type,
 * namespace, and description once; `rank` then reuses that work across every
 * query. The ranking is identical to {@link rankNodeMetadata} — same field
 * weights, exact-token bonus, core multiplier, and tie-break — so the indexed
 * path is a drop-in for the inner loop of repeated node searches (e.g. the
 * graph planner, which searches the same registry many times per build).
 */
export class NodeSearchIndex<T extends NodeMetadata = NodeMetadata> {
  private readonly entries: readonly IndexedNode<T>[];

  constructor(nodes: readonly T[]) {
    this.entries = nodes.map((meta) => ({
      meta,
      cls: namespaceClass(meta.namespace),
      namespace: meta.namespace ?? "",
      fields: [
        indexField(meta.title),
        indexField(meta.node_type),
        indexField(meta.namespace),
        indexField(meta.description)
      ]
    }));
  }

  /** Number of nodes covered by this index. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Rank the indexed nodes against `terms`. Equivalent to
   * `rankNodeMetadata(nodes, terms, options)` but without rebuilding the
   * per-field projections on each call.
   */
  rank(terms: readonly string[], options: ScoreOptions = {}): ScoredNode<T>[] {
    if (terms.length === 0) return [];
    const lowered: string[] = [];
    for (const term of terms) {
      const lower = term.toLowerCase();
      if (lower) lowered.push(lower);
    }
    if (lowered.length === 0) return [];

    const { namespacePrefix } = options;
    const includeProviderNodes = options.includeProviderNodes ?? false;

    const scored: ScoredNode<T>[] = [];
    for (const entry of this.entries) {
      if (namespacePrefix && !entry.namespace.startsWith(namespacePrefix)) {
        continue;
      }
      // A namespacePrefix is an explicit request for whatever lives under that
      // prefix, so it overrides the default provider-node exclusion.
      if (
        entry.cls === "provider" &&
        !includeProviderNodes &&
        !namespacePrefix
      ) {
        continue;
      }

      let raw = 0;
      for (let f = 0; f < INDEXED_FIELDS.length; f++) {
        const field = entry.fields[f];
        const weight = INDEXED_FIELDS[f];
        for (const term of lowered) {
          if (!field.lower.includes(term)) continue;
          raw += weight;
          if (field.tokens.has(term)) raw += weight * EXACT_TOKEN_BONUS;
        }
      }

      if (raw === 0) continue;
      scored.push({
        meta: entry.meta,
        score: entry.cls === "core" ? raw * CORE_MULTIPLIER : raw
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.meta.node_type.localeCompare(b.meta.node_type);
    });
    return scored;
  }
}
