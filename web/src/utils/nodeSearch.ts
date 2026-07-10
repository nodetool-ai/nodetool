import { NodeMetadata, TypeName } from "../stores/ApiTypes";
import {
  filterDataByType,
  filterDataByExactType
} from "../components/node_menu/typeFilterUtils";
import { formatNodeDocumentation } from "../stores/formatNodeDocumentation";
import { fuzzyScore } from "./fuzzyMatch";
import { PrefixTreeSearch, SearchField } from "./PrefixTreeSearch";
import { getProviderKindForNamespace } from "./nodeProvider";
import { rankNodeMetadata, searchTermsFromQuery } from "./nodeRanking";
import { QUICK_ACTION_NODE_TYPES } from "../config/quickActionNodeTypes";
import { BM25Index, buildNodeBM25Index } from "./bm25";

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

interface ComputedSearchResults {
  sortedResults: NodeMetadata[];
  groupedResults: SearchResultGroup[];
  allMatches: NodeMetadata[];
}

interface SearchEntry {
  title: string;
  node_type: string;
  namespace: string;
  description: string;
  use_cases: string;
  tags: string;
  metadata: NodeMetadata;
}

const PREFIX_FIELD_BOOSTS: Record<string, number> = {
  title: 8,
  namespace: 4,
  description: 2,
  tags: 3
};

const FUZZY_FIELD_BOOSTS: Record<string, number> = {
  title: 6,
  namespace: 3,
  tags: 3,
  description: 1.5,
  use_cases: 1.5
};

// Field weights for the fuzzy fallback, mirroring the key weights the old
// fuse.js fallback used.
const FUZZY_FIELD_WEIGHTS: ReadonlyArray<{
  field: keyof Pick<
    SearchEntry,
    "title" | "node_type" | "namespace" | "tags" | "description" | "use_cases"
  >;
  weight: number;
}> = [
  { field: "title", weight: 1.0 },
  { field: "node_type", weight: 0.9 },
  { field: "namespace", weight: 0.65 },
  { field: "tags", weight: 0.55 },
  { field: "description", weight: 0.25 },
  { field: "use_cases", weight: 0.25 }
];

// Minimum raw fuzzy score (see fuzzyScore's 0..1 scale) for a field match to
// count. 0.3 admits solid subsequence matches but drops noise, roughly the
// strictness of the old fuse.js threshold of 0.35.
const MIN_FUZZY_FIELD_SCORE = 0.3;

const addCandidateBoost = (
  boosts: Map<string, number>,
  nodeType: string,
  boost: number
) => {
  boosts.set(nodeType, Math.max(boosts.get(nodeType) ?? 0, boost));
};

// Cached search indexes. Both the prefix tree and BM25 index are rebuilt
// together when the metadata changes, so they share a single hash check.
let globalPrefixTree: PrefixTreeSearch | null = null;
let globalBM25Index: BM25Index | null = null;
let globalIndexesHash: string = "";

// WeakMap memo so we don't re-hash the metadata array on every keystroke
// when the caller passes the same array reference (the common case).
const HASH_CACHE = new WeakMap<readonly NodeMetadata[], string>();

const PREFIX_TREE_FIELDS: SearchField[] = [
  { field: "title", weight: 1.0 },
  { field: "namespace", weight: 0.8 },
  { field: "description", weight: 0.4 }
];

// Content hash over node_type/title/namespace/description-length. Order-
// sensitive (filter results preserve catalog order, so omitting the sort is
// safe). Memoized by array reference for ref-stable callers.
function computeNodesHash(nodes: NodeMetadata[]): string {
  const cached = HASH_CACHE.get(nodes);
  if (cached !== undefined) return cached;
  const parts = nodes.map(
    (n) =>
      `${n.node_type}|${n.title ?? ""}|${n.namespace ?? ""}|${
        (n.description ?? "").length
      }`
  );
  const hash = parts.join(",");
  HASH_CACHE.set(nodes, hash);
  return hash;
}

/**
 * Build (or reuse) both the prefix tree and BM25 index for the given node
 * set. Hashing and `formatNodeDocumentation` parsing happen once per
 * rebuild — both indexes consume the same parsed extras.
 */
