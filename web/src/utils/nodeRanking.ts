import { NodeMetadata } from "../stores/ApiTypes";
import {
  rank,
  searchTermsFromQuery as genericSearchTermsFromQuery,
  type RankConfig,
  type RankField
} from "./ranking";

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
  "apify",
  "messaging",
  "search"
]);

type NamespaceClass = "core" | "provider" | "other";

interface ScoreOptions {
  includeProviderNodes?: boolean;
  namespacePrefix?: string;
  recentNodeTypes?: readonly string[];
  boostedNodeTypes?: readonly string[];
  candidateBoosts?: ReadonlyMap<string, number> | Record<string, number>;
  includeCandidateOnlyMatches?: boolean;
}

interface ScoredNode<T extends NodeMetadata = NodeMetadata> {
  meta: T;
  score: number;
}

const FIELD_WEIGHTS = {
  title: 6,
  nodeType: 4,
  namespace: 2,
  description: 1
} as const;

const CORE_MULTIPLIER = 1.5;

const NODE_FIELDS: ReadonlyArray<RankField<NodeMetadata>> = [
  { get: (meta) => meta.title, weight: FIELD_WEIGHTS.title },
  { get: (meta) => meta.node_type, weight: FIELD_WEIGHTS.nodeType },
  { get: (meta) => meta.namespace, weight: FIELD_WEIGHTS.namespace },
  { get: (meta) => meta.description, weight: FIELD_WEIGHTS.description }
];

export const searchTermsFromQuery = genericSearchTermsFromQuery;

function namespaceClass(namespace: string | undefined): NamespaceClass {
  if (!namespace) return "other";
  if (namespace.startsWith("nodetool.") || namespace === "nodetool") {
    return "core";
  }
  const root = namespace.split(".")[0] ?? "";
  return PROVIDER_NAMESPACES.has(root) ? "provider" : "other";
}

function buildPrefilter(
  options: ScoreOptions
): (meta: NodeMetadata) => boolean {
  return (meta) => {
    if (
      options.namespacePrefix &&
      !(meta.namespace ?? "").startsWith(options.namespacePrefix)
    ) {
      return false;
    }
    if (
      namespaceClass(meta.namespace) === "provider" &&
      options.includeProviderNodes !== true
    ) {
      return false;
    }
    return true;
  };
}

function buildConfig<T extends NodeMetadata>(
  options: ScoreOptions
): RankConfig<T> {
  return {
    fields: NODE_FIELDS as ReadonlyArray<RankField<T>>,
    keyFn: (meta) => meta.node_type,
    multiplier: (meta) => {
      let value = namespaceClass(meta.namespace) === "core" ? CORE_MULTIPLIER : 1;
      if (meta.deprecated) {
        value *= 0.15;
      }
      return value;
    },
    prefilter: buildPrefilter(options),
    recentKeys: options.recentNodeTypes,
    boostedKeys: options.boostedNodeTypes,
    candidateBoosts: options.candidateBoosts,
    includeCandidateOnlyMatches: options.includeCandidateOnlyMatches
  };
}

export function rankNodeMetadata<T extends NodeMetadata>(
  nodes: readonly T[],
  terms: readonly string[],
  options: ScoreOptions = {}
): ScoredNode<T>[] {
  const scored = rank<T>(nodes, terms, buildConfig<T>(options));
  return scored.map(({ item, score }) => ({ meta: item, score }));
}
