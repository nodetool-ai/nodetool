import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore, SearchFilters } from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Hook to implement "Find in Workflow" functionality.
 *
 * Provides search capabilities for finding nodes within the current workflow.
 * Supports searching by node name, node type, or node ID with debounced
 * input and keyboard navigation through results.
 *
 * Advanced filters allow searching by:
 * - Type category (image, text, audio, etc.)
 * - Connection state (connected/disconnected)
 * - Execution state (success/error/running/pending)
 * - Bypass state (bypassed/active)
 *
 * @returns Object containing:
 *   - isOpen: Whether the find dialog is open
 *   - searchTerm: Current search term
 *   - results: Array of matching nodes with indices
 *   - selectedIndex: Currently selected result index
 *   - filters: Current active filters
 *   - showFilters: Whether filters panel is visible
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
 *   - setFilters: Set all filters at once
 *   - updateFilter: Update a single filter
 *   - toggleFilters: Toggle filters panel visibility
 *
 * @example
 * ```typescript
 * const {
 *   isOpen,
 *   openFind,
 *   performSearch,
 *   results,
 *   filters,
 *   updateFilter,
 *   goToSelected
 * } = useFindInWorkflow();
 *
 * // Open find dialog
 * openFind();
 *
 * // Search for nodes
 * performSearch("text");
 *
 * // Filter by type
 * updateFilter("typeCategory", "image");
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
  const filters = useFindInWorkflowStore((state) => state.filters);
  const showFilters = useFindInWorkflowStore((state) => state.showFilters);
  const openFind = useFindInWorkflowStore((state) => state.openFind);
  const closeFind = useFindInWorkflowStore((state) => state.closeFind);
  const setSearchTerm = useFindInWorkflowStore((state) => state.setSearchTerm);
  const setResults = useFindInWorkflowStore((state) => state.setResults);
  const setSelectedIndex = useFindInWorkflowStore((state) => state.setSelectedIndex);
  const navigateNext = useFindInWorkflowStore((state) => state.navigateNext);
  const navigatePrevious = useFindInWorkflowStore((state) => state.navigatePrevious);
  const clearSearch = useFindInWorkflowStore((state) => state.clearSearch);
  const setFilters = useFindInWorkflowStore((state) => state.setFilters);
  const updateFilter = useFindInWorkflowStore((state) => state.updateFilter);
  const toggleFilters = useFindInWorkflowStore((state) => state.toggleFilters);

  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
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

  /**
   * Check if a node matches the current connection state filter
   */
  const matchesConnectionFilter = useCallback(
    (node: Node<NodeData>, edges: Edge[], filter: SearchFilters["connectionState"]): boolean => {
      if (!filter || filter === "any") {
        return true;
      }

      const hasConnections = edges.some(
        (edge) => edge.source === node.id || edge.target === node.id
      );

      return filter === "connected" ? hasConnections : !hasConnections;
    },
    []
  );

  /**
   * Check if a node matches the current execution state filter
   */
  const matchesExecutionFilter = useCallback(
    (node: Node<NodeData>, filter: SearchFilters["executionState"]): boolean => {
      if (!filter || filter === "any") {
        return true;
      }

      // For now, always return true since execution_state is not in NodeData
      // This can be enhanced later if execution state tracking is added
      return true;
    },
    []
  );

  /**
   * Check if a node matches the current bypass state filter
   */
  const matchesBypassFilter = useCallback(
    (node: Node<NodeData>, filter: SearchFilters["bypassState"]): boolean => {
      if (!filter || filter === "any") {
        return true;
      }

      const isBypassed = node.data?.bypassed === true;

      return filter === "bypassed" ? isBypassed : !isBypassed;
    },
    []
  );

  /**
   * Check if a node matches the current type category filter
   */
  const matchesTypeCategoryFilter = useCallback(
    (node: Node<NodeData>, filter: string | undefined): boolean => {
      if (!filter) {
        return true;
      }

      const nodeType = node.type ?? "";
      return nodeType.toLowerCase().startsWith(filter.toLowerCase());
    },
    []
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
      // Get base matches from text search
      // If no search term and no filters, return empty
      const hasActiveFilters =
        filters.typeCategory !== undefined ||
        (filters.connectionState !== undefined && filters.connectionState !== "any") ||
        (filters.executionState !== undefined && filters.executionState !== "any") ||
        (filters.bypassState !== undefined && filters.bypassState !== "any");

      let matchingNodes = !term.trim() && !hasActiveFilters
        ? []
        : !term.trim()
          ? nodes
          : searchNodes(term, nodes);

      // Apply filters
      matchingNodes = matchingNodes.filter((node) => {
        if (
          !matchesConnectionFilter(node, edges, filters.connectionState)
        ) {
          return false;
        }
        if (!matchesExecutionFilter(node, filters.executionState)) {
          return false;
        }
        if (!matchesBypassFilter(node, filters.bypassState)) {
          return false;
        }
        if (!matchesTypeCategoryFilter(node, filters.typeCategory)) {
          return false;
        }
        return true;
      });

      setResults(
        matchingNodes.map((node, index) => ({ node, matchIndex: index }))
      );
    },
    [
      nodes,
      edges,
      filters,
      searchNodes,
      setResults,
      matchesConnectionFilter,
      matchesExecutionFilter,
      matchesBypassFilter,
      matchesTypeCategoryFilter
    ]
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
    filters,
    showFilters,
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
    getNodeDisplayName,
    setFilters,
    updateFilter,
    toggleFilters
  };
};
