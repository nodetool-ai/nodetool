/** @jsxImportSource @emotion/react */
/**
 * Standalone workflow graph viewer for screenshots.
 *
 * Routes:
 *   /graph/:workflowId          — fetch from API
 *   /graph/json?data=<base64>   — inline workflow JSON (base64-encoded)
 *
 * Query params:
 *   bg       — background color (default: #1a1a2e)
 *   padding  — fit-view padding percentage (default: 60)
 *   width    — viewport width hint (for puppeteer)
 *   height   — viewport height hint (for puppeteer)
 *
 * Sets data-ready="true" on the container once the graph is laid out,
 * so headless Chrome can `waitForSelector('[data-ready="true"]')`.
 */
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
import "@xyflow/react/dist/style.css";

import { fetchWorkflowById } from "../../serverState/useWorkflow";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { autoLayout } from "../../core/graph";
import { NodeData } from "../../stores/NodeData";
import useMetadataStore from "../../stores/MetadataStore";
import PlaceholderNode from "../node_types/PlaceholderNode";
import GroupNode from "../node/GroupNode";
import CommentNode from "../node/CommentNode";
import CustomEdge from "../node_editor/CustomEdge";
import ControlEdge from "../node_editor/ControlEdge";
import type { Workflow } from "../../stores/ApiTypes";

const edgeTypes = { default: CustomEdge, control: ControlEdge };

/**
 * Parse a workflow-like JSON object into ReactFlow nodes and edges.
 * Accepts either a full Workflow (with graph.nodes/graph.edges) or
 * the simplified format from team-workflow.json (with top-level nodes/edges).
 */
function parseWorkflowJSON(raw: unknown): { workflow: Workflow } {
  const obj = raw as Record<string, unknown>;

  // Simplified format: { nodes: [...], edges: [...] }
  if (Array.isArray(obj.nodes) && !obj.graph) {
    const nodes = (obj.nodes as Array<Record<string, unknown>>).map(
      (n, i) => ({
        id: (n.id as string) || `node_${i}`,
        type: (n.type as string) || "default",
        data: n.properties || n.data || {},
        ui_properties: (n.ui_properties as Record<string, unknown>) || {
          x: i * 350,
          y: 0,
          width: 300
        }
      })
    );
    const edges = ((obj.edges as Array<Record<string, unknown>>) || []).map(
      (e, i) => ({
        id: (e.id as string) || `edge_${i}`,
        source: e.source as string,
        sourceHandle: (e.sourceHandle as string) || "output",
        target: e.target as string,
        targetHandle: (e.targetHandle as string) || "input"
      })
    );
    return {
      workflow: {
        id: "inline",
        name: (obj.name as string) || "Workflow",
        graph: { nodes, edges }
      } as unknown as Workflow
    };
  }

  // Full Workflow format
  return { workflow: obj as unknown as Workflow };
}

function GraphInner() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [searchParams] = useSearchParams();
  const bgColor = searchParams.get("bg") || "#1a1a2e";
  const padding = Number(searchParams.get("padding") || "60");

  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("");

  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const baseNodeTypes = useMetadataStore((state) => state.nodeTypes);
  const nodeTypes = useMemo(
    () => ({
      ...baseNodeTypes,
      "nodetool.workflows.base_node.Group": GroupNode,
      "nodetool.workflows.base_node.Comment": CommentNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes]
  );

  useEffect(() => {
    (async () => {
      try {
        let workflow: Workflow;

        // Check for inline JSON via ?data= (base64)
        const dataParam = searchParams.get("data");
        if (dataParam) {
          const json = JSON.parse(atob(dataParam));
          ({ workflow } = parseWorkflowJSON(json));
        } else if (workflowId && workflowId !== "json") {
          workflow = await fetchWorkflowById(workflowId);
        } else {
          setError("No workflow ID or data provided");
          return;
        }

        setWorkflowName(workflow.name || "");

        const graphNodes = (workflow.graph?.nodes || []).map((n) =>
          graphNodeToReactFlowNode(workflow, n)
        );
        const graphEdges = (workflow.graph?.edges || []).map((e) =>
          graphEdgeToReactFlowEdge(e)
        );

        const layoutedNodes = await autoLayout(graphEdges, graphNodes);
        setNodes(layoutedNodes);
        setEdges(graphEdges);
      } catch (err) {
        setError(String(err));
      }
    })();
  }, [workflowId, searchParams]);

  // Fit view once nodes are initialized
  useEffect(() => {
    if (nodesInitialized && nodes.length > 0) {
      const fitViewTimeout = setTimeout(() => {
        fitView({ padding: padding / 100 });
        const readyTimeout = setTimeout(() => setReady(true), 300);
        return () => clearTimeout(readyTimeout);
      }, 200);
      return () => clearTimeout(fitViewTimeout);
    }
  }, [nodesInitialized, nodes.length, fitView, padding]);

  if (error) {
    return (
      <div
        data-ready="error"
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bgColor,
          color: "#ef4444",
          fontFamily: "monospace",
          fontSize: 18
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div
      data-ready={ready ? "true" : "false"}
      data-workflow-name={workflowName}
      style={{
        width: "100vw",
        height: "100vh",
        background: bgColor
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
      >
        <Background
          gap={100}
          size={8}
          color="rgba(255,255,255,0.05)"
          lineWidth={1}
          variant={BackgroundVariant.Cross}
        />
      </ReactFlow>
    </div>
  );
}

export default function WorkflowGraphView() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
