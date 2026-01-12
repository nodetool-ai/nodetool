import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore } from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { getNodeDisplayName, searchNodes } from "../utils/findInWorkflowUtils";

export const useFindInWorkflow = () => {
  const {
    isOpen,
    searchTerm,
    results,
    selectedIndex,
    openFind,
    closeFind,
    setSearchTerm,
    setResults,
    setSelectedIndex,
    navigateNext,
    navigatePrevious,
    clearSearch
  } = useFindInWorkflowStore();

  const nodes = useNodes((state) => state.nodes);
  const { setCenter, fitView } = useReactFlow();
  const metadataStore = useMetadataStore();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    (term: string) => {
      if (!term.trim()) {
        setResults([]);
        return;
      }

      const matchingResults = searchNodes(term, nodes, (node) =>
        getNodeDisplayName(node, metadataStore)
      );
      setResults(matchingResults);
    },
    [nodes, metadataStore, setResults]
  );

  const debouncedSearch = useCallback(
    (term: string) => {
      // Update search term immediately for responsive typing
      setSearchTerm(term);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Debounce the actual search
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(term);
      }, 150);
    },
    [performSearch, setSearchTerm]
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

  return {
    isOpen,
    searchTerm,
    results,
    selectedIndex,
    totalCount: results.length,
    openFind,
    closeFind,
    performSearch: debouncedSearch,
    immediateSearch: performSearch,
    goToSelected,
    navigateNext,
    navigatePrevious,
    clearSearch,
    selectNode,
    getNodeDisplayName: (node: Node<NodeData>) => getNodeDisplayName(node, metadataStore)
  };
};
