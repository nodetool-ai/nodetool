/**
 * Convert selection to subgraph operation
 * 
 * Takes a selection of nodes and edges, analyzes boundaries,
 * creates a subgraph definition, and replaces the selection
 * with a subgraph instance node.
 */

import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import { Node as GraphNode, Edge as GraphEdge } from "../../../stores/ApiTypes";
import {
  SubgraphDefinition,
  SubgraphInput,
  SubgraphOutput,
  SUBGRAPH_NODE_TYPE
} from "../../../types/subgraph";
import {
  analyzeBoundary,
  groupBoundaryInputs,
  groupBoundaryOutputs,
  validateSelection,
  calculateSelectionCenter
} from "./boundary";
import { reactFlowNodeToGraphNode } from "../../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../../stores/reactFlowEdgeToGraphEdge";

/**
 * Result of converting selection to subgraph
 */
export interface ConvertToSubgraphResult {
  definition: SubgraphDefinition;
  instanceNode: Node<NodeData>;
  removedNodeIds: string[];
  removedEdgeIds: string[];
  newEdges: Edge[];
}

/**
 * Generates a unique name for an input/output slot
 */
function generateSlotName(
  baseName: string,
  existingNames: Set<string>,
  _index: number
): string {
  // Try base name first
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  
  // Try with suffix
  let attempt = 1;
  while (existingNames.has(`${baseName}_${attempt}`)) {
    attempt++;
  }
  
  return `${baseName}_${attempt}`;
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
 * Creates subgraph input slots from boundary input links
 */
function createInputSlots(
  boundaryInputs: Edge[],
  selectedNodes: Node<NodeData>[]
): SubgraphInput[] {
  const grouped = groupBoundaryInputs(boundaryInputs);
  const inputs: SubgraphInput[] = [];
  const usedNames = new Set<string>();
  
  for (const [, edges] of grouped.entries()) {
    const firstEdge = edges[0];
    
    // Find target node in selection
    const targetNode = selectedNodes.find(n => n.id === firstEdge.target);
    if (!targetNode) {continue;}
    
    // Generate slot name from target handle or default
    const handleName = firstEdge.targetHandle || "input";
    const slotName = generateSlotName(handleName, usedNames, inputs.length);
    usedNames.add(slotName);
    
    inputs.push({
      id: generateUUID(),
      name: slotName,
      type: "*", // Generic type - can be refined later
      linkIds: edges.map(e => e.id),
      label: slotName
    });
  }
  
  return inputs;
}

/**
 * Creates subgraph output slots from boundary output links
 */
function createOutputSlots(
  boundaryOutputs: Edge[],
  selectedNodes: Node<NodeData>[]
): SubgraphOutput[] {
  const grouped = groupBoundaryOutputs(boundaryOutputs);
  const outputs: SubgraphOutput[] = [];
  const usedNames = new Set<string>();
  
  for (const [, edges] of grouped.entries()) {
    const firstEdge = edges[0];
    
    // Find source node in selection
    const sourceNode = selectedNodes.find(n => n.id === firstEdge.source);
    if (!sourceNode) {continue;}
    
    // Generate slot name from source handle or default
    const handleName = firstEdge.sourceHandle || "output";
    const slotName = generateSlotName(handleName, usedNames, outputs.length);
    usedNames.add(slotName);
    
    outputs.push({
      id: generateUUID(),
      name: slotName,
      type: "*", // Generic type - can be refined later
      linkIds: edges.map(e => e.id),
      label: slotName
    });
  }
  
  return outputs;
}

/**
 * Converts a selection of nodes to a subgraph
 * 
 * @param selectedNodes - Nodes to convert
 * @param allNodes - All nodes in the graph
 * @param allEdges - All edges in the graph
 * @param workflowId - Current workflow ID
 * @returns Conversion result with definition and instance node
 */
export function convertToSubgraph(
  selectedNodes: Node<NodeData>[],
  allNodes: Node<NodeData>[],
  allEdges: Edge[],
  workflowId: string
): ConvertToSubgraphResult {
  // Validate selection
  const validationError = validateSelection(selectedNodes);
  if (validationError) {
    throw new Error(validationError);
  }
  
  // Analyze boundary
  const boundary = analyzeBoundary(selectedNodes, allEdges);
  
  console.log(`[convertToSubgraph] Boundary analysis: inputLinks=${boundary.boundaryInputLinks.length}, outputLinks=${boundary.boundaryOutputLinks.length}, internalLinks=${boundary.internalLinks.length}`);
  
  // Create input/output slots
  const inputs = createInputSlots(boundary.boundaryInputLinks, selectedNodes);
  const outputs = createOutputSlots(boundary.boundaryOutputLinks, selectedNodes);
  
  console.log(`[convertToSubgraph] Created inputs=${inputs.length}, outputs=${outputs.length}`);
  
  // Convert ReactFlow nodes/edges to backend format
  const internalGraphNodes: GraphNode[] = selectedNodes.map(node =>
    reactFlowNodeToGraphNode(node)
  );
  
  const internalGraphEdges: GraphEdge[] = boundary.internalLinks.map(edge =>
    reactFlowEdgeToGraphEdge(edge)
  );
  
  // Create subgraph definition
  const definition: SubgraphDefinition = {
    id: generateUUID(),
    name: "New Subgraph",
    version: 1,
    nodes: internalGraphNodes,
    edges: internalGraphEdges,
    inputs,
    outputs,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Calculate position for instance node (center of selection)
  const center = calculateSelectionCenter(selectedNodes);
  
  // Create subgraph instance node
  const instanceNode: Node<NodeData> = {
    id: generateUUID(),
    type: SUBGRAPH_NODE_TYPE,
    position: center,
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: workflowId,
      title: definition.name,
      subgraphId: definition.id
    },
    width: 280,
    height: 150
  };
  
  // Create new edges connecting external nodes to instance
  const newEdges: Edge[] = [];
  
  // Connect boundary inputs to instance inputs
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    for (const linkId of input.linkIds) {
      const originalEdge = allEdges.find(e => e.id === linkId);
      if (!originalEdge) {continue;}
      
      newEdges.push({
        id: generateUUID(),
        source: originalEdge.source,
        sourceHandle: originalEdge.sourceHandle,
        target: instanceNode.id,
        targetHandle: `input-${i}`,
        type: originalEdge.type
      });
    }
  }
  
  // Connect instance outputs to boundary outputs
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    for (const linkId of output.linkIds) {
      const originalEdge = allEdges.find(e => e.id === linkId);
      if (!originalEdge) {continue;}
      
      newEdges.push({
        id: generateUUID(),
        source: instanceNode.id,
        sourceHandle: `output-${i}`,
        target: originalEdge.target,
        targetHandle: originalEdge.targetHandle,
        type: originalEdge.type
      });
    }
  }
  
  return {
    definition,
    instanceNode,
    removedNodeIds: selectedNodes.map(n => n.id),
    removedEdgeIds: [
      ...boundary.boundaryInputLinks.map(e => e.id),
      ...boundary.boundaryOutputLinks.map(e => e.id),
      ...boundary.internalLinks.map(e => e.id)
    ],
    newEdges
  };
}
