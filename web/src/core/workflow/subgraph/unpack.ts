/**
 * Unpack subgraph operation
 * 
 * Takes a subgraph instance node and unpacks its internal structure
 * back into the parent graph, reconnecting all boundary links.
 */

import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import { Node as GraphNode } from "../../../stores/ApiTypes";
import {
  SubgraphDefinition,
  SUBGRAPH_NODE_TYPE,
  SUBGRAPH_INPUT_NODE_ID,
  SUBGRAPH_OUTPUT_NODE_ID
} from "../../../types/subgraph";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";

/**
 * Result of unpacking a subgraph
 */
export interface UnpackSubgraphResult {
  newNodes: Node<NodeData>[];
  newEdges: Edge[];
  removedNodeId: string;
  removedEdgeIds: string[];
}

/**
 * Generates a UUID v4 string
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return hexValue.toString(16);
  });
}

/**
 * Calculates the offset to center unpacked nodes at the instance position
 */
function calculateOffset(
  instancePosition: { x: number; y: number },
  internalNodes: GraphNode[]
): { x: number; y: number } {
  if (internalNodes.length === 0) {
    return { x: 0, y: 0 };
  }
  
  // Calculate bounding box of internal nodes
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  for (const node of internalNodes) {
    const uiProps = node.ui_properties as any;
    const x = uiProps?.position?.[0] || uiProps?.position?.x || 0;
    const y = uiProps?.position?.[1] || uiProps?.position?.y || 0;
    const width = uiProps?.width || 280;
    const height = uiProps?.height || 100;
    
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + width);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + height);
  }
  
  // Calculate center of internal nodes
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Calculate offset to move center to instance position
  return {
    x: instancePosition.x - centerX,
    y: instancePosition.y - centerY
  };
}

/**
 * Unpacks a subgraph instance back into the parent graph
 * 
 * @param instanceNode - The subgraph instance node to unpack
 * @param definition - The subgraph definition
 * @param allEdges - All edges in the parent graph
 * @param workflowId - Current workflow ID
 * @returns Result with new nodes, edges, and removed items
 */
export function unpackSubgraph(
  instanceNode: Node<NodeData>,
  definition: SubgraphDefinition,
  allEdges: Edge[],
  workflowId: string
): UnpackSubgraphResult {
  // Validate that this is a subgraph node
  if (instanceNode.type !== SUBGRAPH_NODE_TYPE) {
    throw new Error(`Node ${instanceNode.id} is not a subgraph instance`);
  }
  
  // Calculate offset for positioning unpacked nodes
  const offset = calculateOffset(instanceNode.position, definition.nodes);
  
  // Create ID mapping for internal nodes (old ID -> new ID)
  const nodeIdMap = new Map<string, string>();
  const newNodes: Node<NodeData>[] = [];
  
  // Convert internal nodes to ReactFlow nodes with new IDs and positions
  for (const internalNode of definition.nodes) {
    const newId = generateUUID();
    nodeIdMap.set(internalNode.id, newId);
    
    // Convert to ReactFlow node
    const reactFlowNode = graphNodeToReactFlowNode(
      { id: workflowId, graph: { nodes: [], edges: [] } } as any,
      internalNode
    );
    
    // Apply offset to position
    const originalX = reactFlowNode.position.x;
    const originalY = reactFlowNode.position.y;
    
    newNodes.push({
      ...reactFlowNode,
      id: newId,
      position: {
        x: originalX + offset.x,
        y: originalY + offset.y
      }
    });
  }
  
  // Recreate internal edges with new node IDs
  const newEdges: Edge[] = [];
  
  for (const internalEdge of definition.edges) {
    const newSourceId = nodeIdMap.get(internalEdge.source);
    const newTargetId = nodeIdMap.get(internalEdge.target);
    
    if (!newSourceId || !newTargetId) {
      console.warn(`[unpackSubgraph] Skipping edge with missing node: ${internalEdge.id || "unknown"}`);
      continue;
    }
    
    const reactFlowEdge = graphEdgeToReactFlowEdge(internalEdge);
    
    newEdges.push({
      ...reactFlowEdge,
      id: generateUUID(),
      source: newSourceId,
      target: newTargetId
    });
  }
  
  // Find edges connected to the instance node
  const inputEdges = allEdges.filter(e => e.target === instanceNode.id);
  const outputEdges = allEdges.filter(e => e.source === instanceNode.id);
  
  // Reconnect input edges to internal nodes
  for (const inputEdge of inputEdges) {
    // Parse target handle to get input index (e.g., "input-0" -> 0)
    const handleMatch = inputEdge.targetHandle?.match(/input-(\d+)/);
    const inputIndex = handleMatch ? parseInt(handleMatch[1], 10) : -1;
    
    if (inputIndex < 0 || inputIndex >= definition.inputs.length) {
      console.warn(`[unpackSubgraph] Invalid input index: ${inputIndex}`);
      continue;
    }
    
    // Find internal edges connected from the input node
    const internalInputEdges = definition.edges.filter(e => 
      e.source === String(SUBGRAPH_INPUT_NODE_ID)
    );
    
    // For each internal target, create a new edge from external source
    for (const internalEdge of internalInputEdges) {
      const newTargetId = nodeIdMap.get(internalEdge.target);
      if (!newTargetId) {continue;}
      
      newEdges.push({
        id: generateUUID(),
        source: inputEdge.source,
        sourceHandle: inputEdge.sourceHandle,
        target: newTargetId,
        targetHandle: internalEdge.targetHandle,
        type: inputEdge.type
      });
    }
  }
  
  // Reconnect output edges from internal nodes
  for (const outputEdge of outputEdges) {
    // Parse source handle to get output index (e.g., "output-0" -> 0)
    const handleMatch = outputEdge.sourceHandle?.match(/output-(\d+)/);
    const outputIndex = handleMatch ? parseInt(handleMatch[1], 10) : -1;
    
    if (outputIndex < 0 || outputIndex >= definition.outputs.length) {
      console.warn(`[unpackSubgraph] Invalid output index: ${outputIndex}`);
      continue;
    }
    
    // Find internal edges connected to the output node
    const internalOutputEdges = definition.edges.filter(e => 
      e.target === String(SUBGRAPH_OUTPUT_NODE_ID)
    );
    
    // For each internal source, create a new edge to external target
    for (const internalEdge of internalOutputEdges) {
      const newSourceId = nodeIdMap.get(internalEdge.source);
      if (!newSourceId) {continue;}
      
      newEdges.push({
        id: generateUUID(),
        source: newSourceId,
        sourceHandle: internalEdge.sourceHandle,
        target: outputEdge.target,
        targetHandle: outputEdge.targetHandle,
        type: outputEdge.type
      });
    }
  }
  
  return {
    newNodes,
    newEdges,
    removedNodeId: instanceNode.id,
    removedEdgeIds: [...inputEdges, ...outputEdges].map(e => e.id)
  };
}
