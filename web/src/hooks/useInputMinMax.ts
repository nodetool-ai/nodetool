import { useContext } from "react";
import { NodeContext } from "../contexts/NodeContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

interface UseInputMinMaxOptions {
  nodeType?: string;
  nodeId: string;
  propertyName: string;
  propertyMin?: number | null;
  propertyMax?: number | null;
}

/**
 * Custom hook for retrieving input min/max bounds from node properties.
 * 
 * This hook retrieves the min and max bounds for numeric input nodes
 * (FloatInput, IntegerInput) by looking up the node's stored properties.
 * It supports both property-level bounds (from the input definition)
 * and node-level bounds (from the input's configuration).
 * 
 * The hook prioritizes node-level bounds over property-level bounds,
 * falling back to default values (0-100) when no bounds are defined.
 * 
 * @param options - Configuration object containing:
 *   - nodeType: The type of the node (e.g., "nodetool.input.FloatInput")
 *   - nodeId: The ID of the node to get bounds for
 *   - propertyName: The property name (usually "value")
 *   - propertyMin: Optional fallback min from property definition
 *   - propertyMax: Optional fallback max from property definition
 * @returns Object containing min and max bounds for the input
 * 
 * @example
 * ```typescript
 * const { min, max } = useInputMinMax({
 *   nodeType: 'nodetool.input.FloatInput',
 *   nodeId: 'node-123',
 *   propertyName: 'value',
 *   propertyMin: 0,
 *   propertyMax: 100
 * });
 * 
 * return <Slider min={min} max={max} />;
 * ```
 */
export const useInputMinMax = ({
  nodeType,
  nodeId,
  propertyName,
  propertyMin,
  propertyMax,
}: UseInputMinMaxOptions): { min?: number; max?: number } => {
  const shouldLookupBounds =
    nodeType &&
    (nodeType === "nodetool.input.FloatInput" ||
      nodeType === "nodetool.input.IntegerInput") &&
    propertyName === "value";

  const context = useContext(NodeContext);

  const nodes: Node<NodeData>[] = useStoreWithEqualityFn(
    context ?? { subscribe: () => {}, getState: () => ({ nodes: [] }) } as any,
    (state: any) => state?.nodes ?? [],
    shallow
  );

  let nodeMin: number | undefined;
  let nodeMax: number | undefined;

  if (shouldLookupBounds && context && nodes.length > 0) {
    const node = nodes.find((n) => n.id === nodeId);
    nodeMin = (node?.data?.properties as Record<string, unknown>)?.min as number | undefined;
    nodeMax = (node?.data?.properties as Record<string, unknown>)?.max as number | undefined;

    if (process.env.NODE_ENV === "development") {
      console.log("useInputMinMax node data:", { nodeId, min: nodeMin, max: nodeMax, properties: node?.data?.properties });
    }
  }

  const min =
    typeof nodeMin === "number"
      ? nodeMin
      : typeof propertyMin === "number"
        ? propertyMin
        : 0;
  const max =
    typeof nodeMax === "number"
      ? nodeMax
      : typeof propertyMax === "number"
        ? propertyMax
        : 100;

  return { min, max };
};
