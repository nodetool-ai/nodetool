import Fuse, { FuseResult } from "fuse.js";
import { NodeMetadata, TypeName } from "../stores/ApiTypes";
import {
  filterDataByType,
  filterDataByExactType
} from "../components/node_menu/typeFilterUtils";
import { formatNodeDocumentation } from "../stores/formatNodeDocumentation";
import { fuseOptions, ExtendedFuseOptions, FuseMatch } from "../stores/fuseOptions";
import { PrefixTreeSearch, SearchField } from "./PrefixTreeSearch";
import { getProviderKindForNamespace } from "./nodeProvider";
import { rankNodeMetadata, searchTermsFromQuery } from "./nodeRanking";
import { QUICK_ACTION_NODE_TYPES } from "../config/quickActionNodeTypes";

/** Stop words to filter from multi-word queries */
const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "in",
  "on",
  "of",
  "for",
  "and",
  "or",
  "by",
  "with",
  "from",
  "at",
  "as",
  "it",
  "be",
  "do",
  "no",
  "so",
  "if",
  "up",
  "to",
  "not",
  "but",
  "are",
  "was",
  "has",
  "its",
  "all",
  "into",
  "that",
  "this",
  "can",
  "will",
  "may"
]);

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

const GROUP_PRIORITY: Record<string, number> = {
  Name: 0,
  Results: 1,
  "Namespace + Tags": 2,
  Description: 3
};

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

// Global prefix tree instance for fast prefix searches
// Cache is keyed by the metadata array to enable proper reuse
let globalPrefixTree: PrefixTreeSearch | null = null;
let globalPrefixTreeNodesHash: string = "";

/**
 * Initialize or update the global prefix tree with node metadata
 * Uses a hash of node types to detect when re-indexing is needed
 */
function ensurePrefixTree(nodes: NodeMetadata[]): PrefixTreeSearch {
  // Create a hash of the nodes to detect changes
  const nodesHash = nodes
    .map((n) => n.node_type)
    .sort()
    .join(",");

  // Check if we need to rebuild the tree
  if (!globalPrefixTree || globalPrefixTreeNodesHash !== nodesHash) {
    const searchFields: SearchField[] = [
      { field: "title", weight: 1.0 },
      { field: "namespace", weight: 0.8 },
      { field: "description", weight: 0.4 }
    ];
    globalPrefixTree = new PrefixTreeSearch(searchFields);
    globalPrefixTree.indexNodes(nodes);
    globalPrefixTreeNodesHash = nodesHash;
  }
  return globalPrefixTree;
}

/**
 * Determine if a query is suitable for prefix tree search
 * Prefix tree is best for prefix queries, including multi-word queries
 * where each word is searched individually
 */
function shouldUsePrefixTree(term: string): boolean {
  // Avoid for very short queries (< 2 chars)
  if (term.length < 2) {
    return false;
  }
  return true;
}

/**
 * For multi-word queries, search each word individually in the prefix tree
 * and combine results, scoring by how many words matched and which fields matched.
 * Exact title matches are boosted to the top.
 */
function multiWordPrefixSearch(
  prefixTree: PrefixTreeSearch,
  words: string[],
  originalQuery: string
): {
  titleMatches: NodeMetadata[];
  namespaceMatches: NodeMetadata[];
  descriptionMatches: NodeMetadata[];
} {
  const normalizedQuery = originalQuery.toLowerCase().trim();

  // Collect per-word results
  const perWordResults: Map<
    string,
    { node: NodeMetadata; fields: Set<string>; wordCount: number }
  >[] = [];

  words.forEach((word) => {
    const wordResults = prefixTree.search(word, { maxResults: 200 });
    const wordMap = new Map<
      string,
      { node: NodeMetadata; fields: Set<string>; wordCount: number }
    >();

    wordResults.forEach((result) => {
      const existing = wordMap.get(result.node.node_type);
      if (existing) {
        existing.fields.add(result.matchedField);
      } else {
        wordMap.set(result.node.node_type, {
          node: result.node,
          fields: new Set([result.matchedField]),
          wordCount: 1
        });
      }
    });

    perWordResults.push(wordMap);
  });

  // Merge: count how many query words each node matched
  const merged = new Map<
    string,
    { node: NodeMetadata; matchedWords: number; fields: Set<string> }
  >();

  perWordResults.forEach((wordMap) => {
    wordMap.forEach((entry, nodeType) => {
      const existing = merged.get(nodeType);
      if (existing) {
        existing.matchedWords += 1;
        entry.fields.forEach((f) => existing.fields.add(f));
      } else {
        merged.set(nodeType, {
          node: entry.node,
          matchedWords: 1,
          fields: new Set(entry.fields)
        });
      }
    });
  });

  // Sort by: exact title match first, then matchedWords descending, then alphabetically
  const sorted = Array.from(merged.values()).sort((a, b) => {
    const aExact = a.node.title.toLowerCase() === normalizedQuery ? 1 : 0;
    const bExact = b.node.title.toLowerCase() === normalizedQuery ? 1 : 0;
    if (bExact !== aExact) {
      return bExact - aExact;
    }
    if (b.matchedWords !== a.matchedWords) {
      return b.matchedWords - a.matchedWords;
    }
    return a.node.title.localeCompare(b.node.title);
  });

  // Group by best matched field (title > namespace > description)
  const titleMatches: NodeMetadata[] = [];
  const namespaceMatches: NodeMetadata[] = [];
  const descriptionMatches: NodeMetadata[] = [];

  sorted.forEach((entry) => {
    if (entry.fields.has("title")) {
      titleMatches.push(entry.node);
    } else if (entry.fields.has("namespace")) {
      namespaceMatches.push(entry.node);
    } else if (entry.fields.has("description")) {
      descriptionMatches.push(entry.node);
    }
  });

  return { titleMatches, namespaceMatches, descriptionMatches };
}

