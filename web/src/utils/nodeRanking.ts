import { NodeMetadata } from "../stores/ApiTypes";

const PROVIDER_NAMESPACES = new Set([
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
]);

type NamespaceClass = "core" | "provider" | "other";

export interface ScoreOptions {
  includeProviderNodes?: boolean;
  namespacePrefix?: string;
  recentNodeTypes?: readonly string[];
  boostedNodeTypes?: readonly string[];
  candidateBoosts?: ReadonlyMap<string, number> | Record<string, number>;
  includeCandidateOnlyMatches?: boolean;
}

export interface ScoredNode<T extends NodeMetadata = NodeMetadata> {
  meta: T;
  score: number;
}

const isReadonlyMap = (
  value: ReadonlyMap<string, number> | Record<string, number>
): value is ReadonlyMap<string, number> => {
  return typeof (value as ReadonlyMap<string, number>).get === "function";
};

const FIELD_WEIGHTS = {
  title: 6,
  nodeType: 4,
  namespace: 2,
  description: 1
} as const;

const EXACT_TOKEN_BONUS = 2;
const CORE_MULTIPLIER = 1.5;
const RECENT_NODE_BONUS = 10;
const BOOSTED_NODE_BONUS = 6;

export function searchTermsFromQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const terms = new Set<string>([trimmed]);
  trimmed
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .forEach((term) => terms.add(term));

  return Array.from(terms);
}

function namespaceClass(namespace: string | undefined): NamespaceClass {
  if (!namespace) {
    return "other";
  }
  if (namespace.startsWith("nodetool.") || namespace === "nodetool") {
    return "core";
  }
  const root = namespace.split(".")[0] ?? "";
  return PROVIDER_NAMESPACES.has(root) ? "provider" : "other";
}

function fieldScore(
  field: string | undefined,
  term: string,
  weight: number
): number {
  if (!field) {
    return 0;
  }
  const lower = field.toLowerCase();
  if (!lower.includes(term)) {
    return 0;
  }

  let score = weight;
  const tokens = lower.split(/[\s._\-/]+/).filter(Boolean);
  if (tokens.includes(term)) {
    score += weight * EXACT_TOKEN_BONUS;
  }
  return score;
}

export function scoreNodeMetadata(
  meta: NodeMetadata,
  terms: readonly string[],
  options: ScoreOptions = {}
): number {
  if (terms.length === 0) {
    return 0;
  }

  if (
    options.namespacePrefix &&
    !(meta.namespace ?? "").startsWith(options.namespacePrefix)
  ) {
    return 0;
  }

  const cls = namespaceClass(meta.namespace);
  if (cls === "provider" && options.includeProviderNodes !== true) {
    return 0;
  }

  let raw = 0;
  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase();
    if (!term) {
      continue;
    }
    raw += fieldScore(meta.title, term, FIELD_WEIGHTS.title);
    raw += fieldScore(meta.node_type, term, FIELD_WEIGHTS.nodeType);
    raw += fieldScore(meta.namespace, term, FIELD_WEIGHTS.namespace);
    raw += fieldScore(meta.description, term, FIELD_WEIGHTS.description);
  }

  if (raw === 0) {
    return 0;
  }
  return cls === "core" ? raw * CORE_MULTIPLIER : raw;
}

export function rankNodeMetadata<T extends NodeMetadata>(
  nodes: readonly T[],
  terms: readonly string[],
  options: ScoreOptions = {}
): ScoredNode<T>[] {
  const recentRank = new Map<string, number>();
  options.recentNodeTypes?.forEach((nodeType, index) => {
    recentRank.set(nodeType, index);
  });
  const boostedNodeTypes = new Set(options.boostedNodeTypes);
  const getCandidateBoost = (nodeType: string) => {
    if (!options.candidateBoosts) {
      return 0;
    }
    if (isReadonlyMap(options.candidateBoosts)) {
      return options.candidateBoosts.get(nodeType) ?? 0;
    }
    return options.candidateBoosts[nodeType] ?? 0;
  };

  const hasTerms = terms.some((term) => term.trim().length > 0);
  const scored: ScoredNode<T>[] = [];
  for (const meta of nodes) {
    const score = hasTerms ? scoreNodeMetadata(meta, terms, options) : 0;
    const candidateBoost = getCandidateBoost(meta.node_type);
    const isProviderNode = namespaceClass(meta.namespace) === "provider";
    const matchesNamespace =
      !options.namespacePrefix ||
      (meta.namespace ?? "").startsWith(options.namespacePrefix);

    if (
      matchesNamespace &&
      (!isProviderNode || options.includeProviderNodes === true) &&
      (!hasTerms || score > 0 ||
        (options.includeCandidateOnlyMatches === true && candidateBoost > 0))
    ) {
      const recentIndex = recentRank.get(meta.node_type);
      const recentBonus =
        recentIndex === undefined ? 0 : RECENT_NODE_BONUS / (recentIndex + 1);
      const boostedBonus = boostedNodeTypes.has(meta.node_type)
        ? BOOSTED_NODE_BONUS
        : 0;
      scored.push({
        meta,
        score: score + candidateBoost + recentBonus + boostedBonus
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.meta.node_type.localeCompare(b.meta.node_type);
  });
  return scored;
}
