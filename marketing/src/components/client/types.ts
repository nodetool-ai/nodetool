import { NodeData } from "@/stores/NodeData";
import { Node, Edge, XYPosition } from "@xyflow/react";

export interface Workflow {
  id: string;
  access: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  tags?: string[] | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  graph: any; // Using any for now, replace with proper type if available
  input_schema?: Record<string, never> | null;
  output_schema?: Record<string, never> | null;
  settings?: {
    [key: string]: string | boolean | number | null;
  } | null;
}

// Define GraphNode interface
export interface GraphNode {
  id: string;
  type: string;
  parent_id?: string;
  data?: any;
  dynamic_properties?: any;
  ui_properties?: NodeUIProperties;
}

// Define GraphEdge interface
export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  ui_properties?: {
    className?: string;
  };
}

// Default node width
const DEFAULT_NODE_WIDTH = 200;

// Function to convert GraphNode to ReactFlow Node
export function graphNodeToReactFlowNode(
  workflow: Workflow,
  node: GraphNode
): Node<NodeData> {
  const ui_properties = node.ui_properties as NodeUIProperties;
  console.log(node);
  return {
    type: node.type,
    id: node.id,
    parentId: node.parent_id || undefined,
    dragHandle: ".node-drag-handle",
    expandParent: !(
      node.type === "nodetool.workflows.base_node.Group" ||
      node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group"
    ),
    selectable: ui_properties?.selectable,
    data: {
      properties: node.data || {},
      dynamic_properties: node.dynamic_properties || {},
      selectable: ui_properties?.selectable,
      collapsed: false,
      workflow_id: workflow.id,
      title: ui_properties?.title,
      color: ui_properties?.color,
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    style: {
      width: ui_properties?.width || DEFAULT_NODE_WIDTH,
      height: ui_properties?.height,
    },
    zIndex:
      node.type == "nodetool.workflows.base_node.Group" ||
      node.type == "nodetool.workflows.base_node.Group"
        ? -10
        : ui_properties?.zIndex,
  };
}

// Function to convert GraphEdge to ReactFlow Edge
export function graphEdgeToReactFlowEdge(edge: GraphEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    className: edge.ui_properties?.className,
  };
} // Define the node UI properties

export interface NodeUIProperties {
  selected?: boolean;
  selectable?: boolean;
  position: XYPosition;
  width?: number;
  height?: number;
  zIndex?: number;
  title?: string;
  color?: string;
} // Define the node metadata

export interface NodeMetadata {
  node_type: string;
  title: string;
  description: string;
  namespace: string;
  properties: Property[];
  outputs: OutputSlot[];
  basic_fields: string[];
  is_dynamic?: boolean;
} // Define the property type

export interface Property {
  name: string;
  type: {
    type: string;
    optional: boolean;
    type_args: any[];
  };
  description: string;
  default: any;
} // Define the output slot type

export interface OutputSlot {
  name: string;
  type: {
    type: string;
    optional: boolean;
    type_args: any[];
  };
  description: string;
}
