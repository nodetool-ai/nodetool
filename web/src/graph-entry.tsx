/** @jsxImportSource @emotion/react */
/**
 * Standalone entry point for the workflow graph viewer.
 * Reuses the real nodetool BaseNode component with proper MUI theme and CSS.
 * No backend needed — workflow data comes via ?data=<base64 JSON> param.
 */
import React, { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
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

// MUI Theme
import { ThemeProvider, CssBaseline } from "@mui/material";
import ThemeNodetool from "./components/themes/ThemeNodetool";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";

// Nodetool stores — seed metadata only (no NodeStore)
import useMetadataStore from "./stores/MetadataStore";
import { NodeData } from "./stores/NodeData";
import { graphNodeToReactFlowNode } from "./stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "./stores/graphEdgeToReactFlowEdge";
import { autoLayout } from "./core/graph";
import type { Workflow, NodeMetadata, Property, OutputSlot, Node as GraphNode, Edge as GraphEdge } from "./stores/ApiTypes";

// Real node components — imported so they are registered
import BaseNode from "./components/node/BaseNode";
import GroupNode from "./components/node/GroupNode";
import CommentNode from "./components/node/CommentNode";
import PlaceholderNode from "./components/node_types/PlaceholderNode";
import CustomEdge from "./components/node_editor/CustomEdge";
import ControlEdge from "./components/node_editor/ControlEdge";

// Logging
import log from "loglevel";

// Node CSS
import "./styles/base.css";
import "./styles/nodes.css";
import "./styles/properties.css";
import "./styles/interactions.css";
import "./styles/special_nodes.css";
import "./styles/handle_edge_tooltip.css";

// NodeContext — we provide a real zustand store so BaseNode's useNodes() works
import { create } from "zustand";
import { NodeContext } from "./contexts/NodeContext";
import { ContextMenuProvider } from "./providers/ContextMenuProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowManagerProvider } from "./contexts/WorkflowManagerContext";
import { MenuProvider } from "./providers/MenuProvider";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, enabled: false } }
});

// ─── Metadata helpers ────────────────────────────────────────────

function makeType(type: string) {
  return { type, optional: false, type_args: [] };
}

function makeProp(name: string, type: string, defaultVal?: unknown): Property {
  return {
    name,
    type: makeType(type),
    default: defaultVal,
    title: name,
    description: null,
    min: null,
    max: null,
    json_schema_extra: null,
    required: false
  } as Property;
}

function makeOutput(name: string, type: string): OutputSlot {
  return { name, type: makeType(type), stream: false } as OutputSlot;
}

const KNOWN_METADATA: Record<string, Partial<NodeMetadata>> = {
  "nodetool.team.AgentPool": {
    title: "AgentPool",
    namespace: "nodetool.team",
    node_type: "nodetool.team.AgentPool",
    properties: [makeProp("agents", "list")],
    outputs: [makeOutput("agents", "list")],
    basic_fields: ["agents"]
  },
  "nodetool.team.TaskBoard": {
    title: "TaskBoard",
    namespace: "nodetool.team",
    node_type: "nodetool.team.TaskBoard",
    properties: [makeProp("tasks", "list")],
    outputs: [makeOutput("board", "any"), makeOutput("task_ids", "list")],
    basic_fields: ["tasks"]
  },
  "nodetool.team.Team": {
    title: "Team",
    namespace: "nodetool.team",
    node_type: "nodetool.team.Team",
    properties: [
      makeProp("agents", "list"),
      makeProp("board", "any"),
      makeProp("objective", "str"),
      makeProp("strategy", "str", "autonomous"),
      makeProp("max_iterations", "int", 50),
      makeProp("max_concurrency", "int", 3)
    ],
    outputs: [
      makeOutput("result", "str"),
      makeOutput("board_snapshot", "any"),
      makeOutput("messages", "list"),
      makeOutput("events", "list")
    ],
    basic_fields: ["objective", "strategy", "max_iterations"]
  }
};

function inferMetadata(
  nodeType: string,
  properties: Record<string, unknown>
): NodeMetadata {
  const parts = nodeType.split(".");
  const title = parts[parts.length - 1];
  const namespace = parts.slice(0, -1).join(".");

  const props: Property[] = Object.entries(properties).map(([name, val]) =>
    makeProp(
      name,
      typeof val === "number"
        ? "float"
        : typeof val === "boolean"
          ? "bool"
          : Array.isArray(val)
            ? "list"
            : "str",
      val
    )
  );

  const outputs: OutputSlot[] = [makeOutput("output", "any")];
  if (nodeType.includes("output") || nodeType.includes("Output")) {
    outputs[0] = makeOutput("value", "any");
  }

  return {
    title,
    description: "",
    namespace,
    node_type: nodeType,
    layout: "default",
    properties: props,
    outputs,
    recommended_models: [],
    basic_fields: props.map((p) => p.name),
    required_settings: [],
    is_dynamic: false,
    is_streaming_output: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false
  } as NodeMetadata;
}

// ─── Workflow parser ─────────────────────────────────────────────

