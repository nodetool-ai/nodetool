import { z } from "zod";
import { valueMatchesType } from "../../../utils/TypeHandler";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchemaCompact, resolveWorkflowId } from "./workflow";
import { TypeMetadata } from "../../../stores/ApiTypes";

type GraphNodeInput = {
  id: string;
  type?: string;
  node_type?: string;
  data?: Record<string, unknown>;
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
  value: unknown,
  message: string
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertString(
  value: unknown,
  message: string
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
}

function assertNumber(
  value: unknown,
  message: string
): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(message);
  }
}

FrontendToolRegistry.register({
  name: "ui_graph",
  description: "Add nodes/edges to the current workflow graph.",
  hidden: true,
  parameters: z.object({
    nodes: z
      .union([
        z.array(
          z.object({
            id: z.string(),
            type: z.string().optional(),
            node_type: z.string().optional(),
            data: z.record(z.string(), z.any()).optional(),
            position: z
              .object({
                x: z.number(),
                y: z.number()
              })
              .optional()
          })
        ),
        z.record(z.string(),
          z.object({
            id: z.string(),
            type: z.string().optional(),
            node_type: z.string().optional(),
            data: z.record(z.string(), z.any()).optional(),
            position: z
              .object({
                x: z.number(),
                y: z.number()
              })
              .optional()
          })
        )
      ])
      .optional(),
    edges: z
      .union([
        z.array(
          z.object({
            id: z.string().optional(),
            source: z.string(),
            target: z.string(),
            sourceHandle: z.string().optional(),
            targetHandle: z.string().optional()
          })
        ),
        z.record(z.string(),
          z.object({
            id: z.string().optional(),
            source: z.string(),
            target: z.string(),
            sourceHandle: z.string().optional(),
            targetHandle: z.string().optional()
          })
        )
      ])
      .optional(),
    w: optionalWorkflowIdSchemaCompact
  }),
  async execute(
    {
      nodes,
      edges,
      w
    }: {
      nodes?: GraphNodeInput[] | GraphNodeInput;
      edges?: GraphEdgeInput[] | GraphEdgeInput;
      w?: string | null;
    },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, w);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const addedNodeIds: string[] = [];
    const addedEdgeIds: string[] = [];

    const normalizeNodeInput = (value: unknown): GraphNodeInput[] => {
      if (!value) {
        return [];
      }
      if (Array.isArray(value)) {
        return value as GraphNodeInput[];
      }
      if (typeof value === "object") {
        const asRecord = value as Record<string, unknown>;
        if (
          typeof asRecord.id === "string" &&
          (typeof asRecord.type === "string" ||
            typeof asRecord.node_type === "string")
        ) {
          return [asRecord as GraphNodeInput];
        }
        return Object.values(asRecord).filter(
          (item): item is GraphNodeInput =>
            item != null &&
            typeof item === "object" &&
            typeof (item as { id?: unknown }).id === "string",
        );
      }
      return [];
    };

    const normalizeEdgeInput = (value: unknown): GraphEdgeInput[] => {
      if (!value) {
        return [];
      }
      if (Array.isArray(value)) {
        return value as GraphEdgeInput[];
      }
      if (typeof value === "object") {
        const asRecord = value as Record<string, unknown>;
        if (
          typeof asRecord.source === "string" &&
          typeof asRecord.target === "string"
        ) {
          return [asRecord as GraphEdgeInput];
        }
        return Object.values(asRecord).filter(
          (item): item is GraphEdgeInput =>
            item != null &&
            typeof item === "object" &&
            typeof (item as { source?: unknown }).source === "string" &&
            typeof (item as { target?: unknown }).target === "string",
        );
      }
      return [];
    };

    const normalizedNodes = normalizeNodeInput(nodes);
    const normalizedEdges = normalizeEdgeInput(edges);

    for (const node of normalizedNodes) {
      assertObject(node, "Invalid node");
      assertString(node.id, "Node missing id");
      const nodeType = typeof node.type === "string" ? node.type : node.node_type;
      assertString(nodeType, "Node missing type");

      const metadata = state.nodeMetadata[nodeType];
      if (!metadata) {throw new Error(`Node type not found: ${nodeType}`);}

      const rawData = (node.data ?? {}) as Record<string, unknown>;
      const properties = (rawData.properties ?? {}) as Record<string, unknown>;

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
        dynamic_properties: (rawData.dynamic_properties ?? {}) as Record<string, unknown>,
        dynamic_outputs: (rawData.dynamic_outputs ?? {}) as Record<string, TypeMetadata>,
        sync_mode: (rawData.sync_mode ?? "on_any") as string,
        workflow_id: workflowId,
        selectable: (rawData.selectable ?? true) as boolean
      };

      const position = node.position ?? { x: 0, y: 0 };
      assertNumber(position.x, "Node position.x must be a number");
      assertNumber(position.y, "Node position.y must be a number");

      nodeStore.addNode({
        id: node.id,
        type: nodeType,
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

    for (const edge of normalizedEdges) {
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
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null
      };

      const ok = nodeStore.validateConnection(connection, src, tgt);
      if (!ok) {throw new Error("Invalid connection");}

      const edgeId = edge.id ?? nodeStore.generateEdgeId();
      nodeStore.addEdge({
        id: edgeId,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null
      });

      addedEdgeIds.push(edgeId);
    }

    return { ok: true, node_ids: addedNodeIds, edge_ids: addedEdgeIds };
  }
});
