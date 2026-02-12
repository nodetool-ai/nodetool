import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore } from "../stores/FindInWorkflowStore";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

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

  // Get node store reference for use in selectAllResults
  // We call this outside useCallback to avoid React Hook rules violations
  const nodeStore = useNodeStoreRef();
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

      // Debounce actual search
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

  const selectAllResults = useCallback(() => {
    if (results.length === 0) {
      return;
    }

    // Extract the node objects from results to select them
    const nodesToSelect = results.map((result) => result.node);
    const nodeIds = new Set(nodesToSelect.map((node) => node.id));

    // Update all nodes: set selected=true for matched nodes
    const updatedNodes = nodes.map((node) =>
      nodeIds.has(node.id) ? { ...node, selected: true } : node
    );

    // Use the node store from context to call setNodes
    // We need to call it at the top level, not inside a callback
    const nodeStore = useNodeStoreRef();
    (nodeStore as any).getState().setNodes(updatedNodes);
  }, [results, nodes, useNodeStoreRef]);
  
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
    selectAllResults,
    getNodeDisplayName
  };
};