function ensureIndexes(nodes: NodeMetadata[]): {
  prefixTree: PrefixTreeSearch;
  bm25: BM25Index;
} {
  const nodesHash = computeNodesHash(nodes);
  if (
    globalPrefixTree &&
    globalBM25Index &&
    globalIndexesHash === nodesHash
  ) {
    return { prefixTree: globalPrefixTree, bm25: globalBM25Index };
  }

  const extras = new Map<
    string,
    { description: string; tags: string; useCases: string }
  >();
  for (const node of nodes) {
    const { description, tags, useCases } = formatNodeDocumentation(
      node.description
    );
    extras.set(node.node_type, {
      description,
      tags: tags.join(", "),
      useCases: useCases.raw
    });
  }

  const prefixTree = new PrefixTreeSearch(PREFIX_TREE_FIELDS);
  prefixTree.indexNodes(nodes);
  const bm25 = buildNodeBM25Index(nodes, extras);

  globalPrefixTree = prefixTree;
  globalBM25Index = bm25;
  globalIndexesHash = nodesHash;
  return { prefixTree, bm25 };
}

function ensureBM25Index(nodes: NodeMetadata[]): BM25Index {
  return ensureIndexes(nodes).bm25;
}

function ensurePrefixTree(nodes: NodeMetadata[]): PrefixTreeSearch {
  return ensureIndexes(nodes).prefixTree;
}

const createSearchEntries = (nodes: NodeMetadata[]): SearchEntry[] =>
  nodes.map((node: NodeMetadata) => {
    const { description, tags, useCases } = formatNodeDocumentation(
      node.description
    );
    return {
      title: node.title,
      node_type: node.node_type,
      namespace: node.namespace,
      description,
      use_cases: useCases.raw,
      tags: tags.join(", "),
      metadata: node
    };
  });

const MIN_RESULTS_BEFORE_FUZZY = 100;
const MIN_FUZZY_QUERY_LENGTH = 3;

function collectPrefixCandidateBoosts(
  nodes: NodeMetadata[],
  terms: string[]
): Map<string, number> {
  const boosts = new Map<string, number>();
  const normalizedTerms = terms
    .map((searchTerm) => searchTerm.trim())
    .filter((searchTerm) => searchTerm.length > 0);

  if (normalizedTerms.length === 0) {
    return boosts;
  }

  const prefixTree = ensurePrefixTree(nodes);
  normalizedTerms.forEach((searchTerm) => {
    prefixTree.search(searchTerm, { maxResults: 150 }).forEach((result) => {
      const fieldBoost = PREFIX_FIELD_BOOSTS[result.matchedField] ?? 1;
      const matchBoost = result.matchType === "exact" ? 2 : 1;
      addCandidateBoost(
        boosts,
        result.node.node_type,
        fieldBoost * result.score * matchBoost
      );
    });
  });

  return boosts;
}

function collectFuzzyCandidateBoosts(
  entries: SearchEntry[],
  terms: string[]
): Map<string, number> {
  const boosts = new Map<string, number>();
  const normalizedTerms = terms
    .map((searchTerm) => searchTerm.trim())
    .filter((searchTerm) => searchTerm.length >= MIN_FUZZY_QUERY_LENGTH);

  if (normalizedTerms.length === 0) {
    return boosts;
  }

  normalizedTerms.forEach((searchTerm) => {
    for (const entry of entries) {
      // Score every field, keep the best weighted match — like the old
      // fuse.js weighted-keys search, higher = better.
      let bestWeightedScore = 0;
      let bestField = "";
      for (const { field, weight } of FUZZY_FIELD_WEIGHTS) {
        const rawScore = fuzzyScore(searchTerm, entry[field]);
        if (rawScore < MIN_FUZZY_FIELD_SCORE) {
          continue;
        }
        const weightedScore = rawScore * weight;
        if (weightedScore > bestWeightedScore) {
          bestWeightedScore = weightedScore;
          bestField = field;
        }
      }
      if (bestWeightedScore > 0) {
        const fieldBoost = FUZZY_FIELD_BOOSTS[bestField] ?? 1;
        addCandidateBoost(
          boosts,
          entry.metadata.node_type,
          bestWeightedScore * fieldBoost
        );
      }
    }
  });

  return boosts;
}

