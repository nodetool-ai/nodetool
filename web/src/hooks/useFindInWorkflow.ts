import { useCallback, useEffect, useRef } from "react";
import { useFindInWorkflowStore, FindResult } from "../stores/FindInWorkflowStore";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { resolveNodeHeaderTitle } from "../components/node/codeNodeUi";
import usePropertyHighlightStore from "../stores/PropertyHighlightStore";

// Stable empty array so the `useNodes` selector below returns the same
// reference while the dialog is closed — `useNodes` uses shallow equality by
// default, so this yields zero re-renders instead of one per nodes change
// (e.g. every drag frame) for a hook that's mounted permanently but only
// needs `nodes` while the dialog is open.
const EMPTY_NODES: Node<NodeData>[] = [];

interface UseFindInWorkflowResult {
  isOpen: boolean;
  searchTerm: string;
  results: FindResult[];
  selectedIndex: number;
  totalCount: number;
  openFind: () => void;
  closeFind: () => void;
  performSearch: (term: string) => void;
  immediateSearch: (term: string) => void;
  goToSelected: () => void;
  activateResult: (index: number) => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
  clearSearch: () => void;
  selectNode: (index: number) => void;
  getNodeDisplayName: (node: Node<NodeData>) => string;
}

export const useFindInWorkflow = (): UseFindInWorkflowResult => {
  const isOpen = useFindInWorkflowStore((state) => state.isOpen);
  const searchTerm = useFindInWorkflowStore((state) => state.searchTerm);
  const results = useFindInWorkflowStore((state) => state.results);
  const selectedIndex = useFindInWorkflowStore((state) => state.selectedIndex);
  const openFind = useFindInWorkflowStore((state) => state.openFind);
  const closeFind = useFindInWorkflowStore((state) => state.closeFind);
  const setSearchTerm = useFindInWorkflowStore((state) => state.setSearchTerm);
  const setResults = useFindInWorkflowStore((state) => state.setResults);
  const setSelectedIndex = useFindInWorkflowStore((state) => state.setSelectedIndex);
  const clearSearch = useFindInWorkflowStore((state) => state.clearSearch);

  const { nodes, setSelectedNodes } = useNodes((state) => ({
    nodes: isOpen ? state.nodes : EMPTY_NODES,
    setSelectedNodes: state.setSelectedNodes
  }));
  const { setCenter } = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getNodeDisplayName = useCallback(
    (node: Node<NodeData>): string => {
      const nodeType = node.type ?? "";
      const metadata = getMetadata(nodeType);
      const propertyName = node.data?.properties?.name;
      const fallbackTitle =
        metadata?.title || nodeType.split(".").pop() || node.id;
      return resolveNodeHeaderTitle(
        nodeType,
        node.data?.title,
        fallbackTitle,
        typeof propertyName === "string" ? propertyName : undefined
      );
    },
    [getMetadata]
  );

  const searchablePropertyValues = useCallback(
    (node: Node<NodeData>): Array<{ field: string; value: string }> => {
      const entries: Array<{ field: string; value: string }> = [];
      const append = (prefix: string, values: Record<string, unknown>) => {
        for (const [name, value] of Object.entries(values)) {
          if (value === undefined || value === null) {
            continue;
          }
          let searchable: string;
          if (typeof value === "string") {
            searchable = value;
          } else if (
            typeof value === "number" ||
            typeof value === "boolean" ||
            typeof value === "bigint"
          ) {
            searchable = String(value);
          } else {
            try {
              searchable = JSON.stringify(value);
            } catch {
              continue;
            }
          }
          if (searchable) {
            entries.push({ field: `${prefix}${name}`, value: searchable });
          }
        }
      };
      append("", node.data.properties ?? {});
      append("dynamic.", node.data.dynamic_properties ?? {});
      return entries;
    },
    []
  );

  const snippetFor = useCallback((value: string, term: string): string => {
    const compact = value.replace(/\s+/g, " ").trim();
    const matchAt = compact.toLowerCase().indexOf(term);
    const start = Math.max(0, matchAt - 28);
    const end = Math.min(compact.length, matchAt + term.length + 48);
    return `${start > 0 ? "…" : ""}${compact.slice(start, end)}${
      end < compact.length ? "…" : ""
    }`;
  }, []);

  const searchNodes = useCallback(
    (term: string, nodeList: Node<NodeData>[]): FindResult[] => {
      if (!term.trim()) {
        return [];
      }

      const normalizedTerm = term.toLowerCase().trim();
      const matches: FindResult[] = [];

      for (const node of nodeList) {
        const displayName = getNodeDisplayName(node).toLowerCase();
        const nodeType = (node.type ?? "").toLowerCase();
        const nodeId = node.id.toLowerCase();

        const identityMatches =
          displayName.includes(normalizedTerm) ||
          nodeType.includes(normalizedTerm) ||
          nodeId.includes(normalizedTerm);
        if (identityMatches) {
          matches.push({ node, matchIndex: matches.length });
          continue;
        }

        const propertyMatch = searchablePropertyValues(node).find(
          ({ field, value }) =>
            field.toLowerCase().includes(normalizedTerm) ||
            value.toLowerCase().includes(normalizedTerm)
        );
        if (propertyMatch) {
          matches.push({
            node,
            matchIndex: matches.length,
            matchedField: propertyMatch.field,
            matchSnippet: snippetFor(propertyMatch.value, normalizedTerm)
          });
        }
      }

      return matches;
    },
    [getNodeDisplayName, searchablePropertyValues, snippetFor]
  );

  const performSearch = useCallback(
    (term: string) => {
      if (!term.trim()) {
        setResults([]);
        return;
      }

      setResults(searchNodes(term, nodes));
    },
    [nodes, searchNodes, setResults]
  );

  const debouncedSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

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

  const activateResult = useCallback(
    (index: number) => {
      if (index < 0 || index >= results.length) {
        return;
      }

      const result = results[index];
      if (!result) {
        return;
      }

      const { node } = result;
      const nodesById = new Map(
        nodes.map((candidate) => [candidate.id, candidate])
      );
      const absolutePosition = (
        current: Node<NodeData>,
        visited = new Set<string>()
      ): { x: number; y: number } => {
        if (!current.parentId || visited.has(current.id)) {
          return current.position;
        }
        visited.add(current.id);
        const parent = nodesById.get(current.parentId);
        if (!parent) {
          return current.data.positionAbsolute ?? current.position;
        }
        const parentPosition = absolutePosition(parent, visited);
        return {
          x: parentPosition.x + current.position.x,
          y: parentPosition.y + current.position.y
        };
      };
      const position = absolutePosition(node);

      setCenter(
        position.x + (node.width || 200) / 2,
        position.y + (node.height || 100) / 2,
        { zoom: 1, duration: 300 }
      );
      setSelectedIndex(index);
      setSelectedNodes([node]);
      if (result.matchedField) {
        const propertyName = result.matchedField.replace(/^dynamic\./, "");
        usePropertyHighlightStore.getState().highlight(node.id, propertyName);
      }
    },
    [nodes, results, setCenter, setSelectedIndex, setSelectedNodes]
  );

  const goToSelected = useCallback(() => {
    activateResult(selectedIndex);
  }, [activateResult, selectedIndex]);

  const navigateToIndex = useCallback(
    (index: number) => {
      if (results.length === 0) {
        return;
      }
      activateResult((index + results.length) % results.length);
    },
    [activateResult, results.length]
  );

  const navigateToNext = useCallback(() => {
    navigateToIndex(selectedIndex + 1);
  }, [navigateToIndex, selectedIndex]);

  const navigateToPrevious = useCallback(() => {
    navigateToIndex(selectedIndex - 1);
  }, [navigateToIndex, selectedIndex]);

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
    activateResult,
    navigateNext: navigateToNext,
    navigatePrevious: navigateToPrevious,
    clearSearch,
    selectNode,
    getNodeDisplayName
  };
};
