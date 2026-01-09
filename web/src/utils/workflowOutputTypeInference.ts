import { Graph, Node, Edge, OutputSlot } from "../stores/ApiTypes";
import useMetadataStore from "../stores/MetadataStore";

export interface InferredOutputType {
  name: string;
  type: string;
  typeName?: string | null;
  values?: (string | number)[];
  optional: boolean;
  stream: boolean;
}

export interface InferredOutputSchema {
  type: "object";
  properties: Record<string, InferredOutputType>;
  required: string[];
}

/**
 * Resolves a node's type from various possible formats in the graph data.
 */
const resolveNodeType = (node: Node): string => {
  // Check if type is directly on the node
  if (typeof node.type === "string" && node.type) {
    return node.type;
  }
  
  // Check if type is in data
  if (node.data && typeof node.data === "object") {
    const data = node.data as Record<string, unknown>;
    if (typeof data.type === "string" && data.type) {
      return data.type;
    }
  }
  
  return "";
};

/**
 * Finds the output slot definition for a given handle name.
 */
const findOutputSlot = (
  nodeType: string, 
  handleName: string
): OutputSlot | undefined => {
  const metadata = useMetadataStore.getState().getMetadata(nodeType);
  if (!metadata) {
    return undefined;
  }
  
  return metadata.outputs.find(slot => slot.name === handleName);
};

/**
 * Finds the source node and handle for a given target node and handle.
 */
const findSourceConnection = (
  targetNodeId: string,
  targetHandle: string,
  edges: Edge[]
): { sourceNodeId: string; sourceHandle: string } | undefined => {
  const incomingEdge = edges.find(
    (edge: Edge) => {
      return edge.target === targetNodeId && edge.targetHandle === targetHandle;
    }
  );
  
  if (!incomingEdge) {
    return undefined;
  }
  
  return {
    sourceNodeId: incomingEdge.source,
    sourceHandle: incomingEdge.sourceHandle || "default"
  };
};

/**
 * Infers the output type for a specific output node by tracing its connection
 * to the source node and resolving the type from metadata.
 */
const inferOutputNodeType = (
  outputNode: Node,
  edges: Edge[],
  nodeMap: Map<string, Node>
): InferredOutputType | undefined => {
  const outputName = (outputNode.data as Record<string, unknown>)?.name || 
                     (outputNode.data as Record<string, unknown>)?.label || 
                     outputNode.id;
  
  // For output nodes, we need to find the incoming connection
  // Output nodes typically have a "value" or "default" input handle
  const connection = findSourceConnection(outputNode.id, "value", edges);
  
  if (!connection) {
    // If no connection found, try "default" handle
    const defaultConnection = findSourceConnection(outputNode.id, "default", edges);
    if (!defaultConnection) {
      return undefined;
    }
    return resolveSourceType(defaultConnection.sourceNodeId, defaultConnection.sourceHandle, nodeMap, outputName as string);
  }
  
  return resolveSourceType(connection.sourceNodeId, connection.sourceHandle, nodeMap, outputName as string);
};

/**
 * Resolves the type from a source node and handle.
 */
const resolveSourceType = (
  sourceNodeId: string,
  sourceHandle: string,
  nodeMap: Map<string, Node>,
  outputName: string
): InferredOutputType | undefined => {
  const sourceNode = nodeMap.get(sourceNodeId);
  if (!sourceNode) {
    return undefined;
  }
  
  const sourceType = resolveNodeType(sourceNode);
  if (!sourceType) {
    return undefined;
  }
  
  // For output nodes, we need to look at their input type
  if (sourceType.startsWith("nodetool.output.")) {
    // Recursively resolve the output node's source
    const outputNodeMetadata = useMetadataStore.getState().getMetadata(sourceType);
    if (outputNodeMetadata && outputNodeMetadata.properties.length > 0) {
      const valueProperty = outputNodeMetadata.properties.find(p => p.name === "value");
      if (valueProperty) {
        return {
          name: outputName,
          type: valueProperty.type.type,
          typeName: valueProperty.type.type_name ?? undefined,
          values: valueProperty.type.values as (string | number)[] | undefined,
          optional: valueProperty.type.optional,
          stream: false
        };
      }
    }
  }
  
  // For regular nodes, look up the output slot
  const outputSlot = findOutputSlot(sourceType, sourceHandle);
  if (!outputSlot) {
    return undefined;
  }
  
  return {
    name: outputName,
    type: outputSlot.type.type,
    typeName: outputSlot.type.type_name ?? undefined,
    values: outputSlot.type.values as (string | number)[] | undefined,
    optional: outputSlot.type.optional,
    stream: outputSlot.stream
  };
};

/**
 * Infers the complete output schema for a workflow by analyzing the graph
 * and resolving types from node metadata.
 * 
 * This implements Option B from the SDK types issue - client-side inference
 * of workflow output types using the graph structure and node metadata.
 */
export const inferWorkflowOutputSchema = (
  graph: Graph
): InferredOutputSchema | undefined => {
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return undefined;
  }
  
  // Build a map of nodes for quick lookup
  const nodeMap = new Map<string, Node>();
  graph.nodes.forEach(node => {
    nodeMap.set(node.id, node);
  });
  
  const outputProperties: Record<string, InferredOutputType> = {};
  const requiredOutputs: string[] = [];
  
  // Find all output nodes (nodetool.output.*)
  const outputNodes = graph.nodes.filter(node => {
    const nodeType = resolveNodeType(node);
    return nodeType.startsWith("nodetool.output.");
  });
  
  // Process each output node
  for (const outputNode of outputNodes) {
    const inferredType = inferOutputNodeType(outputNode, graph.edges || [], nodeMap);
    
    if (inferredType) {
      const outputName = inferredType.name;
      outputProperties[outputName] = inferredType;
      if (!inferredType.optional) {
        requiredOutputs.push(outputName);
      }
    }
  }
  
  // Only return if we found at least one typed output
  if (Object.keys(outputProperties).length === 0) {
    return undefined;
  }
  
  return {
    type: "object",
    properties: outputProperties,
    required: requiredOutputs
  };
};

/**
 * Gets the inferred type for a specific output by name.
 */
export const getInferredOutputType = (
  graph: Graph,
  outputName: string
): InferredOutputType | undefined => {
  const schema = inferWorkflowOutputSchema(graph);
  if (!schema) {
    return undefined;
  }
  return schema.properties[outputName];
};

/**
 * Type guard to check if a value is a valid inferred output schema.
 */
export const isInferredOutputSchema = (
  value: unknown
): value is InferredOutputSchema => {
  if (!value || typeof value !== "object") {
    return false;
  }
  
  const schema = value as Record<string, unknown>;
  return (
    schema.type === "object" &&
    schema.properties !== undefined &&
    typeof schema.properties === "object" &&
    Array.isArray(schema.required)
  );
}
