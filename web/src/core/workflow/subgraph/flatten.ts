/**
 * Subgraph flattening for execution
 * 
 * Recursively flattens a workflow with subgraphs into a flat node/edge list
 * that can be sent to the backend for execution. Generates hierarchical IDs
 * to track node positions in the subgraph hierarchy.
 */

import { Node as GraphNode, Edge as GraphEdge, Graph } from "../../../stores/ApiTypes";
import {
  SubgraphDefinition,
  FlattenedGraph,
  ParsedExecutionId,
  SUBGRAPH_NODE_TYPE,
  SUBGRAPH_INPUT_NODE_ID,
  SUBGRAPH_OUTPUT_NODE_ID
} from "../../../types/subgraph";

/**
 * Checks if a node is a subgraph instance
 */
function isSubgraphNode(node: GraphNode): boolean {
  return node.type === SUBGRAPH_NODE_TYPE;
}

/**
 * Gets the subgraph ID from a subgraph instance node
 */
function getSubgraphId(node: GraphNode): string | undefined {
  return (node as any).properties?.subgraphId || (node as any).data?.subgraphId;
}

/**
 * Generates hierarchical execution ID
 * Format: "parentPath:nodeId"
 * Example: "10:42:7" means node 7 in subgraph instance 42 in subgraph instance 10
 */
function generateExecutionId(parentPath: string, nodeId: string): string {
  return parentPath ? `${parentPath}:${nodeId}` : nodeId;
}

/**
 * Parses a hierarchical execution ID into its components
 * 
 * @param executionId - Hierarchical ID (e.g., "10:42:7")
 * @returns Parsed components
 */
export function parseExecutionId(executionId: string): ParsedExecutionId {
  const parts = executionId.split(":");
  
  return {
    path: parts.slice(0, -1),
    localId: parts[parts.length - 1],
    fullId: executionId
  };
}

/**
 * Recursively flattens a graph with subgraphs
 * 
 * @param nodes - Nodes in the current graph level
 * @param edges - Edges in the current graph level
 * @param definitions - Map of subgraph definitions
 * @param parentPath - Path prefix for hierarchical IDs
 * @param result - Accumulator for flattened result
 */
function flattenRecursive(
  nodes: GraphNode[],
  edges: GraphEdge[],
  definitions: Map<string, SubgraphDefinition>,
  parentPath: string,
  result: { nodes: GraphNode[]; edges: GraphEdge[]; idMap: Map<string, string> }
): void {
  for (const node of nodes) {
    // Generate hierarchical ID for this node
    const executionId = generateExecutionId(parentPath, node.id);
    result.idMap.set(node.id, executionId);
    
    if (isSubgraphNode(node)) {
      // This is a subgraph instance - recursively flatten it
      const subgraphId = getSubgraphId(node);
      if (!subgraphId) {
        console.warn(`[flatten] Subgraph node ${node.id} missing subgraphId`);
        continue;
      }
      
      const definition = definitions.get(subgraphId);
      if (!definition) {
        console.warn(`[flatten] Subgraph definition ${subgraphId} not found`);
        continue;
      }
      
      // Recursively flatten the subgraph's internal structure
      // Use the instance node ID as the path component
      const newPath = generateExecutionId(parentPath, node.id);
      flattenRecursive(
        definition.nodes,
        definition.edges,
        definitions,
        newPath,
        result
      );
    } else {
      // Regular node - add to flattened result
      result.nodes.push({
        ...node,
        id: executionId
      });
    }
  }
  
  // Add edges, skipping:
  // - Edges connected to subgraph I/O nodes (virtual nodes)
  // - Edges connected to subgraph instances (will be replaced by internal connections)
  for (const edge of edges) {
    // Skip edges to/from I/O nodes
    if (
      edge.source === String(SUBGRAPH_INPUT_NODE_ID) ||
      edge.target === String(SUBGRAPH_INPUT_NODE_ID) ||
      edge.source === String(SUBGRAPH_OUTPUT_NODE_ID) ||
      edge.target === String(SUBGRAPH_OUTPUT_NODE_ID)
    ) {
      continue;
    }
    
    // Check if source or target is a subgraph instance
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    const sourceIsSubgraph = sourceNode && isSubgraphNode(sourceNode);
    const targetIsSubgraph = targetNode && isSubgraphNode(targetNode);
    
    if (sourceIsSubgraph || targetIsSubgraph) {
      // TODO: Resolve connections through subgraph boundaries
      // This requires mapping instance input/output slots to internal nodes
      console.warn(`[flatten] Skipping edge with subgraph boundary: ${edge.id || "unknown"}`);
      continue;
    }
    
    // Regular edge - add with hierarchical IDs
    const sourceExecutionId = generateExecutionId(parentPath, edge.source);
    const targetExecutionId = generateExecutionId(parentPath, edge.target);
    
    result.edges.push({
      ...edge,
      id: edge.id,
      source: sourceExecutionId,
      target: targetExecutionId
    });
  }
}

