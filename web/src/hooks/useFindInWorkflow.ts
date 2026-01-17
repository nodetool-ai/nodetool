import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore } from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Custom hook for searching and navigating to nodes within the workflow editor.
 * 
 * Provides a complete search workflow including opening the search dialog,
 * filtering nodes by name, type, or ID, navigating through results,
 * and centering the viewport on selected nodes. Supports debounced search
 * for responsive typing with large node counts.
 * 
 * @returns Object containing:
 *   - isOpen: Whether the search dialog is visible
 *   - searchTerm: Current search input
 *   - results: Array of matching nodes
 *   - selectedIndex: Currently selected result index
 *   - openFind: Function to open search dialog
 *   - closeFind: Function to close search dialog
 *   - performSearch: Debounced search function
 *   - goToSelected: Navigate to and select current result
 *   - navigateNext/navigatePrevious: Navigate through results
 *   - clearSearch: Reset search state
 * 
 * @example
 * ```typescript
 * const { isOpen, results, openFind, goToSelected } = useFindInWorkflow();
 * 
 * // Open search with Ctrl+F / Cmd+F
 * useEffect(() => {
 *   const handleKeyDown = (e) => {
 *     if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
 *       e.preventDefault();
 *       openFind();
 *     }
 *   };
 *   window.addEventListener('keydown', handleKeyDown);
 *   return () => window.removeEventListener('keydown', handleKeyDown);
 * }, [openFind]);
 * ```
 */

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
    getNodeDisplayName
  };
};
