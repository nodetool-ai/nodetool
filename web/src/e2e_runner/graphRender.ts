/**
 * Build a renderable ReactFlow graph from a raw workflow graph for the E2E
 * runner canvas. Mirrors the standalone GraphViewerApp approach: infer node
 * metadata, convert to ReactFlow nodes/edges, auto-layout with ELK, and seed a
 * minimal NodeStore so the real BaseNode component renders.
 */
import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";
import { graphNodeToReactFlowNode } from "../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../stores/graphEdgeToReactFlowEdge";
import { autoLayout } from "../core/graph";
import type {
  Workflow,
  NodeMetadata,
  Property,
  PropertyTypeMetadata,
  OutputSlot,
  Node as GraphNode,
  Edge as GraphEdge
} from "../stores/ApiTypes";

export interface RawGraph {
  nodes: unknown[];
  edges: unknown[];
}

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

function toWorkflow(raw: RawGraph): Workflow {
  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.length > 0 ? v : fallback;
  return {
    id: "e2e",
    name: "Workflow",
    access: "private",
    description: "",
    thumbnail: "",
    tags: [],
    run_mode: "workflow",
    settings: {},
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    graph: {
      nodes: raw.nodes.map((node, i) => {
        const n = (node ?? {}) as Record<string, unknown>;
        return {
          id: str(n.id, `node_${i}`),
          type: str(n.type, "default"),
          data: (n.properties ?? n.data ?? {}) as GraphNode["data"],
          ui_properties: (n.ui_properties ?? {}) as GraphNode["ui_properties"],
          dynamic_properties: {},
          dynamic_outputs: {}
        };
      }),
      edges: raw.edges.map((edge, i) => {
        const e = (edge ?? {}) as Record<string, unknown>;
        return {
          id: str(e.id, `edge_${i}`),
          source: str(e.source, ""),
          sourceHandle: str(e.sourceHandle, "output"),
          target: str(e.target, ""),
          targetHandle: str(e.targetHandle, "input")
        };
      })
    }
  } as unknown as Workflow;
}

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

export type MinimalStore = ReturnType<typeof createMinimalNodeStore>;

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
    getNodesByType: () => []
  }));
}

export interface RenderGraph {
  nodes: Node<NodeData>[];
  edges: Edge[];
  store: MinimalStore;
}

/**
 * Build the render graph: seed metadata, convert + auto-layout nodes, and create
 * a minimal store. Metadata is merged into the shared MetadataStore so repeated
 * calls (one per workflow) accumulate without clobbering.
 */
export async function buildRenderGraph(raw: RawGraph): Promise<RenderGraph> {
  const workflow = toWorkflow(raw);
  const { default: BaseNode } = await import("../components/node/BaseNode");

  // Nothing below this point awaits until after the store writes, so the
  // getState() reads used to compute `newMetadata`/`newNodeTypes` stay valid
  // through the setMetadata/setNodeTypes calls — no other call can interleave
  // a write in between and get clobbered.
  const graphNodes = workflow.graph?.nodes ?? [];

  const currentMetadata = useMetadataStore.getState().metadata;
  const newMetadata: Record<string, NodeMetadata> = {};
  for (const node of graphNodes) {
    const nodeType = node.type;
    if (!currentMetadata[nodeType] && !newMetadata[nodeType]) {
      newMetadata[nodeType] = inferMetadata(
        nodeType,
        (node.data || {}) as Record<string, unknown>
      );
    }
  }
  const allMetadata: Record<string, NodeMetadata> = {
    ...currentMetadata,
    ...newMetadata
  };
  if (Object.keys(newMetadata).length > 0) {
    useMetadataStore.getState().setMetadata(allMetadata);
  }

  // Only fill in types with no registered component yet — never override one
  // that's already there.
  const currentNodeTypes = useMetadataStore.getState().nodeTypes;
  const newNodeTypes: Record<string, unknown> = {};
  for (const node of graphNodes) {
    const nodeType = node.type;
    if (!currentNodeTypes[nodeType] && !newNodeTypes[nodeType]) {
      newNodeTypes[nodeType] = BaseNode;
    }
  }
  if (Object.keys(newNodeTypes).length > 0) {
    useMetadataStore.getState().setNodeTypes({
      ...useMetadataStore.getState().nodeTypes,
      ...newNodeTypes
    } as Record<string, typeof BaseNode>);
  }

  const rfNodes = (workflow.graph?.nodes ?? []).map((n) =>
    graphNodeToReactFlowNode(workflow, n as GraphNode)
  );
  const rfEdges = (workflow.graph?.edges ?? []).map((e) =>
    graphEdgeToReactFlowEdge(e as GraphEdge)
  );

  for (const node of rfNodes) {
    const meta = allMetadata[node.type || ""];
    const propCount = meta?.properties?.length || 1;
    const outputCount = meta?.outputs?.length || 1;
    const inlineCount = meta?.inline_fields?.length ?? propCount;
    const hasHidden = propCount > inlineCount;
    const estimatedHeight =
      50 + propCount * 75 + outputCount * 30 + (hasHidden ? 40 : 0) + 40;
    node.measured = {
      width: node.width || 320,
      height: Math.max(estimatedHeight, 180)
    };
  }
  const layoutedNodes = await autoLayout(rfEdges, rfNodes);
  const store = createMinimalNodeStore(layoutedNodes, rfEdges, workflow);
  return { nodes: layoutedNodes, edges: rfEdges, store };
}