/**
 * BM25-based candidate boosts. Acts as the primary fuzzy/relevance signal
 * for queries the prefix tree can't satisfy on its own — full-text term
 * matches in title/namespace/tags/description with proper IDF weighting.
 */
const BM25_BOOST_SCALE = 1.5;
const BM25_MIN_TERM_LENGTH = 2;

function collectBM25CandidateBoosts(
  nodes: NodeMetadata[],
  terms: string[]
): Map<string, number> {
  const boosts = new Map<string, number>();
  const normalizedTerms = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= BM25_MIN_TERM_LENGTH);
  if (normalizedTerms.length === 0 || nodes.length === 0) return boosts;

  const index = ensureBM25Index(nodes);
  for (const term of normalizedTerms) {
    for (const result of index.search(term, 200)) {
      addCandidateBoost(boosts, result.id, result.score * BM25_BOOST_SCALE);
    }
  }
  return boosts;
}

const mergeCandidateBoosts = (
  target: Map<string, number>,
  source: Map<string, number>
) => {
  source.forEach((boost, nodeType) => addCandidateBoost(target, nodeType, boost));
};

export function rankSearchNodes(
  nodes: NodeMetadata[],
  term: string,
  recentNodeTypes: readonly string[] = [],
  boostedNodeTypes: readonly string[] = QUICK_ACTION_NODE_TYPES
): NodeMetadata[] {
  const searchTerms = [term];
  if (term.includes(".")) {
    const parts = term.split(".").filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart !== term) {
      searchTerms.push(lastPart);
    }
  }

  const expandedSearchTerms = searchTerms.flatMap(searchTermsFromQuery);
  const candidateBoosts = term.trim()
    ? collectPrefixCandidateBoosts(nodes, expandedSearchTerms)
    : new Map<string, number>();

  // Always merge BM25 scores when there's a query. BM25 catches fuzzy/term
  // matches the prefix tree misses (e.g. queries that match description
  // words mid-phrase) and provides principled IDF weighting.
  if (term.trim()) {
    mergeCandidateBoosts(
      candidateBoosts,
      collectBM25CandidateBoosts(nodes, expandedSearchTerms)
    );
  }

  let ranked = rankNodeMetadata(nodes, expandedSearchTerms, {
    boostedNodeTypes,
    candidateBoosts,
    includeCandidateOnlyMatches: true,
    includeProviderNodes: true,
    recentNodeTypes
  });

  // Fall back to the fuzzy scorer only if BM25 + prefix didn't surface
  // enough results (e.g. subsequence matches that BM25 won't catch).
  if (term.trim().length >= MIN_FUZZY_QUERY_LENGTH && ranked.length < MIN_RESULTS_BEFORE_FUZZY) {
    mergeCandidateBoosts(
      candidateBoosts,
      collectFuzzyCandidateBoosts(createSearchEntries(nodes), expandedSearchTerms)
    );
    ranked = rankNodeMetadata(nodes, expandedSearchTerms, {
      boostedNodeTypes,
      candidateBoosts,
      includeCandidateOnlyMatches: true,
      includeProviderNodes: true,
      recentNodeTypes
    });
  }

  return ranked.map(({ meta, score }) => ({
    ...meta,
    searchInfo: { score: -score, matches: [] }
  }));
}

