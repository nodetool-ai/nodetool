import { valueMatchesType } from "../../../utils/TypeHandler";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_add_node",
  description: "Add a node to the current workflow graph.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      node: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"]
          },
          properties: {
            type: "object",
            additionalProperties: true
          }
        },
        required: ["id", "position"]
      },
      workflow_id: optionalWorkflowIdSchema
    },
    required: ["node"]
  },
  async execute({ node, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const metadata = state.nodeMetadata[node.type];
    if (!metadata) {throw new Error(`Node type not found: ${node.type}`);}
    if (node.id === undefined) {
      throw new Error("Node is missing id");
    }
    if (node.position === undefined) {
      throw new Error("Node is missing position");
    }
    if (node.properties === undefined) {
      node.properties = {};
    }
    for (const property of metadata.properties) {
      const value = node.properties[property.name];
      if (value === undefined) {
        node.properties[property.name] = property.default;
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
      id: node.id,
      type: node.type,
      position: node.position,
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
        properties: node.properties,
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
