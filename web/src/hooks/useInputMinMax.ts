import { useContext } from "react";
import { NodeContext } from "../contexts/NodeContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import type { NodeStore, NodeStoreState } from "../stores/NodeStore";

interface UseInputMinMaxOptions {
  nodeType?: string;
  nodeId: string;
  propertyName: string;
  propertyMin?: number | null;
  propertyMax?: number | null;
}

/**
 * Hook for determining min/max bounds for numeric input fields.
 * 
 * @example
 * const { min, max } = useInputMinMax({
 *   nodeId: "node-123",
 *   propertyName: "value",
 *   propertyMin: 0,
 *   propertyMax: 100
 * });
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

  const [nodeMin, nodeMax] = useStoreWithEqualityFn(
    context ?? { subscribe: () => () => {}, getState: () => ({ nodes: [] }) } as unknown as NodeStore,
    (state: NodeStoreState) => {
      if (!shouldLookupBounds || !context) {
        return [undefined, undefined];
      }
      const node = state?.nodes?.find((n) => n.id === nodeId);
      const props = node?.data?.properties;
      return [
        typeof props?.min === "number" ? props.min : undefined,
        typeof props?.max === "number" ? props.max : undefined,
      ];
    },
    shallow
  );

  if (process.env.NODE_ENV === "development" && shouldLookupBounds && context) {
    console.info("useInputMinMax node data:", { nodeId, min: nodeMin, max: nodeMax });
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
        : 99999;

  return { min, max };
};
