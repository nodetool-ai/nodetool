import Fuse from "fuse.js";
import { NodeMetadata, TypeName } from "../stores/ApiTypes";
import {
  filterDataByType,
  filterDataByExactType
} from "../components/node_menu/typeFilterUtils";
import { formatNodeDocumentation } from "../stores/formatNodeDocumentation";
import { fuseOptions, ExtendedFuseOptions } from "../stores/fuseOptions";

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

export function performGroupedSearch(
  entries: any[],
  term: string
): SearchResultGroup[] {
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
  } as ExtendedFuseOptions<any>);

  // Collect all results with their scores for ranking
  const allResults: Array<{ node: any; score: number; source: string }> = [];

  // Title matches (highest priority - score boost)
  titleFuse.search(term).forEach((result) => {
    allResults.push({
      node: {
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
        }
      },
      score: (result.score || 0) * 0.5, // Boost title matches
      source: "title"
    });
  });

  // Namespace + Tags matches
  titleTagsFuse.search(term).forEach((result) => {
    // Skip if already in results
    if (allResults.some((r) => r.node.node_type === result.item.metadata.node_type)) {
      return;
    }
    allResults.push({
      node: {
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
        }
      },
      score: (result.score || 0) * 0.7, // Slight boost for namespace/tags
      source: "namespace"
    });
  });

  // Description matches
  const termNoSpaces = term.replace(/\s+/g, "");
  const descResults = new Map<string, any>();
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
    if (allResults.some((r) => r.node.node_type === result.item.metadata.node_type)) {
      return;
    }
    allResults.push({
      node: {
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
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
  strictMatch: boolean = false
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

  // Apply type filtering if needed
  const typeFilteredMetadata = hasTypeFilters
    ? strictMatch
      ? filterDataByExactType(
          filteredMetadata,
          selectedInputType as TypeName,
          selectedOutputType as TypeName
        )
      : filterDataByType(
          filteredMetadata,
          selectedInputType as TypeName,
          selectedOutputType as TypeName
        )
    : filteredMetadata;

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
  const allEntries = pathFilteredMetadata.map((node: NodeMetadata) => {
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
  });

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

  const searchMatchedNodes = groupedResults.flatMap((group) => group.nodes);

  const sortedResults = searchMatchedNodes.sort((a, b) => {
    const namespaceComparison = a.namespace.localeCompare(b.namespace);
    return namespaceComparison !== 0
      ? namespaceComparison
      : a.title.localeCompare(b.title);
  });

  return {
    sortedResults,
    groupedResults,
    allMatches: searchMatchedNodes
  };
}

export function filterNodesUtil(
  nodes: NodeMetadata[],
  searchTerm: string,
  selectedPath: string[],
  selectedInputType: string,
  selectedOutputType: string,
  searchResults: NodeMetadata[]
): NodeMetadata[] {
  if (!nodes) {return [];}

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
