/**
 * usePathHighlighting - Hook for applying path highlighting styles to nodes.
 *
 * This hook computes the appropriate CSS class names for nodes based on their
 * execution state in the path highlighting store. It's designed to be used
 * in node components to conditionally apply visual highlighting.
 *
 * @experimental Part of the workflow path highlighting experimental feature.
 *
 * @example
 * ```typescript
 * import { usePathHighlighting } from '../../hooks/usePathHighlighting';
 *
 * const MyNode = ({ data, id }) => {
 *   const highlightingClass = usePathHighlighting(workflowId, id);
 *
 *   return (
 *     <div className={`my-node ${highlightingClass}`}>
 *       {/* node content *\/}
 *     </div>
 *   );
 * };
 * ```
 */

import { useMemo } from "react";
import usePathHighlightingStore from "../stores/PathHighlightingStore";

interface UsePathHighlightingOptions {
  workflowId?: string;
  nodeId: string;
  enabled?: boolean;
}

/**
 * Returns the appropriate CSS class name for path highlighting based on node state.
 * Returns empty string if highlighting is disabled or node hasn't executed.
 *
 * @param options - Configuration options
 * @returns CSS class name (one of: node-path-executing, node-path-completed, node-path-error, or empty string)
 */
export function usePathHighlighting({
  workflowId,
  nodeId,
  enabled
}: UsePathHighlightingOptions): string {
  // Get highlighting state from store
  const storeEnabled = usePathHighlightingStore((state) => state.enabled);
  const getNodeState = usePathHighlightingStore((state) => state.getNodeState);

  const isHighlightingEnabled = enabled !== undefined ? enabled : storeEnabled;

  return useMemo(() => {
    // If highlighting is disabled or no workflow, return empty class
    if (!isHighlightingEnabled || !workflowId) {
      return "";
    }

    const state = getNodeState(workflowId, nodeId);

    switch (state) {
      case "executing":
        return "node-path-executing";
      case "completed":
        return "node-path-completed";
      case "error":
        return "node-path-error";
      default:
        return "";
    }
  }, [isHighlightingEnabled, workflowId, nodeId, getNodeState]);
}

/**
 * Hook for edges - returns whether an edge should be highlighted.
 *
 * @example
 * ```typescript
 * import { useEdgePathHighlighting } from '../../hooks/usePathHighlighting';
 *
 * const isHighlighted = useEdgePathHighlighting(workflowId, edgeId);
 *
 * <Edge
 *   className={isHighlighted ? 'react-flow__edge-edge-path-completed' : ''}
 *   {...props}
 * />
 * ```
 */
export function useEdgePathHighlighting(
  workflowId: string | undefined,
  edgeId: string
): boolean {
  const enabled = usePathHighlightingStore((state) => state.enabled);
  const isEdgeExecuted = usePathHighlightingStore((state) => state.isEdgeExecuted);

  return useMemo(() => {
    if (!enabled || !workflowId) {
      return false;
    }
    return isEdgeExecuted(workflowId, edgeId);
  }, [enabled, workflowId, edgeId, isEdgeExecuted]);
}

export default usePathHighlighting;
