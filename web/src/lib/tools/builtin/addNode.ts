import { z } from "zod";
import { valueMatchesType } from "../../../utils/TypeHandler";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

const nodePropertySchema = z.record(z.string(), z.any());

const xyPositionSchema = z.object({
  x: z.number(),
  y: z.number()
});

const positionInputSchema = z.union([xyPositionSchema, z.string()]);

const nodeInputSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  node_type: z.string().optional(),
  position: positionInputSchema,
  properties: nodePropertySchema.optional()
});

const addNodeParametersSchema = z
  .object({
    node: nodeInputSchema.optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    node_type: z.string().optional(),
    position: positionInputSchema.optional(),
    properties: nodePropertySchema.optional(),
    workflow_id: optionalWorkflowIdSchema
  })
  .refine(
    (data) => {
      // Either node object is provided, or id and position are provided
      if (data.node) {
        return true;
      }
      return data.id !== undefined && data.position !== undefined;
    },
    {
      message:
        "Either 'node' object or both 'id' and 'position' must be provided"
    }
  );

FrontendToolRegistry.register({
  name: "ui_add_node",
  description: "Add a node to the current workflow graph.",
  parameters: addNodeParametersSchema,
  async execute({ node, workflow_id, ...flatArgs }, ctx) {
    const getFallbackPosition = (index: number) => ({
      x: 120 + (index % 6) * 240,
      y: 120 + Math.floor(index / 6) * 160
    });

    const normalizePosition = (
      input: unknown,
      fallbackIndex: number
    ): { x: number; y: number } => {
      if (typeof input === "object" && input !== null) {
        const maybe = input as { x?: unknown; y?: unknown };
        if (typeof maybe.x === "number" && typeof maybe.y === "number") {
          return { x: maybe.x, y: maybe.y };
        }
      }

      if (typeof input === "string") {
        const trimmed = input.trim();

        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const parsed = JSON.parse(trimmed) as unknown;
            return normalizePosition(parsed, fallbackIndex);
          } catch {
            // Invalid JSON: fall through to other parsers.
          }
        }

        const numericPairs = trimmed.match(/-?\d+(?:\.\d+)?/g);
        if (numericPairs && numericPairs.length >= 2) {
          const x = Number(numericPairs[0]);
          const y = Number(numericPairs[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
          }
        }
      }

      return getFallbackPosition(fallbackIndex);
    };

    const nodeInput = (node ?? flatArgs) as {
      id?: string;
      type?: string;
      node_type?: string;
      position?: { x: number; y: number } | string;
      properties?: Record<string, any>;
    };

    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const nodeType =
      typeof nodeInput.type === "string" ? nodeInput.type : nodeInput.node_type;
    if (!nodeType) {
      throw new Error("Node is missing type");
    }

    const metadata = state.nodeMetadata[nodeType];
    if (!metadata) {throw new Error(`Node type not found: ${nodeType}`);}
    if (nodeInput.id === undefined) {
      throw new Error("Node is missing id");
    }
    if (nodeInput.position === undefined) {
      throw new Error("Node is missing position");
    }
    const normalizedPosition = normalizePosition(
      nodeInput.position,
      nodeStore.nodes.length
    );
    if (nodeInput.properties === undefined) {
      nodeInput.properties = {};
    }
    for (const property of metadata.properties) {
      const value = nodeInput.properties[property.name];
      if (value === undefined) {
        nodeInput.properties[property.name] = property.default;
      } else {
        const matches = valueMatchesType(value, property.type);
        if (!matches) {
          throw new Error(
            `Value for property ${property.name} does not match type ${property.type}`
          );
        }
      }
    }
    nodeStore.addNode({
      id: nodeInput.id,
      type: nodeType,
      position: normalizedPosition,
      parentId: "",
      selected: false,
      dragHandle: "",
      expandParent: true,
      style: {
        width: 200,
        height: undefined
      },
      zIndex: 0,
      data: {
        properties: nodeInput.properties,
        dynamic_properties: {},
        dynamic_outputs: {},
        sync_mode: "on_any",
        workflow_id: workflowId,
        selectable: true
      }
    });
    return { ok: true };
  }
});
