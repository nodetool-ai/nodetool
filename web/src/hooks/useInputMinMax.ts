import { useMemo } from "react";
import { useOptionalNodes } from "../contexts/NodeContext";
import type { NodeStoreState } from "../stores/NodeStore";
import { isNumber } from "../utils/typePredicates";

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
      const node = state.findNode(nodeId);
      const props = node?.data?.properties;
      const nodeMin = isNumber(props?.min) ? props.min : undefined;
      const nodeMax = isNumber(props?.max) ? props.max : undefined;
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

  const nodeBounds = useOptionalNodes(selector, undefined);

  // Undeclared bounds stay undefined: a default range would clamp sentinel
  // values such as `-1` ("no limit") on every commit.
  const min = nodeBounds?.min ?? propertyMin ?? undefined;
  const max = nodeBounds?.max ?? propertyMax ?? undefined;

  return { min, max };
};
