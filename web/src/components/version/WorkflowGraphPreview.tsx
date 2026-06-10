/**
 * Workflow Graph Preview Component
 *
 * Renders a workflow graph with the real ReactFlow node components,
 * read-only and zoomed out to fit. Used in the version history panel
 * to show exactly what a workflow version looks like.
 */

import React, { useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  useReactFlow,
  useNodesInitialized
} from "@xyflow/react";
import { create } from "zustand";
import { Box } from "../ui_primitives";
import useMetadataStore from "../../stores/MetadataStore";
import { NodeData } from "../../stores/NodeData";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { NodeContext } from "../../contexts/NodeContext";
import type { NodeStore } from "../../stores/NodeStore";
import type {
  Graph,
  Workflow,
  Node as GraphNode,
  Edge as GraphEdge
} from "../../stores/ApiTypes";
import GroupNode from "../node/GroupNode";
import CommentNode from "../node/CommentNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import CustomEdge from "../node_editor/CustomEdge";
import ControlEdge from "../node_editor/ControlEdge";
import { GROUP_NODE_TYPE, COMMENT_NODE_TYPE } from "../../constants/nodeTypes";

interface WorkflowGraphPreviewProps {
  graph: Graph | null | undefined;
  workflowId: string;
  width?: number | string;
  height?: number | string;
}

// Minimal NodeStore so BaseNode's useNodes() selectors work in a
// read-only context. Only the fields node components actually read
// are provided; all mutators are no-ops.
interface MinimalNodeStore {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflow: Workflow;
  viewport: null;
  shouldFitToScreen: boolean;
  setShouldFitToScreen: () => void;
  onNodesChange: () => void;
  onEdgesChange: () => void;
  onEdgeUpdate: () => void;
  deleteEdge: () => void;
  setEdgeSelectionState: () => void;
  updateNode: () => void;
  updateNodeData: () => void;
  getSelectedNodeCount: () => number;
  findNode: (id: string) => Node<NodeData> | undefined;
  getNodesByType: () => never[];
}

const createMinimalNodeStore = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflow: Workflow
) =>
  create<MinimalNodeStore>(() => ({
    nodes,
    edges,
    workflow,
    viewport: null,
    shouldFitToScreen: false,
    setShouldFitToScreen: () => {},
    onNodesChange: () => {},
    onEdgesChange: () => {},
    onEdgeUpdate: () => {},
    deleteEdge: () => {},
    setEdgeSelectionState: () => {},
    updateNode: () => {},
    updateNodeData: () => {},
    getSelectedNodeCount: () => 0,
    findNode: (id: string) => nodes.find((n) => n.id === id),
    getNodesByType: () => []
  }));

const edgeTypes = { default: CustomEdge, control: ControlEdge };

const FIT_VIEW_OPTIONS = { padding: 0.1 };

const GraphPreviewInner: React.FC<{
  nodes: Node<NodeData>[];
  edges: Edge[];
}> = ({ nodes, edges }) => {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const baseNodeTypes = useMetadataStore((state) => state.nodeTypes);
  const nodeTypes = useMemo(
    () => ({
      ...baseNodeTypes,
      [GROUP_NODE_TYPE]: GroupNode,
      [COMMENT_NODE_TYPE]: CommentNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes]
  );

  // Refit whenever a different version's nodes are shown
  useEffect(() => {
    if (nodesInitialized && nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView(FIT_VIEW_OPTIONS);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [nodesInitialized, nodes, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.02}
      maxZoom={1.5}
      deleteKeyCode={null}
    >
      <Background
        gap={100}
        offset={4}
        size={8}
        color="rgba(255,255,255,0.04)"
        lineWidth={1}
        variant={BackgroundVariant.Cross}
      />
    </ReactFlow>
  );
};

export const WorkflowGraphPreview: React.FC<WorkflowGraphPreviewProps> = ({
  graph,
  workflowId,
  width = "100%",
  height = 320
}) => {
  const data = useMemo(() => {
    const graphNodes = (graph?.nodes || []) as GraphNode[];
    const graphEdges = (graph?.edges || []) as GraphEdge[];
    // graphNodeToReactFlowNode only reads workflow.id
    const workflow = { id: workflowId } as Workflow;
    const nodes = graphNodes.map((n) =>
      graphNodeToReactFlowNode(workflow, n)
    );
    const edges = graphEdges.map(graphEdgeToReactFlowEdge);
    const store = createMinimalNodeStore(nodes, edges, workflow);
    return { nodes, edges, store };
  }, [graph, workflowId]);

  if (data.nodes.length === 0) {
    return (
      <Box
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--palette-divider)",
          borderRadius: "var(--rounded-md)",
          color: "text.secondary",
          fontSize: "var(--fontSizeSmaller)"
        }}
      >
        Empty workflow
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width,
        height,
        border: "1px solid var(--palette-divider)",
        borderRadius: "var(--rounded-md)",
        overflow: "hidden",
        backgroundColor: "var(--palette-background-default)",
        // Nodes render with the real editor components but must be inert:
        // disable pointer events on nodes/edges while keeping pane pan/zoom.
        "& .react-flow__node": { pointerEvents: "none !important" },
        "& .react-flow__edge": { pointerEvents: "none !important" }
      }}
    >
      <NodeContext.Provider value={data.store as unknown as NodeStore}>
        <ReactFlowProvider>
          <GraphPreviewInner nodes={data.nodes} edges={data.edges} />
        </ReactFlowProvider>
      </NodeContext.Provider>
    </Box>
  );
};

export default React.memo(WorkflowGraphPreview);
