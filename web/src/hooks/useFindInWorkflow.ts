import { useCallback, useEffect, useRef } from "react";
import {
  useFindInWorkflowStore,
  SearchFilters
} from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Node categories for filtering.
 */
export const NODE_CATEGORIES = [
  { value: "all", label: "All Nodes" },
  { value: "input", label: "Input Nodes" },
  { value: "output", label: "Output Nodes" },
  { value: "processing", label: "Processing Nodes" },
  { value: "constant", label: "Constant Nodes" },
  { value: "group", label: "Group Nodes" },
  { value: "comment", label: "Comment Nodes" }
] as const;

/**
 * Determine the category of a node based on its type and properties.
 */
const getNodeCategory = (node: Node<NodeData>): string => {
  const nodeType = node.type ?? "";

  if (nodeType.startsWith("input.") || nodeType === "InputNode") {
    return "input";
  }
  if (nodeType.startsWith("output.") || nodeType === "OutputNode") {
    return "output";
  }
  if (nodeType.startsWith("constant.") || nodeType === "ConstantNode") {
    return "constant";
  }
  if (nodeType === "GroupNode" || nodeType.startsWith("group.")) {
    return "group";
  }
  if (nodeType === "CommentNode" || nodeType.startsWith("comment.")) {
    return "comment";
  }
  return "processing";
};

/**
 * Recursively search for a term within node properties.
 */
const searchInProperties = (
  properties: Record<string, unknown>,
  searchTerm: string,
  caseSensitive: boolean
): boolean => {
  for (const value of Object.values(properties)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string") {
      const searchValue = caseSensitive ? value : value.toLowerCase();
      const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();
      if (searchValue.includes(term)) {
        return true;
      }
    } else if (typeof value === "object") {
      if (searchInProperties(value as Record<string, unknown>, searchTerm, caseSensitive)) {
        return true;
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      const searchValue = String(value);
      const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();
      const searchStr = caseSensitive ? searchValue : searchValue.toLowerCase();
      if (searchStr.includes(term)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Hook to implement "Find in Workflow" functionality.
 *
 * Provides search capabilities for finding nodes within the current workflow.
 * Supports searching by node name, node type, node ID with advanced filtering
 * by category, case sensitivity, and property search.
 *
 * @returns Object containing:
 *   - isOpen: Whether the find dialog is open
 *   - searchTerm: Current search term
 *   - results: Array of matching nodes with indices
 *   - selectedIndex: Currently selected result index
 *   - filters: Current search filters
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
 *   - setFilters: Update search filters
 *   - resetFilters: Reset filters to defaults
 *
 * @example
 * ```typescript
 * const {
 *   isOpen,
 *   openFind,
 *   performSearch,
 *   results,
 *   filters,
 *   setFilters,
 *   goToSelected
 * } = useFindInWorkflow();
 *
 * // Open find dialog
 * openFind();
 *
 * // Search for nodes
 * performSearch("text");
 *
 * // Filter by category
 * setFilters({ category: "input" });
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
  const openFind = useFindInWorkflowStore((state) => state.openFind);
  const closeFind = useFindInWorkflowStore((state) => state.closeFind);
  const setSearchTerm = useFindInWorkflowStore((state) => state.setSearchTerm);
  const setResults = useFindInWorkflowStore((state) => state.setResults);
  const setSelectedIndex = useFindInWorkflowStore((state) => state.setSelectedIndex);
  const navigateNext = useFindInWorkflowStore((state) => state.navigateNext);
  const navigatePrevious = useFindInWorkflowStore((state) => state.navigatePrevious);
  const clearSearch = useFindInWorkflowStore((state) => state.clearSearch);
  const setFilters = useFindInWorkflowStore((state) => state.setFilters);
  const resetFilters = useFindInWorkflowStore((state) => state.resetFilters);

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
    (term: string, nodeList: Node<NodeData>[], searchFilters: SearchFilters): Node<NodeData>[] => {
      if (!term.trim()) {
        return [];
      }

      const { category, caseSensitive, searchProperties, searchType } = searchFilters;
      const searchQuery = caseSensitive ? term.trim() : term.toLowerCase().trim();
      const matches: Node<NodeData>[] = [];

      for (const node of nodeList) {
        // Filter by category first
        if (category !== "all") {
          const nodeCategory = getNodeCategory(node);
          if (nodeCategory !== category) {
            continue;
          }
        }

        let isMatch = false;

        // Search in display name
        const displayName = getNodeDisplayName(node);
        const searchDisplayName = caseSensitive ? displayName : displayName.toLowerCase();
        if (searchDisplayName.includes(searchQuery)) {
          isMatch = true;
        }

        // Search in type if enabled
        if (!isMatch && searchType) {
          const nodeType = node.type ?? "";
          const searchNodeType = caseSensitive ? nodeType : nodeType.toLowerCase();
          if (searchNodeType.includes(searchQuery)) {
            isMatch = true;
          }
        }

        // Search in ID
        if (!isMatch) {
          const nodeId = node.id;
          const searchNodeId = caseSensitive ? nodeId : nodeId.toLowerCase();
          if (searchNodeId.includes(searchQuery)) {
            isMatch = true;
          }
        }

        // Search in properties if enabled
        if (!isMatch && searchProperties && node.data?.properties) {
          if (searchInProperties(node.data.properties, term, caseSensitive)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matches.push(node);
        }
      }

      return matches;
    },
    [getNodeDisplayName]
  );

  const performSearch = useCallback(
    (term: string) => {
      if (!term.trim()) {
        setResults([]);
        return;
      }

      const matchingNodes = searchNodes(term, nodes, filters);
      setResults(
        matchingNodes.map((node, index) => ({ node, matchIndex: index }))
      );
    },
    [nodes, searchNodes, filters, setResults]
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

  // Re-run search when filters change (if there's a search term)
  // Note: We intentionally don't include performSearch and searchTerm in dependencies
  // because we want to re-run the search when filters change, not when performSearch changes
   
  useEffect(() => {
    if (searchTerm.trim()) {
      performSearch(searchTerm);
    }
  }, [filters]); // Only depend on filters, performSearch handles the rest

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
    resetFilters
  };
};
