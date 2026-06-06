/** @jsxImportSource @emotion/react */
/**
 * Workflow graph viewer app — the React tree for the standalone graph viewer.
 * Reuses the real nodetool BaseNode component with proper MUI theme and CSS.
 * No backend needed — workflow data comes via ?data=<base64 JSON> param.
 * Mounted by graph-entry.tsx.
 */
import React, { useEffect, useState, useMemo } from "react";
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
import type { Workflow, NodeMetadata, Property, PropertyTypeMetadata, OutputSlot, Node as GraphNode, Edge as GraphEdge } from "./stores/ApiTypes";

// Real node components — imported so they are registered
import BaseNode from "./components/node/BaseNode";
import GroupNode from "./components/node/GroupNode";
import CommentNode from "./components/node/CommentNode";
import SketchNode, {
  SKETCH_NODE_TYPE
} from "./components/node/SketchNode/SketchNode";
import { GROUP_NODE_TYPE, COMMENT_NODE_TYPE } from "./constants/nodeTypes";
import PlaceholderNode from "./components/node_types/PlaceholderNode";
import CustomEdge from "./components/node_editor/CustomEdge";
import ControlEdge from "./components/node_editor/ControlEdge";

// NodeContext — we provide a real zustand store so BaseNode's useNodes() works
import { create } from "zustand";
import { NodeContext } from "./contexts/NodeContext";
import type { NodeStore } from "./stores/NodeStore";
import { ContextMenuProvider } from "./providers/ContextMenuProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowManagerProvider } from "./contexts/WorkflowManagerContext";
import { MenuProvider } from "./providers/MenuProvider";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, enabled: false } }
});

// ─── Metadata helpers ────────────────────────────────────────────

function makeType(type: string): PropertyTypeMetadata {
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
  };
}

function makeOutput(name: string, type: string): OutputSlot {
  return { name, type: makeType(type), stream: false };
}

const KNOWN_METADATA: Record<string, Partial<NodeMetadata>> = {};

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
    inline_fields: props.map((p) => p.name),
    required_settings: [],
    supports_dynamic_inputs: false,
    is_streaming_output: false,
    supports_dynamic_outputs: false
  };
}

// ─── Workflow parser ─────────────────────────────────────────────

function parseWorkflow(raw: unknown): Workflow {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.length > 0 ? v : fallback;

  const graph = obj.graph as
    | { nodes?: Record<string, unknown>[]; edges?: Record<string, unknown>[] }
    | undefined
    | null;
  const rawNodes =
    graph?.nodes ??
    (Array.isArray(obj.nodes)
      ? (obj.nodes as Record<string, unknown>[])
      : []);
  const rawEdges =
    graph?.edges ??
    (Array.isArray(obj.edges)
      ? (obj.edges as Record<string, unknown>[])
      : []);

  return {
    id: str(obj.id, "inline"),
    name: str(obj.name, "Workflow"),
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
        id: str(n.id, `node_${i}`),
        type: str(n.type, "default"),
        data: (n.properties ?? n.data ?? {}) as GraphNode["data"],
        ui_properties: (n.ui_properties ?? {}) as GraphNode["ui_properties"],
        dynamic_properties: {},
        dynamic_outputs: {}
      })),
      edges: rawEdges.map((e, i) => ({
        id: str(e.id, `edge_${i}`),
        source: str(e.source, ""),
        sourceHandle: str(e.sourceHandle, "output"),
        target: str(e.target, ""),
        targetHandle: str(e.targetHandle, "input")
      }))
    }
  } as unknown as Workflow;
}

// ─── Minimal NodeStore ───────────────────────────────────────────
// BaseNode uses useNodes() which reads from NodeContext.
// We create a minimal zustand store with just the fields BaseNode accesses.

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

function createMinimalNodeStore(
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflow: Workflow
) {
  return create<MinimalNodeStore>(() => ({
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
      [GROUP_NODE_TYPE]: GroupNode,
      [COMMENT_NODE_TYPE]: CommentNode,
      [SKETCH_NODE_TYPE]: SketchNode,
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

export default function App() {
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

        const json: unknown = JSON.parse(atob(dataParam));
        const workflow = parseWorkflow(json);

        // 1. Build metadata for all node types
        const allMetadata: Record<string, NodeMetadata> = {};
        const nodeTypesMap: Record<string, typeof BaseNode> = {};

        for (const [key, partial] of Object.entries(KNOWN_METADATA)) {
          allMetadata[key] = {
            layout: "default",
            recommended_models: [],
            required_settings: [],
            supports_dynamic_inputs: false,
            is_streaming_output: false,
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
          const inlineCount =
            meta?.inline_fields?.length ?? propCount;
          const hasHidden = propCount > inlineCount;
          const estimatedHeight =
            50 + propCount * 75 + outputCount * 30 + (hasHidden ? 40 : 0) + 40;
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
        console.error(err);
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
        Loading…
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
              <NodeContext.Provider value={graphData.store as unknown as NodeStore}>
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
