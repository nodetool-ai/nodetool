import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

type GetResult = (workflowId: string, nodeId: string) => any;
type FindNode = (nodeId: string) => Node<NodeData> | undefined;

const isLiteralSourceNode = (nodeType?: string) => {
  if (!nodeType) {
    return false;
  }
  return (
    nodeType.startsWith("nodetool.input.") ||
    nodeType.startsWith("nodetool.constant.")
  );
};

const resolveResultValue = (result: any, sourceHandle?: string) => {
  if (
    sourceHandle &&
    typeof result === "object" &&
    result !== null
  ) {
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

export const resolveExternalEdgeValue = (
  edge: Edge,
  workflowId: string,
  getResult: GetResult,
  findNode: FindNode
) => {
  const result = getResult(workflowId, edge.source);
  if (result !== undefined) {
    return {
      value: resolveResultValue(result, edge.sourceHandle ?? undefined),
      hasValue: true,
      isFallback: false
    };
  }

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