export function computeSearchResults(
  metadata: NodeMetadata[],
  term: string,
  selectedPath: string[],
  selectedInputType?: TypeName,
  selectedOutputType?: TypeName,
  strictMatch: boolean = false,
  selectedProviderType: "all" | "api" | "local" = "all",
  recentNodeTypes: readonly string[] = []
): ComputedSearchResults {
  const selectedPathString = selectedPath.join(".");
  const hasSearchTerm = term.trim().length > 0;
  const hasTypeFilters = selectedInputType || selectedOutputType;
  // Filter out default namespace nodes
  const filteredMetadata = metadata.filter(
    (node) => node.namespace !== "default"
  );

  // Apply provider filtering before type/path filtering so all follow-up
  // logic works on a consistent subset.
  const providerFilteredMetadata =
    selectedProviderType === "all"
      ? filteredMetadata
      : filteredMetadata.filter(
          (node) =>
            getProviderKindForNamespace(node.namespace) === selectedProviderType
        );

  // Apply type filtering if needed
  const typeFilteredMetadata = hasTypeFilters
    ? strictMatch
      ? filterDataByExactType(
          providerFilteredMetadata,
          selectedInputType,
          selectedOutputType
        )
      : filterDataByType(
          providerFilteredMetadata,
          selectedInputType,
          selectedOutputType
        )
    : providerFilteredMetadata;

  // Filter by path if one is selected
  let pathFilteredMetadata = typeFilteredMetadata;
  if (selectedPathString) {
    pathFilteredMetadata = typeFilteredMetadata.filter((node) => {
      const isExactMatch = node.namespace === selectedPathString;
      const isDirectChild =
        node.namespace.startsWith(selectedPathString + ".") &&
        node.namespace.split(".").length ===
          selectedPathString.split(".").length + 1;
      const isRootNamespace = !selectedPathString.includes(".");
      const isDescendant = node.namespace.startsWith(selectedPathString + ".");
      return isExactMatch || isDirectChild || (isRootNamespace && isDescendant);
    });
  }

  // If no search term, still rank with recent and quick-action boosts.
  if (!hasSearchTerm) {
    const sortedResults = rankSearchNodes(
      pathFilteredMetadata,
      "",
      recentNodeTypes
    );

    return {
      sortedResults,
      groupedResults: [
        { title: selectedPathString || "All Nodes", nodes: sortedResults }
      ],
      allMatches: sortedResults
    };
  }

  const sortedResults = rankSearchNodes(
    pathFilteredMetadata,
    term,
    recentNodeTypes
  );

  return {
    sortedResults,
    groupedResults: [{ title: "Results", nodes: sortedResults }],
    allMatches: sortedResults
  };
}

export function filterNodesUtil(
  nodes: NodeMetadata[],
  searchTerm: string,
  selectedPath: string[],
  selectedInputType: string,
  selectedOutputType: string,
  searchResults: NodeMetadata[],
  selectedProviderType: "all" | "api" | "local" = "all"
): NodeMetadata[] {
  if (!nodes) {
    return [];
  }

  const selectedPathString = selectedPath.join(".");
  const minSearchTermLength =
    searchTerm.includes("+") ||
    searchTerm.includes("-") ||
    searchTerm.includes("*") ||
    searchTerm.includes("/")
      ? 0
      : 1;

  let filteredNodes: NodeMetadata[];

  if (
    searchTerm.length > minSearchTermLength ||
    selectedInputType ||
    selectedOutputType
  ) {
    const searchResultKeys = new Set(
      searchResults.map((r) => `${r.namespace}::${r.title}`)
    );
    filteredNodes = nodes.filter((node) =>
      searchResultKeys.has(`${node.namespace}::${node.title}`)
    );
  } else {
    filteredNodes = nodes.filter((node) => {
      if (
        selectedProviderType !== "all" &&
        getProviderKindForNamespace(node.namespace) !== selectedProviderType
      ) {
        return false;
      }
      const isExactMatch = node.namespace === selectedPathString;
      const isDirectChild =
        node.namespace.startsWith(selectedPathString + ".") &&
        node.namespace.split(".").length ===
          selectedPathString.split(".").length + 1;
      const isRootNamespace = !selectedPathString.includes(".");
      const isDescendant = node.namespace.startsWith(selectedPathString + ".");
      return isExactMatch || isDirectChild || (isRootNamespace && isDescendant);
    });
  }

  return filteredNodes.sort((a, b) => {
    const namespaceComparison = a.namespace.localeCompare(b.namespace);
    return namespaceComparison !== 0
      ? namespaceComparison
      : a.title.localeCompare(b.title);
  });
}
