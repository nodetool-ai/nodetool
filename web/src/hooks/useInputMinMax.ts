import { useNodes } from "../contexts/NodeContext";

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

  const nodes = useNodes((state) => state.nodes);
  const node = nodes.find((n) => n.id === nodeId);

  const nodeMin = shouldLookupBounds ? (node?.data?.properties as Record<string, unknown>)?.min as number | undefined : undefined;
  const nodeMax = shouldLookupBounds ? (node?.data?.properties as Record<string, unknown>)?.max as number | undefined : undefined;

  if (shouldLookupBounds) {
    console.log("useInputMinMax node data:", { nodeId, min: nodeMin, max: nodeMax, properties: node?.data?.properties });
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

  if (shouldLookupBounds) {
    return { min, max };
  }

  return { min: undefined, max: undefined };
};
