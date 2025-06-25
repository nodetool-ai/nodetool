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

  const titleResults = titleFuse.search(term).map((result) => ({
    ...result.item.metadata,
    searchInfo: {
      score: result.score,
      matches: result.matches
    }
  }));

  const titleTagsResults = titleTagsFuse
    .search(term)
    .filter(
      (result) =>
        !titleResults.some(
          (r) => r.node_type === result.item.metadata.node_type
        )
    )
    .map((result) => ({
      ...result.item.metadata,
      searchInfo: {
        score: result.score,
        matches: result.matches
      }
    }));

  const termNoSpaces = term.replace(/\s+/g, "");
  const results = new Map<string, any>();
  [
    ...descriptionFuse.search(term),
    ...descriptionFuse.search(termNoSpaces)
  ].forEach((result) => {
    const nodeType = result.item.metadata.node_type;
    if (!results.has(nodeType)) {
      results.set(nodeType, result);
    }
  });

  const descriptionResults = Array.from(results.values())
    .filter(
      (result) =>
        !titleResults.some(
          (r) => r.node_type === result.item.metadata.node_type
        ) &&
        !titleTagsResults.some(
          (r) => r.node_type === result.item.metadata.node_type
        )
    )
    .map((result) => ({
      ...result.item.metadata,
      searchInfo: {
        score: result.score,
        matches: result.matches
      }
    }));

  return [
    { title: "Name", nodes: titleResults },
    { title: "Namespace + Tags", nodes: titleTagsResults },
    { title: "Description", nodes: descriptionResults }
  ].filter((group) => group.nodes.length > 0);
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

  const groupedResults = performGroupedSearch(allEntries, term);
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
  if (!nodes) return [];

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
