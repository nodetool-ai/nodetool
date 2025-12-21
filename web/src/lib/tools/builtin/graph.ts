import { valueMatchesType } from "../../../utils/TypeHandler";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchemaCompact, resolveWorkflowId } from "./workflow";

type GraphNodeInput = {
  id: string;
  type: string;
  data?: Record<string, any>;
  position?: { x: number; y: number };
};

type GraphEdgeInput = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

function assertObject(
  value: any,
  message: string
): asserts value is Record<string, any> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertString(value: any, message: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {throw new Error(message);}
}

function assertNumber(value: any, message: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {throw new Error(message);}
}

FrontendToolRegistry.register({
  name: "ui_graph",
  description: "Add nodes/edges to the current workflow graph.",
  parameters: {
    type: "object",
    properties: {
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            data: { type: "object", additionalProperties: true },
            position: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
              required: ["x", "y"]
            }
          },
          required: ["id", "type"]
        }
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            source: { type: "string" },
            target: { type: "string" },
            sourceHandle: { type: "string" },
            targetHandle: { type: "string" }
          },
          required: ["source", "target"]
        }
      },
      w: optionalWorkflowIdSchemaCompact
    },
    required: []
  },
  async execute(
    {
      nodes,
      edges,
      w
    }: { nodes?: GraphNodeInput[]; edges?: GraphEdgeInput[]; w?: string | null },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, w);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const addedNodeIds: string[] = [];
    const addedEdgeIds: string[] = [];

    for (const node of (nodes ?? []) as any[]) {
      assertObject(node, "Invalid node");
      assertString(node.id, "Node missing id");
      assertString(node.type, "Node missing type");

      const metadata = state.nodeMetadata[node.type];
      if (!metadata) {throw new Error(`Node type not found: ${node.type}`);}

      const rawData = (node.data ?? {}) as Record<string, any>;
      const properties = (rawData.properties ?? {}) as Record<string, any>;

      for (const property of metadata.properties) {
        const value = properties[property.name];
        if (value === undefined) {
          properties[property.name] = property.default;
        } else if (!valueMatchesType(value, property.type)) {
          throw new Error(
            `Value for property ${property.name} does not match type ${property.type}`
          );
        }
      }

      const data = {
        ...rawData,
        properties,
        dynamic_properties: rawData.dynamic_properties ?? {},
        dynamic_outputs: rawData.dynamic_outputs ?? {},
        sync_mode: rawData.sync_mode ?? "on_any",
        workflow_id: workflowId,
        selectable: rawData.selectable ?? true
      };

      const position = node.position ?? { x: 0, y: 0 };
      assertNumber(position.x, "Node position.x must be a number");
      assertNumber(position.y, "Node position.y must be a number");

      nodeStore.addNode({
        id: node.id,
        type: node.type,
        position,
        parentId: "",
        selected: false,
        dragHandle: "",
        expandParent: true,
        style: { width: 200, height: undefined },
        zIndex: 0,
        data
      });

      addedNodeIds.push(node.id);
    }

    for (const edge of (edges ?? []) as any[]) {
      assertObject(edge, "Invalid edge");
      assertString(edge.source, "Edge missing source");
      assertString(edge.target, "Edge missing target");

      const src = nodeStore.findNode(edge.source);
      const tgt = nodeStore.findNode(edge.target);
      if (!src) {throw new Error(`Source node not found: ${edge.source}`);}
      if (!tgt) {throw new Error(`Target node not found: ${edge.target}`);}

      const connection = {
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      } as any;

      const ok = nodeStore.validateConnection(connection, src as any, tgt as any);
      if (!ok) {throw new Error("Invalid connection");}

      const edgeId = edge.id ?? nodeStore.generateEdgeId();
      nodeStore.addEdge({
        id: edgeId,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      } as any);

      addedEdgeIds.push(edgeId);
    }

    return { ok: true, node_ids: addedNodeIds, edge_ids: addedEdgeIds };
  }
});