/**
 * Flattens a workflow graph with subgraphs for execution
 * 
 * @param graph - Root graph to flatten
 * @param definitions - Subgraph definitions
 * @returns Flattened graph with hierarchical IDs
 */
export function flattenSubgraphs(
  graph: Graph,
  definitions: Map<string, SubgraphDefinition> = new Map()
): FlattenedGraph {
  const result: FlattenedGraph = {
    nodes: [],
    edges: [],
    idMap: new Map()
  };
  
  // Start recursive flattening from root (empty path)
  flattenRecursive(
    graph.nodes,
    graph.edges,
    definitions,
    "",
    result
  );
  
  return result;
}

/**
 * Finds a node in a hierarchy by parsing an execution ID
 * 
 * @param executionId - Hierarchical execution ID
 * @param rootGraph - Root graph
 * @param definitions - Subgraph definitions
 * @returns The node if found, undefined otherwise
 */
export function findNodeByExecutionId(
  executionId: string,
  rootGraph: Graph,
  definitions: Map<string, SubgraphDefinition>
): GraphNode | undefined {
  const parsed = parseExecutionId(executionId);
  
  // Navigate through the hierarchy
  let currentNodes = rootGraph.nodes;
  const currentDefinitions = definitions;
  
  for (const instanceId of parsed.path) {
    // Find the subgraph instance node
    const instanceNode = currentNodes.find(n => n.id === instanceId);
    if (!instanceNode || !isSubgraphNode(instanceNode)) {
      return undefined;
    }
    
    // Get its definition
    const subgraphId = getSubgraphId(instanceNode);
    if (!subgraphId) {
      return undefined;
    }
    
    const definition = currentDefinitions.get(subgraphId);
    if (!definition) {
      return undefined;
    }
    
    // Descend into the subgraph
    currentNodes = definition.nodes;
  }
  
  // Find the final node
  return currentNodes.find(n => n.id === parsed.localId);
}

/**
 * Checks if a graph contains any subgraph instances
 * 
 * @param nodes - Nodes to check
 * @returns True if any node is a subgraph instance
 */
export function hasSubgraphs(nodes: GraphNode[]): boolean {
  return nodes.some(node => isSubgraphNode(node));
}

/**
 * Validates that a flattened graph has no circular references
 * 
 * @param graph - Graph to validate
 * @param definitions - Subgraph definitions
 * @returns True if valid, false if circular references detected
 */
export function validateNoCircularReferences(
  graph: Graph,
  definitions: Map<string, SubgraphDefinition>
): boolean {
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  
  function visit(definitionId: string): boolean {
    if (visited.has(definitionId)) {
      return true;
    }
    
    if (inProgress.has(definitionId)) {
      // Circular reference detected
      return false;
    }
    
    inProgress.add(definitionId);
    
    const definition = definitions.get(definitionId);
    if (!definition) {
      return true;
    }
    
    // Check all subgraph instances within this definition
    for (const node of definition.nodes) {
      if (isSubgraphNode(node)) {
        const subgraphId = getSubgraphId(node);
        if (subgraphId && !visit(subgraphId)) {
          return false;
        }
      }
    }
    
    inProgress.delete(definitionId);
    visited.add(definitionId);
    return true;
  }
  
  // Check all subgraph instances in root graph
  for (const node of graph.nodes) {
    if (isSubgraphNode(node)) {
      const subgraphId = getSubgraphId(node);
      if (subgraphId && !visit(subgraphId)) {
        return false;
      }
    }
  }
  
  return true;
}
