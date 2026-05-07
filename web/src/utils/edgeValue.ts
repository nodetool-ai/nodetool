import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

type GetResult = (_workflowId: string, _nodeId: string) => unknown;
type FindNode = (_nodeId: string) => Node<NodeData> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isLiteralSourceNode = (nodeType?: string): boolean => {
  if (!nodeType) {
    return false;
  }
  return (
    nodeType.startsWith("nodetool.input.") ||
    nodeType.startsWith("nodetool.constant.")
  );
};

const resolveResultValue = (result: unknown, sourceHandle?: string): unknown => {
  if (sourceHandle && isRecord(result)) {
    return result[sourceHandle] ?? result;
  }
  return result;
};

const resolveNodePropertyValue = (
  node: Node<NodeData>,
  sourceHandle?: string
) => {
  const dynamicProps = node.data?.dynamic_properties || {};
  if (sourceHandle && dynamicProps[sourceHandle] !== undefined) {
    return dynamicProps[sourceHandle];
  }
  if (dynamicProps.value !== undefined) {
    return dynamicProps.value;
  }

  const props = node.data?.properties || {};
  if (sourceHandle && props[sourceHandle] !== undefined) {
    return props[sourceHandle];
  }
  if (props.value !== undefined) {
    return props.value;
  }
  return undefined;
};

interface ResolvedEdgeValue {
  value: unknown;
  hasValue: boolean;
  isFallback: boolean;
}

export const resolveExternalEdgeValue = (
  edge: Edge,
  workflowId: string,
  getResult: GetResult,
  findNode: FindNode
): ResolvedEdgeValue => {
  const result = getResult(workflowId, edge.source);
  if (result !== undefined) {
    return {
      value: resolveResultValue(result, edge.sourceHandle ?? undefined),
      hasValue: true,
      isFallback: false
    };
  }

  // When cached result is missing, try to get fallback value from the source node
  const sourceNode = findNode(edge.source);
  if (!sourceNode || !isLiteralSourceNode(sourceNode.type)) {
    return { value: undefined, hasValue: false, isFallback: false };
  }

  const fallbackValue = resolveNodePropertyValue(
    sourceNode,
    edge.sourceHandle ?? undefined
  );

  return {
    value: fallbackValue,
    hasValue: fallbackValue !== undefined,
    isFallback: true
  };
};
