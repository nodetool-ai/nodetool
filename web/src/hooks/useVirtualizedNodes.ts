/**
 * useVirtualizedNodes
 *
 * This hook manages virtualized node rendering for the node menu.
 * It uses @tanstack/react-virtual to only render visible nodes,
 * improving performance when there are many nodes (100+).
 */

import { useCallback, useRef, useMemo, useState, useEffect } from "react";
import { useVirtualizer, Virtualizer } from "@tanstack/react-virtual";

export interface UseVirtualizedNodesOptions<T> {
  nodes: T[];
  estimateSize?: number;
  overscan?: number;
  enabled?: boolean;
}

export interface UseVirtualizedNodesReturn<T> {
  virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  containerRef: React.RefObject<HTMLDivElement>;
  totalSize: number;
  virtualItems: ReturnType<Virtualizer<HTMLDivElement, Element>["getVirtualItems"]>;
  isVirtualized: boolean;
  nodes: T[];
}

export const NODE_ITEM_HEIGHT = 48;
export const NODE_ITEM_OVERSCAN = 5;

export function useVirtualizedNodes<T>({
  nodes,
  estimateSize = NODE_ITEM_HEIGHT,
  overscan = NODE_ITEM_OVERSCAN,
  enabled = true
}: UseVirtualizedNodesOptions<T>): UseVirtualizedNodesReturn<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const [totalNodes, setTotalNodes] = useState(nodes);

  useEffect(() => {
    setTotalNodes(nodes);
  }, [nodes]);

  const count = totalNodes.length;
  const shouldVirtualize = enabled && count > 20;

  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => estimateSize, [estimateSize]),
    overscan,
    enabled: shouldVirtualize
  });

  const virtualItems = useMemo(() => {
    if (!shouldVirtualize) {
      return [];
    }
    return virtualizer.getVirtualItems();
  }, [shouldVirtualize, virtualizer]);

  const totalSize = useMemo(() => {
    if (!shouldVirtualize) {
      return count * estimateSize;
    }
    return virtualizer.getTotalSize();
  }, [shouldVirtualize, virtualizer, count, estimateSize]);

  return {
    virtualizer: shouldVirtualize ? virtualizer : null,
    containerRef,
    totalSize,
    virtualItems,
    isVirtualized: shouldVirtualize,
    nodes: totalNodes
  };
}

export default useVirtualizedNodes;
