import Fuse from "fuse.js";
import { NodeMetadata, TypeName } from "../stores/ApiTypes";
import {
  filterDataByType,
  filterDataByExactType
} from "../components/node_menu/typeFilterUtils";
import { formatNodeDocumentation } from "../stores/formatNodeDocumentation";
import { fuseOptions } from "../stores/fuseOptions";
import { PrefixTreeSearch, SearchField } from "./PrefixTreeSearch";
import { getProviderKindForNamespace } from "./nodeProvider";
import { rankNodeMetadata, searchTermsFromQuery } from "./nodeRanking";
import { QUICK_ACTION_NODE_TYPES } from "../config/quickActionNodeTypes";
import { BM25Index, buildNodeBM25Index } from "./bm25";

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

export interface ComputedSearchResults {
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

const FUSE_FIELD_BOOSTS: Record<string, number> = {
  title: 6,
  namespace: 3,
  tags: 3,
  description: 1.5,
  use_cases: 1.5
};

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

const MIN_RESULTS_BEFORE_FUSE = 100;
const MIN_FUSE_QUERY_LENGTH = 3;

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

function collectFuseCandidateBoosts(
  entries: SearchEntry[],
  terms: string[]
): Map<string, number> {
  const boosts = new Map<string, number>();
  const normalizedTerms = terms
    .map((searchTerm) => searchTerm.trim())
    .filter((searchTerm) => searchTerm.length >= MIN_FUSE_QUERY_LENGTH);

  if (normalizedTerms.length === 0) {
    return boosts;
  }

  const fuse = new Fuse(entries, {
    ...fuseOptions,
    threshold: 0.35,
    distance: 80,
    minMatchCharLength: 2,
    ignoreLocation: true,
    includeMatches: true,
    keys: [
      { name: "title", weight: 1.0 },
      { name: "node_type", weight: 0.9 },
      { name: "namespace", weight: 0.65 },
      { name: "tags", weight: 0.55 },
      { name: "description", weight: 0.25 },
      { name: "use_cases", weight: 0.25 }
    ]
  });

  normalizedTerms.forEach((searchTerm) => {
    fuse.search(searchTerm).forEach((result) => {
      const fuseScore = result.score ?? 1;
      const bestFieldBoost = Math.max(
        1,
        ...(result.matches ?? []).map(
          (match) => FUSE_FIELD_BOOSTS[match.key ?? ""] ?? 1
        )
      );
      addCandidateBoost(
        boosts,
        result.item.metadata.node_type,
        Math.max(0, 1 - fuseScore) * bestFieldBoost
      );
    });
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

  // Fall back to Fuse only if BM25 + prefix didn't surface enough results
  // (e.g. typo-tolerant fuzzy matches that BM25 won't catch).
  if (term.trim().length >= MIN_FUSE_QUERY_LENGTH && ranked.length < MIN_RESULTS_BEFORE_FUSE) {
    mergeCandidateBoosts(
      candidateBoosts,
      collectFuseCandidateBoosts(createSearchEntries(nodes), expandedSearchTerms)
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
          selectedInputType as TypeName,
          selectedOutputType as TypeName
        )
      : filterDataByType(
          providerFilteredMetadata,
          selectedInputType as TypeName,
          selectedOutputType as TypeName
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
    filteredNodes = nodes.filter((node) =>
      searchResults.some(
        (result) =>
          result.title === node.title && result.namespace === node.namespace
      )
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
