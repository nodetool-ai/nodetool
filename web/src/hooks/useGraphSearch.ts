import { useCallback, useMemo } from "react";
import { Node, Edge, getOutgoers } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import {
  useGraphSearchStore,
  SearchResult
} from "../stores/GraphSearchStore";
import { NodeData } from "../stores/NodeData";

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const highlightMatch = (text: string, query: string): string => {
  if (!query.trim()) {
    return text;
  }
  try {
    const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  } catch {
    return text;
  }
};

const getNodeDisplayName = (node: Node<NodeData>): string => {
  if (node.data.title) {
    return typeof node.data.title === "string"
      ? node.data.title
      : String(node.data.title);
  }
  return node.type || "Unknown";
};

const getNodeTypeName = (nodeType: string): string => {
  const parts = nodeType.split(".");
  const lastPart = parts[parts.length - 1];
  return lastPart
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim();
};

const isNodeConnected = (
  node: Node<NodeData>,
  nodes: Node<NodeData>[],
  edges: Edge[]
): boolean => {
  const hasIncoming = edges.some((edge) => edge.target === node.id);
  const hasOutgoing =
    edges.some((edge) => edge.source === node.id) ||
    getOutgoers(node, nodes, edges).length > 0;
  return hasIncoming || hasOutgoing;
};

const getPropertyValue = (
  node: Node<NodeData>,
  propertyName: string
): string => {
  const data = node.data;
  if (propertyName in data) {
    const value = (data as Record<string, unknown>)[propertyName];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return String(value);
    }
    if (value !== null && value !== undefined) {
      return JSON.stringify(value);
    }
  }
  return "";
};

const searchInNode = (
  node: Node<NodeData>,
  query: string,
  filters: ReturnType<typeof useGraphSearchStore.getState>["filters"],
  _nodes: Node<NodeData>[],
  _edges: Edge[]
): SearchResult[] => {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return results;
  }

  if (filters.searchInNames) {
    const displayName = getNodeDisplayName(node).toLowerCase();
    if (displayName.includes(lowerQuery)) {
      results.push({
        nodeId: node.id,
        node,
        matchType: "name",
        matchField: "name",
        matchValue: getNodeDisplayName(node),
        highlightedText: highlightMatch(getNodeDisplayName(node), query)
      });
    }
  }

  if (filters.searchInTypes && node.type) {
    const typeName = getNodeTypeName(node.type).toLowerCase();
    if (typeName.includes(lowerQuery)) {
      results.push({
        nodeId: node.id,
        node,
        matchType: "type",
        matchField: "type",
        matchValue: node.type,
        highlightedText: highlightMatch(getNodeTypeName(node.type), query)
      });
    }
  }

  if (filters.searchInProperties) {
    const searchableProps = ["value", "text", "prompt", "path", "url", "model"];

    for (const prop of searchableProps) {
      const propValue = getPropertyValue(node, prop).toLowerCase();
      if (propValue.includes(lowerQuery)) {
        const actualValue = getPropertyValue(node, prop);
        results.push({
          nodeId: node.id,
          node,
          matchType: "property",
          matchField: prop,
          matchValue: actualValue,
          highlightedText: highlightMatch(actualValue, query)
        });
      }
    }
  }

  return results;
};

export const useGraphSearch = () => {
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const {
    searchQuery,
    results,
    selectedResultIndex,
    filters,
    isSearching,
    setSearchQuery,
    setResults,
    setSelectedResultIndex,
    nextResult,
    previousResult,
    setFilters,
    resetFilters,
    setIsSearching,
    clearSearch,
    isOpen,
    setIsOpen
  } = useGraphSearchStore();

  const performSearch = useCallback(
    (query: string, nodesToSearch?: Node<NodeData>[]) => {
      setIsSearching(true);
      setSearchQuery(query);

      if (!query.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      const nodesToUse = nodesToSearch || nodes;
      let allResults: SearchResult[] = [];

      for (const node of nodesToUse) {
        const nodeResults = searchInNode(node, query, filters, nodesToUse, edges);
        allResults = [...allResults, ...nodeResults];
      }

      if (filters.nodeTypes.length > 0) {
        allResults = allResults.filter((r) =>
          filters.nodeTypes.includes(r.node.type || "")
        );
      }

      if (filters.connectedStatus !== "all") {
        allResults = allResults.filter((r) => {
          const connected = isNodeConnected(r.node, nodesToUse, edges);
          return filters.connectedStatus === "connected"
            ? connected
            : !connected;
        });
      }

      setResults(allResults);
      setIsSearching(false);
    },
    [nodes, edges, filters, setSearchQuery, setResults, setIsSearching]
  );

  const getSelectedNode = useCallback((): Node<NodeData> | null => {
    if (results.length === 0) {
      return null;
    }
    return results[selectedResultIndex]?.node || null;
  }, [results, selectedResultIndex]);

  const getSelectedResult = useCallback((): SearchResult | null => {
    if (results.length === 0) {
      return null;
    }
    return results[selectedResultIndex] || null;
  }, [results, selectedResultIndex]);

  const searchStats = useMemo(() => {
    const totalNodes = nodes.length;
    const disconnectedCount = nodes.filter(
      (n) => !isNodeConnected(n, nodes, edges)
    ).length;
    return {
      totalNodes,
      disconnectedCount,
      resultCount: results.length
    };
  }, [nodes, edges, results.length]);

  return {
    searchQuery,
    results,
    selectedResultIndex,
    filters,
    isSearching,
    isOpen,
    performSearch,
    setSearchQuery,
    setSelectedResultIndex,
    nextResult,
    previousResult,
    setFilters,
    resetFilters,
    clearSearch,
    getSelectedNode,
    getSelectedResult,
    searchStats,
    setIsOpen
  };
};
