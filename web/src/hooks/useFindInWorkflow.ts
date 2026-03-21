import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore } from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Hook to implement "Find in Workflow" functionality.
 * 
 * Provides search capabilities for finding nodes within the current workflow.
 * Supports searching by node name, node type, or node ID with debounced
 * input and keyboard navigation through results.
 * 
 * @returns Object containing:
 *   - isOpen: Whether the find dialog is open
 *   - searchTerm: Current search term
 *   - results: Array of matching nodes with indices
 *   - selectedIndex: Currently selected result index
 *   - totalCount: Total number of matching results
 *   - openFind: Function to open the find dialog
 *   - closeFind: Function to close the find dialog
 *   - performSearch: Debounced search function for text input
 *   - immediateSearch: Non-debounced search function
 *   - goToSelected: Navigate to and select the current result
 *   - navigateNext: Move to next result
 *   - navigatePrevious: Move to previous result
 *   - clearSearch: Clear search term and results
 *   - selectNode: Programmatically select a result by index
 *   - getNodeDisplayName: Get display name for a node
 * 
 * @example
 * ```typescript
 * const { 
 *   isOpen, 
 *   openFind, 
 *   performSearch, 
 *   results,
 *   goToSelected 
 * } = useFindInWorkflow();
 * 
 * // Open find dialog
 * openFind();
 * 
 * // Search for nodes
 * performSearch("text");
 * 
 * // Navigate to result
 * goToSelected();
 * ```
 */
export const useFindInWorkflow = () => {
  const isOpen = useFindInWorkflowStore((state) => state.isOpen);
  const searchTerm = useFindInWorkflowStore((state) => state.searchTerm);
  const results = useFindInWorkflowStore((state) => state.results);
  const selectedIndex = useFindInWorkflowStore((state) => state.selectedIndex);
  const openFind = useFindInWorkflowStore((state) => state.openFind);
  const closeFind = useFindInWorkflowStore((state) => state.closeFind);
  const setSearchTerm = useFindInWorkflowStore((state) => state.setSearchTerm);
  const setResults = useFindInWorkflowStore((state) => state.setResults);
  const setSelectedIndex = useFindInWorkflowStore((state) => state.setSelectedIndex);
  const navigateNext = useFindInWorkflowStore((state) => state.navigateNext);
  const navigatePrevious = useFindInWorkflowStore((state) => state.navigatePrevious);
  const clearSearch = useFindInWorkflowStore((state) => state.clearSearch);

  const nodes = useNodes((state) => state.nodes);
  const { setCenter, fitView } = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getNodeDisplayName = useCallback(
    (node: Node<NodeData>): string => {
      const title = node.data?.properties?.name;
      if (title && typeof title === "string" && title.trim()) {
        return title;
      }
      const nodeType = node.type ?? "";
      const metadata = getMetadata(nodeType);
      if (metadata?.title) {
        return metadata.title;
      }
      return nodeType.split(".").pop() || node.id;
    },
    [getMetadata]
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
