/**
 * SimpleApp is a demo application that uses our simplified components to render a graph
 */
import React, { useEffect, useState } from "react";
import SimpleReactFlowWrapperWithProvider from "./components/SimpleReactFlowWrapper";
import {
  useSimpleNodeStore,
  NodeMetadata,
  NodeUIProperties,
} from "./stores/SimpleNodeStore";
import "./styles/simple-nodes.css";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./stores/NodeData";

// Define the Workflow interface based on the API response
interface Workflow {
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
interface GraphNode {
  id: string;
  type: string;
  parent_id?: string;
  data?: any;
  dynamic_properties?: any;
  ui_properties?: NodeUIProperties;
}

// Define GraphEdge interface
interface GraphEdge {
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
      node.type === "nodetool.group.Loop" ||
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
      node.type == "nodetool.group.Loop" ||
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
}

const loadMetadata = async () => {
  try {
    const response = await fetch("http://localhost:8000/api/nodes/metadata", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error loading metadata:", error);
    return null;
  }
};

const loadWorkflow = async (workflowId: string): Promise<Workflow | null> => {
  try {
    const response = await fetch(
      `http://localhost:8000/api/workflows/${workflowId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error loading workflow ${workflowId}:`, error);
    return null;
  }
};

const SimpleApp: React.FC = () => {
  const { setNodes, setEdges, setMetadata } = useSimpleNodeStore();
  const [isLoading, setIsLoading] = useState(true);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize the store with data from the API
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Parse workflow_id from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const workflowId = urlParams.get("workflow_id");

        if (!workflowId) {
          setError("No workflow_id provided in URL parameters");
          setIsLoading(false);
          return;
        }

        // Load metadata from remote API
        const metadata = await loadMetadata();
        if (metadata) {
          setMetadata(metadata as NodeMetadata[]);
        } else {
          setError("Failed to load metadata");
        }

        // Load workflow data
        const workflowData = await loadWorkflow(workflowId);
        if (!workflowData) {
          setError(`Failed to load workflow with ID: ${workflowId}`);
          setIsLoading(false);
          return;
        }

        setWorkflow(workflowData);

        // If the workflow has a graph with nodes and edges, use those
        if (
          workflowData.graph &&
          workflowData.graph.nodes &&
          workflowData.graph.edges
        ) {
          // Convert GraphNodes to ReactFlow Nodes
          const reactFlowNodes = workflowData.graph.nodes.map(
            (node: GraphNode) => graphNodeToReactFlowNode(workflowData, node)
          );
          setNodes(reactFlowNodes);

          // Convert GraphEdges to ReactFlow Edges
          const reactFlowEdges = workflowData.graph.edges.map(
            (edge: GraphEdge) => graphEdgeToReactFlowEdge(edge)
          );
          setEdges(reactFlowEdges);
        }
      } catch (err) {
        setError(
          `An unexpected error occurred: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, [setNodes, setEdges, setMetadata]);

  return (
    <div className="simple-app">
      <header className="simple-app-header">
        <div className="simple-app-title">
          {workflow ? workflow.name : "NodeTool Viewer"}
        </div>
      </header>
      <main className="simple-app-content">
        {isLoading ? (
          <div className="loading-indicator">Loading workflow data...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <SimpleReactFlowWrapperWithProvider />
        )}
      </main>
    </div>
  );
};

export default SimpleApp;
