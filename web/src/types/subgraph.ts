/**
 * Subgraph type definitions for NodeTool
 * 
 * These types define the UI-only subgraph system that allows hierarchical
 * workflow composition without backend changes. Subgraphs are flattened
 * before execution.
 */

import { Node as GraphNode, Edge as GraphEdge } from "../stores/ApiTypes";
import { Node, Edge, Viewport } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Special node IDs for subgraph I/O nodes
 */
export const SUBGRAPH_INPUT_NODE_ID = -1;
export const SUBGRAPH_OUTPUT_NODE_ID = -2;

/**
 * Node type constants
 */
export const SUBGRAPH_NODE_TYPE = "nodetool.workflows.base_node.Subgraph";
export const SUBGRAPH_INPUT_NODE_TYPE = "nodetool.workflows.base_node.SubgraphInput";
export const SUBGRAPH_OUTPUT_NODE_TYPE = "nodetool.workflows.base_node.SubgraphOutput";

/**
 * Subgraph input slot definition
 * Represents an input connection point on the subgraph instance
 */
export interface SubgraphInput {
  id: string;           // Unique slot ID (UUID)
  name: string;         // Slot display name
  type: string;         // Data type (e.g., "IMAGE", "STRING", "*")
  linkIds: string[];    // IDs of links connected to this input (multiple allowed)
  
  // Optional metadata
  label?: string;
  color_on?: string;
  color_off?: string;
  shape?: string;
}

/**
 * Subgraph output slot definition
 * Represents an output connection point on the subgraph instance
 */
export interface SubgraphOutput {
  id: string;           // Unique slot ID (UUID)
  name: string;         // Slot display name
  type: string;         // Data type (e.g., "IMAGE", "STRING", "*")
  linkIds: string[];    // IDs of links from this output (single link only)
  
  // Optional metadata
  label?: string;
  color_on?: string;
  color_off?: string;
  shape?: string;
}

/**
 * Subgraph definition (the blueprint)
 * Defines the internal structure and interface of a subgraph
 * Analogous to a "class" in OOP
 */
export interface SubgraphDefinition {
  id: string;                    // Unique identifier (UUID)
  name: string;                  // Display name
  version: number;               // Schema version (default: 1)
  
  // Internal structure (as backend Graph nodes/edges)
  nodes: GraphNode[];            // Internal nodes
  edges: GraphEdge[];            // Internal connections
  
  // Interface definition
  inputs: SubgraphInput[];       // Input slots
  outputs: SubgraphOutput[];     // Output slots
  
  // Widget promotion (optional)
  promotedWidgets?: [string, string][]; // [nodeId, widgetName] tuples
  
  // UI state
  viewport?: Viewport;           // Canvas viewport when editing
  
  // Metadata
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  description?: string;          // Optional description
  thumbnail?: string;            // Optional thumbnail URL
}

/**
 * Subgraph instance data
 * Extends NodeData with subgraph-specific properties
 */
export interface SubgraphNodeData extends NodeData {
  subgraphId: string;                      // References SubgraphDefinition.id
  promotedWidgets?: [string, string][];    // Widget overrides for this instance
}

/**
 * Boundary link analysis result
 * Used when converting selection to subgraph
 */
export interface BoundaryAnalysis {
  // Links entering the selection from outside
  boundaryInputLinks: Edge[];
  
  // Links exiting the selection to outside
  boundaryOutputLinks: Edge[];
  
  // Links entirely within the selection
  internalLinks: Edge[];
  
  // Nodes in the selection
  selectedNodes: Node<NodeData>[];
}

/**
 * Navigation context for subgraph hierarchy
 */
export interface SubgraphNavigationState {
  // Current active graph ("root" or subgraph instance ID)
  currentGraphId: string;
  
  // Navigation path from root to current (stack of instance IDs)
  navigationPath: string[];
  
  // Cached viewports per graph level
  viewportCache: Map<string, Viewport>;
}

/**
 * Extended Graph type that includes subgraph definitions
 * This is the serialization format for workflows with subgraphs
 */
export interface GraphWithSubgraphs {
  nodes: GraphNode[];
  edges: GraphEdge[];
  definitions?: {
    subgraphs?: SubgraphDefinition[];
  };
}

/**
 * Result of flattening operation
 * Contains flat node/edge arrays with hierarchical IDs
 */
export interface FlattenedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  idMap: Map<string, string>; // Maps original IDs to hierarchical IDs
}

/**
 * Execution ID parsing result
 */
export interface ParsedExecutionId {
  path: string[];      // Subgraph instance IDs leading to node
  localId: string;     // Node ID within its graph
  fullId: string;      // Complete hierarchical ID (e.g., "10:42:7")
}
