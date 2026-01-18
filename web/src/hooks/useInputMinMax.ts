import { useContext } from "react";
import { NodeContext } from "../contexts/NodeContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Options for the useInputMinMax hook.
 */
interface UseInputMinMaxOptions {
  /** The node type (e.g., "nodetool.input.FloatInput") */
  nodeType?: string;
  /** The ID of the node to get min/max values for */
  nodeId: string;
  /** The property name to get min/max values for */
  propertyName: string;
  /** Default minimum value if not found on node */
  propertyMin?: number | null;
  /** Default maximum value if not found on node */
  propertyMax?: number | null;
}

/**
 * Hook to retrieve min/max bounds for numeric input nodes.
 * 
 * This hook looks up the min/max values from node properties for FloatInput
 * and IntegerInput nodes. If the node has defined min/max properties, those
 * are used; otherwise, the provided defaults are returned.
 * 
 * @param options - Configuration options including nodeId, propertyName, and optional defaults
 * @returns Object containing min and max values
 * 
 * @example
 * ```typescript
 * const { min, max } = useInputMinMax({
 *   nodeType: "nodetool.input.FloatInput",
 *   nodeId: node.id,
 *   propertyName: "value",
 *   propertyMin: 0,
 *   propertyMax: 100
 * });
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
