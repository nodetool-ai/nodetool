import { z } from "zod";
import { valueMatchesType } from "../../../utils/TypeHandler";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

const nodePropertySchema = z.record(z.string(), z.any());

const nodeInputSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  node_type: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  properties: nodePropertySchema.optional()
});

const addNodeParametersSchema = z
  .object({
    node: nodeInputSchema.optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    node_type: z.string().optional(),
    position: z
      .object({
        x: z.number(),
        y: z.number()
      })
      .optional(),
    properties: nodePropertySchema.optional(),
    workflow_id: optionalWorkflowIdSchema
  })
  .refine(
    (data) => {
      // Either node object is provided, or id and position are provided
      if (data.node) return true;
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
    const nodeInput = (node ?? flatArgs) as {
      id?: string;
      type?: string;
      node_type?: string;
      position?: { x: number; y: number };
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
      position: nodeInput.position,
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