export function performGroupedSearch(
  entries: SearchEntry[],
  term: string
): SearchResultGroup[] {
  // Extract node metadata from entries
  const nodes: NodeMetadata[] = entries.map((e) => e.metadata);

  // Try prefix tree search first for suitable queries
  if (shouldUsePrefixTree(term)) {
    const prefixTree = ensurePrefixTree(nodes);
    const words = term
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !QUERY_STOP_WORDS.has(w.toLowerCase()));

    let titleMatches: NodeMetadata[] = [];
    let namespaceMatches: NodeMetadata[] = [];
    let descriptionMatches: NodeMetadata[] = [];

    if (words.length <= 1) {
      // Single word: use direct prefix search as before
      const prefixResults = prefixTree.search(term, { maxResults: 100 });

      prefixResults.forEach((result) => {
        if (result.matchedField === "title") {
          titleMatches.push(result.node);
        } else if (result.matchedField === "namespace") {
          namespaceMatches.push(result.node);
        } else if (result.matchedField === "description") {
          descriptionMatches.push(result.node);
        }
      });
    } else {
      // Multi-word: search each word and combine results
      const combined = multiWordPrefixSearch(prefixTree, words, term);
      titleMatches = combined.titleMatches;
      namespaceMatches = combined.namespaceMatches;
      descriptionMatches = combined.descriptionMatches;
    }

    const groups: SearchResultGroup[] = [];
    if (titleMatches.length > 0) {
      groups.push({ title: "Name", nodes: titleMatches });
    }
    if (namespaceMatches.length > 0) {
      groups.push({ title: "Namespace + Tags", nodes: namespaceMatches });
    }
    if (descriptionMatches.length > 0) {
      groups.push({ title: "Description", nodes: descriptionMatches });
    }

    // Return prefix tree results if we found anything
    if (groups.length > 0) {
      return groups;
    }
  }

  // Fall back to Fuse.js for complex searches or when prefix tree didn't find results
  const titleFuse = new Fuse(entries, {
    ...fuseOptions,
    threshold: 0.2,
    distance: 3,
    minMatchCharLength: 2,
    keys: [{ name: "title", weight: 1.0 }]
  });

  const titleTagsFuse = new Fuse(entries, {
    ...fuseOptions,
    threshold: 0.2,
    distance: 2,
    minMatchCharLength: 1,
    keys: [
      { name: "namespace", weight: 0.8 },
      { name: "tags", weight: 0.6 }
    ]
  });

  const descriptionFuse = new Fuse(entries, {
    ...fuseOptions,
    threshold: 0.29,
    distance: 100,
    minMatchCharLength: 3,
    keys: [
      { name: "description", weight: 0.95 },
      { name: "use_cases", weight: 0.9 }
    ],
    tokenize: true,
    tokenSeparator: /[\s.,\-_]+/,
    findAllMatches: true,
    ignoreLocation: true,
    includeMatches: true,
    useExtendedSearch: true
  } as ExtendedFuseOptions<SearchEntry>);

  // Collect all results with their scores for ranking
  const allResults: Array<{
    node: NodeMetadata;
    score: number;
    source: string;
  }> = [];

  // Title matches (highest priority - score boost)
  titleFuse.search(term).forEach((result) => {
    allResults.push({
      node: {
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
            ? result.matches.map((m) => ({
                key: m.key || "",
                value: m.value || "",
                indices: Array.from(m.indices || [])
              }))
            : undefined
        }
      },
      score: (result.score || 0) * 0.5, // Boost title matches
      source: "title"
    });
  });

  // Namespace + Tags matches
  titleTagsFuse.search(term).forEach((result) => {
    // Skip if already in results
    if (
      allResults.some(
        (r) => r.node.node_type === result.item.metadata.node_type
      )
    ) {
      return;
    }
    allResults.push({
      node: {
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
            ? result.matches.map((m) => ({
                key: m.key || "",
                value: m.value || "",
                indices: Array.from(m.indices || [])
              }))
            : undefined
        }
      },
      score: (result.score || 0) * 0.7, // Slight boost for namespace/tags
      source: "namespace"
    });
  });

  // Description matches
  const termNoSpaces = term.replace(/\s+/g, "");
  const descResults = new Map<string, FuseResult<SearchEntry>>();
  [
    ...descriptionFuse.search(term),
    ...descriptionFuse.search(termNoSpaces)
  ].forEach((result) => {
    const nodeType = result.item.metadata.node_type;
    if (!descResults.has(nodeType)) {
      descResults.set(nodeType, result);
    }
  });

  Array.from(descResults.values()).forEach((result) => {
    // Skip if already in results
    if (
      allResults.some(
        (r) => r.node.node_type === result.item.metadata.node_type
      )
    ) {
      return;
    }
    allResults.push({
      node: {
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
            ? result.matches.map((m: FuseMatch) => ({
                key: m.key ?? "",
                value: m.value ?? "",
                indices: m.indices ? Array.from(m.indices) : []
              }))
            : undefined
        }
      },
      score: result.score || 0,
      source: "description"
    });
  });

  // Sort by score (lower is better in Fuse.js)
  allResults.sort((a, b) => a.score - b.score);

  // Return as a single flat group for display
  const rankedNodes = allResults.map((r) => r.node);

  if (rankedNodes.length === 0) {
    return [];
  }

  return [{ title: "Results", nodes: rankedNodes }];
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

  let ranked = rankNodeMetadata(nodes, expandedSearchTerms, {
    boostedNodeTypes,
    candidateBoosts,
    includeCandidateOnlyMatches: true,
    includeProviderNodes: true,
    recentNodeTypes
  });

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
) {
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
