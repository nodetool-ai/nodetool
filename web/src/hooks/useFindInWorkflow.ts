import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore } from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

export const useFindInWorkflow = () => {
  const {
    isOpen,
    searchTerm,
    results,
    selectedIndex,
    recentSearches,
    showRecentSearches,
    openFind,
    closeFind,
    setSearchTerm,
    setResults,
    setSelectedIndex,
    navigateNext,
    navigatePrevious,
    clearSearch,
    addRecentSearch,
    clearRecentSearches,
    setShowRecentSearches
  } = useFindInWorkflowStore();

  const nodes = useNodes((state) => state.nodes);
  const { setCenter, fitView } = useReactFlow();
  const metadataStore = useMetadataStore();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSearchTermRef = useRef<string>("");

  const getNodeDisplayName = useCallback(
    (node: Node<NodeData>): string => {
      const title = node.data?.properties?.name;
      if (title && typeof title === "string" && title.trim()) {
        return title;
      }
      const nodeType = node.type ?? "";
      const metadata = metadataStore.getMetadata(nodeType);
      if (metadata?.title) {
        return metadata.title;
      }
      return nodeType.split(".").pop() || node.id;
    },
    [metadataStore]
  );

  const searchNodes = useCallback(
    (term: string, nodeList: Node<NodeData>[]): Node<NodeData>[] => {
      if (!term.trim()) {
        return [];
      }

      const normalizedTerm = term.toLowerCase().trim();
      const results: Node<NodeData>[] = [];

      for (const node of nodeList) {
        const displayName = getNodeDisplayName(node).toLowerCase();
        const nodeType = (node.type ?? "").toLowerCase();
        const nodeId = node.id.toLowerCase();

        if (
          displayName.includes(normalizedTerm) ||
          nodeType.includes(normalizedTerm) ||
          nodeId.includes(normalizedTerm)
        ) {
          results.push(node);
        }
      }

      return results;
    },
    [getNodeDisplayName]
  );

  const performSearch = useCallback(
    (term: string) => {
      if (!term.trim()) {
        setResults([]);
        return;
      }

      const matchingNodes = searchNodes(term, nodes);
      setResults(
        matchingNodes.map((node, index) => ({ node, matchIndex: index }))
      );
    },
    [nodes, searchNodes, setResults]
  );

  const debouncedSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (term.trim()) {
        searchTimeoutRef.current = setTimeout(() => {
          performSearch(term);
          if (term !== previousSearchTermRef.current && term.trim()) {
            addRecentSearch(term);
            previousSearchTermRef.current = term;
          }
        }, 150);
      } else {
        setResults([]);
        setShowRecentSearches(true);
      }
    },
    [performSearch, setSearchTerm, setResults, addRecentSearch, setShowRecentSearches]
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const goToSelected = useCallback(() => {
    if (
      results.length === 0 ||
      selectedIndex < 0 ||
      selectedIndex >= results.length
    ) {
      return;
    }

    const result = results[selectedIndex];
    if (!result) {
      return;
    }

    const { node } = result;

    setCenter(
      node.position.x + (node.width || 200) / 2,
      node.position.y + (node.height || 100) / 2,
      { zoom: 1, duration: 300 }
    );

    fitView({
      nodes: [node],
      duration: 300,
      minZoom: 0.5,
      maxZoom: 2
    });
  }, [results, selectedIndex, setCenter, fitView]);

  const selectNode = useCallback(
    (index: number) => {
      if (index >= 0 && index < results.length) {
        setSelectedIndex(index);
      }
    },
    [results.length, setSelectedIndex]
  );

  const selectRecentSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      setShowRecentSearches(false);
      performSearch(term);
      if (term !== previousSearchTermRef.current) {
        addRecentSearch(term);
        previousSearchTermRef.current = term;
      }
    },
    [setSearchTerm, setShowRecentSearches, performSearch, addRecentSearch]
  );

  return {
    isOpen,
    searchTerm,
    results,
    selectedIndex,
    totalCount: results.length,
    recentSearches,
    showRecentSearches,
    openFind,
    closeFind,
    performSearch: debouncedSearch,
    immediateSearch: performSearch,
    goToSelected,
    navigateNext,
    navigatePrevious,
    clearSearch,
    selectNode,
    getNodeDisplayName,
    selectRecentSearch,
    clearRecentSearches,
    setShowRecentSearches
  };
};