function parseWorkflow(raw: unknown): Workflow {
  const obj = raw as Record<string, unknown>;
  const graph = obj.graph as { nodes?: Record<string, unknown>[]; edges?: Record<string, unknown>[] } | undefined | null;
  const rawNodes = graph?.nodes ?? (obj.nodes as Record<string, unknown>[] | undefined) ?? [];
  const rawEdges = graph?.edges ?? (obj.edges as Record<string, unknown>[] | undefined) ?? [];

  return {
    id: (obj.id as string) || "inline",
    name: (obj.name as string) || "Workflow",
    access: "private",
    description: "",
    thumbnail: "",
    tags: [],
    run_mode: "workflow",
    settings: {},
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    graph: {
      nodes: rawNodes.map((n, i) => ({
        id: (n.id as string) || `node_${i}`,
        type: (n.type as string) || "default",
        data: (n.properties ?? n.data ?? {}) as GraphNode["data"],
        ui_properties: (n.ui_properties ?? {}) as GraphNode["ui_properties"],
        dynamic_properties: {},
        dynamic_outputs: {},
        sync_mode: "on_any"
      })),
      edges: rawEdges.map((e, i) => ({
        id: (e.id as string) || `edge_${i}`,
        source: e.source as string,
        sourceHandle: (e.sourceHandle as string) || "output",
        target: e.target as string,
        targetHandle: (e.targetHandle as string) || "input"
      }))
    }
  } as unknown as Workflow;
}

// ─── Minimal NodeStore ───────────────────────────────────────────
// BaseNode uses useNodes() which reads from NodeContext.
// We create a minimal zustand store with just the fields BaseNode accesses.

function createMinimalNodeStore(
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflow: Workflow
) {
  // create<any> intentionally used — this is a minimal stub for NodeContext (full NodeStore is too complex)
  return create<any>((_set: any, _get: any) => ({
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
    getNodesByType: () => [],
  }));
}

// ─── Edge types & node types ─────────────────────────────────────
const edgeTypes = { default: CustomEdge, control: ControlEdge };

// ─── Graph component ─────────────────────────────────────────────

function GraphInner({
  nodes,
  edges
}: {
  nodes: Node<NodeData>[];
  edges: Edge[];
}) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [ready, setReady] = useState(false);

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
    if (nodes.length > 0) {
      const timer = setTimeout(
        () => {
          fitView({ padding: 0.15 });
          setTimeout(() => setReady(true), 500);
        },
        nodesInitialized ? 200 : 1500
      );
      return () => clearTimeout(timer);
    }
  }, [nodesInitialized, nodes.length, fitView]);

  return (
    <div
      data-ready={ready ? "true" : "false"}
      style={{ width: "100vw", height: "100vh" }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
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
        colorMode="dark"
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
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────

function App() {
  const [graphData, setGraphData] = useState<{
    nodes: Node<NodeData>[];
    edges: Edge[];
    store: ReturnType<typeof createMinimalNodeStore>;
    workflow: Workflow;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const dataParam = params.get("data");
        if (!dataParam) {
          setError("No ?data= param. Pass base64-encoded workflow JSON.");
          return;
        }

        const json = JSON.parse(atob(dataParam));
        const workflow = parseWorkflow(json);

        // 1. Build metadata for all node types
        const allMetadata: Record<string, NodeMetadata> = {};
        const nodeTypesMap: Record<string, typeof BaseNode> = {};

        for (const [key, partial] of Object.entries(KNOWN_METADATA)) {
          allMetadata[key] = {
            layout: "default",
            recommended_models: [],
            basic_fields: [],
            required_settings: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            ...partial
          } as NodeMetadata;
        }

        for (const node of workflow.graph?.nodes || []) {
          const nodeType = node.type;
          if (!allMetadata[nodeType]) {
            allMetadata[nodeType] = inferMetadata(
              nodeType,
              (node.data || {}) as Record<string, unknown>
            );
          }
          nodeTypesMap[nodeType] = BaseNode;
        }

        useMetadataStore.getState().setMetadata(allMetadata);
        useMetadataStore.getState().setNodeTypes(nodeTypesMap);

        // 2. Convert to ReactFlow format
        const rfNodes = (workflow.graph?.nodes || []).map((n) =>
          graphNodeToReactFlowNode(workflow, n as GraphNode)
        );
        const rfEdges = (workflow.graph?.edges || []).map((e) =>
          graphEdgeToReactFlowEdge(e as GraphEdge)
        );

        // 3. Auto-layout — set estimated sizes so ELK spaces them properly
        for (const node of rfNodes) {
          const meta = allMetadata[node.type || ""];
          const propCount = meta?.properties?.length || 1;
          const outputCount = meta?.outputs?.length || 1;
          // Header ~50, each property ~70 (text areas are taller), each output ~30, footer ~40
          const basicCount = meta?.basic_fields?.length || propCount;
          const hasMore = propCount > basicCount;
          const estimatedHeight = 50 + propCount * 75 + outputCount * 30 + (hasMore ? 40 : 0) + 40;
          node.measured = {
            width: node.width || 320,
            height: Math.max(estimatedHeight, 180)
          };
        }
        const layoutedNodes = await autoLayout(rfEdges, rfNodes);

        // 4. Create minimal store for NodeContext
        const store = createMinimalNodeStore(layoutedNodes, rfEdges, workflow);

        setGraphData({
          nodes: layoutedNodes,
          edges: rfEdges,
          store,
          workflow
        });
      } catch (err) {
        log.error(err);
        setError(String(err));
      }
    })();
  }, []);

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
          background: "#0F172A",
          color: "#ef4444",
          fontFamily: "monospace",
          fontSize: 16
        }}
      >
        {error}
      </div>
    );
  }

  if (!graphData) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F172A",
          color: "#64748B"
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <CssBaseline />
        <MenuProvider>
          <WorkflowManagerProvider queryClient={queryClient}>
            <ContextMenuProvider active={false}>
              <NodeContext.Provider value={graphData.store}>
                <ReactFlowProvider>
                  <GraphInner
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                  />
                </ReactFlowProvider>
              </NodeContext.Provider>
            </ContextMenuProvider>
          </WorkflowManagerProvider>
        </MenuProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// ─── Mount ───────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
