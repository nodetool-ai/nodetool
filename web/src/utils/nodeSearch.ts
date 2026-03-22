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

export function computeSearchResults(
  metadata: NodeMetadata[],
  term: string,
  selectedPath: string[],
  selectedInputType?: TypeName,
  selectedOutputType?: TypeName,
  strictMatch: boolean = false,
  selectedProviderType: "all" | "api" | "local" = "all"
) {
  const selectedPathString = selectedPath.join(".");
  const hasSearchTerm = term.trim().length > 0;
  const hasTypeFilters = selectedInputType || selectedOutputType;
  const searchTerms = [term];

  // If the user types a full namespace,
  // also search using the last segment so results are found even when the full
  // dotted path doesn't fuzzy-match well.
  if (term.includes(".")) {
    const parts = term.split(".").filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart !== term) {
      searchTerms.push(lastPart);
    }
  }

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

  // If no search term, we can skip the expensive search operations
  if (!hasSearchTerm) {
    const sortedResults = pathFilteredMetadata.sort((a, b) => {
      const namespaceComparison = a.namespace.localeCompare(b.namespace);
      return namespaceComparison !== 0
        ? namespaceComparison
        : a.title.localeCompare(b.title);
    });

    return {
      sortedResults,
      groupedResults: [
        { title: selectedPathString || "All Nodes", nodes: sortedResults }
      ],
      allMatches: sortedResults
    };
  }

  // Only perform search operations if we have a search term
  const allEntries: SearchEntry[] = pathFilteredMetadata.map(
    (node: NodeMetadata) => {
      const { description, tags, useCases } = formatNodeDocumentation(
        node.description
      );
      return {
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: description,
        use_cases: useCases.raw,
        tags: tags.join(", "),
        metadata: node
      };
    }
  );

  // Run searches for each derived term and merge results while preserving order
  const groupedResultsMap = new Map<string, Map<string, NodeMetadata>>();

  const addToGroup = (title: string, node: NodeMetadata) => {
    if (!groupedResultsMap.has(title)) {
      groupedResultsMap.set(title, new Map<string, NodeMetadata>());
    }
    const group = groupedResultsMap.get(title)!;
    if (!group.has(node.node_type)) {
      group.set(node.node_type, node);
    }
  };

  searchTerms.forEach((searchTerm) => {
    const groups = performGroupedSearch(allEntries, searchTerm);
    groups.forEach((group) => {
      group.nodes.forEach((node) => addToGroup(group.title, node));
    });

    // Add exact namespace matches explicitly so full namespaces work even if Fuse misses
    const exactNamespaceMatches = allEntries
      .filter((entry) => entry.namespace === searchTerm)
      .map((entry) => ({
        ...entry.metadata,
        searchInfo: { score: 0, matches: [] }
      }));

    exactNamespaceMatches.forEach((node) =>
      addToGroup("Namespace + Tags", node)
    );
  });

  const groupedResults: SearchResultGroup[] = Array.from(
    groupedResultsMap.entries()
  )
    .map(([title, nodes]) => ({
      title,
      nodes: Array.from(nodes.values())
    }))
    .filter((group) => group.nodes.length > 0);

  const rankedNodes = new Map<
    string,
    { node: NodeMetadata; priority: number; score: number; index: number }
  >();
  let insertionIndex = 0;

  groupedResults.forEach((group) => {
    const priority = GROUP_PRIORITY[group.title] ?? 99;
    group.nodes.forEach((node) => {
      const candidate = {
        node,
        priority,
        score: node.searchInfo?.score ?? 1,
        index: insertionIndex++
      };
      const existing = rankedNodes.get(node.node_type);
      if (
        !existing ||
        candidate.priority < existing.priority ||
        (candidate.priority === existing.priority &&
          candidate.score < existing.score) ||
        (candidate.priority === existing.priority &&
          candidate.score === existing.score &&
          candidate.index < existing.index)
      ) {
        rankedNodes.set(node.node_type, candidate);
      }
    });
  });

  const sortedResults = Array.from(rankedNodes.values())
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.node);

  const allMatches = Array.from(rankedNodes.values()).map(
    (entry) => entry.node
  );

  return {
    sortedResults,
    groupedResults: [{ title: "Results", nodes: sortedResults }],
    allMatches
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
