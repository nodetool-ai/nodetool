import { useContext } from "react";
import { NodeContext } from "../contexts/NodeContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Hook to determine min/max bounds for numeric input nodes.
 * 
 * Looks up min/max values from node properties for FloatInput and IntegerInput
 * node types. Falls back to provided property values or default bounds.
 * 
 * @param options - Configuration options
 * @param options.nodeType - Type of the node (e.g., "nodetool.input.FloatInput")
 * @param options.nodeId - ID of the node to look up
 * @param options.propertyName - Name of the property (usually "value")
 * @param options.propertyMin - Optional explicit minimum from property definition
 * @param options.propertyMax - Optional explicit maximum from property definition
 * @returns Object with min and max bounds for the input
 * 
 * @example
 * ```typescript
 * const { min, max } = useInputMinMax({
 *   nodeType: "nodetool.input.FloatInput",
 *   nodeId: "node-123",
 *   propertyName: "value",
 *   propertyMin: 0,
 *   propertyMax: 100
 * });
 * 
 * // Returns { min: 0, max: 100 } or values from node.data.properties
 * ```
 */

interface UseInputMinMaxOptions {
  nodeType?: string;
  nodeId: string;
  propertyName: string;
  propertyMin?: number | null;
  propertyMax?: number | null;
}

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
