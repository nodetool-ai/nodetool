import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import type { NodeStoreState } from "../stores/NodeStore";

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

  const selector = useMemo(() => {
    if (!shouldLookupBounds) {
      return () => undefined;
    }
    let lastNodes: NodeStoreState["nodes"] | null = null;
    let lastResult: { min?: number; max?: number } | undefined;
    return (state: NodeStoreState) => {
      if (state.nodes === lastNodes) {
        return lastResult;
      }
      lastNodes = state.nodes;
      const node = state.nodes.find((n) => n.id === nodeId);
      const props = node?.data?.properties;
      const nodeMin = typeof props?.min === "number" ? props.min : undefined;
      const nodeMax = typeof props?.max === "number" ? props.max : undefined;
      const next = nodeMin !== undefined || nodeMax !== undefined
        ? { min: nodeMin, max: nodeMax }
        : undefined;
      if (
        lastResult?.min === next?.min &&
        lastResult?.max === next?.max
      ) {
        return lastResult;
      }
      lastResult = next;
      return next;
    };
  }, [shouldLookupBounds, nodeId]);

  const nodeBounds = useNodes(selector);

  const min =
    typeof nodeBounds?.min === "number"
      ? nodeBounds.min
      : typeof propertyMin === "number"
        ? propertyMin
        : 0;
  const max =
    typeof nodeBounds?.max === "number"
      ? nodeBounds.max
      : typeof propertyMax === "number"
        ? propertyMax
        : 99999;

  return { min, max };
};
