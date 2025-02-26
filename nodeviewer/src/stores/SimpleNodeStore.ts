/**
 * SimpleNodeStore manages the state of the workflow editor's nodes and edges.
 * This is a simplified version that only contains the state needed for rendering
 * nodes and edges without interactive functionality.
 */

import { create } from "zustand";
import { Node, Edge, XYPosition, Position } from "@xyflow/react";
import { NodeData } from "./NodeData";

// Define the node UI properties
export interface NodeUIProperties {
  selected?: boolean;
  selectable?: boolean;
  position: XYPosition;
  width?: number;
  height?: number;
  zIndex?: number;
  title?: string;
  color?: string;
}

// Define the node metadata
export interface NodeMetadata {
  node_type: string;
  title: string;
  description: string;
  namespace: string;
  properties: Property[];
  outputs: OutputSlot[];
  basic_fields: string[];
  is_dynamic?: boolean;
}

// Define the property type
export interface Property {
  name: string;
  type: {
    type: string;
    optional: boolean;
    type_args: any[];
  };
  description: string;
  default: any;
}

// Define the output slot type
export interface OutputSlot {
  name: string;
  type: {
    type: string;
    optional: boolean;
    type_args: any[];
  };
  description: string;
}

// Define the node store state
export interface SimpleNodeStoreState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  metadata: Record<string, NodeMetadata>;
  getNodeMetadata: (nodeType: string) => NodeMetadata | undefined;
  setNodes: (nodes: Node<NodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setMetadata: (metadata: NodeMetadata[]) => void;
}

// Create the node store
export const useSimpleNodeStore = create<SimpleNodeStoreState>((set, get) => ({
  nodes: [],
  edges: [],
  metadata: {},
  getNodeMetadata: (nodeType: string) => get().metadata[nodeType],
  setNodes: (nodes: Node<NodeData>[]) => set({ nodes }),
  setEdges: (edges: Edge[]) => set({ edges }),
  setMetadata: (metadata: NodeMetadata[]) =>
    set((state) => ({
      metadata: {
        ...state.metadata,
        ...metadata.reduce((acc, md) => ({ ...acc, [md.node_type]: md }), {}),
      },
    })),
}));

// Helper function to create a node
export const createNode = (
  id: string,
  type: string,
  position: XYPosition,
  data: NodeData
): Node<NodeData> => {
  return {
    id,
    type,
    position,
    data,
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
  };
};

// Helper function to create an edge
export const createEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null,
  targetHandle: string | null
): Edge => {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
};
