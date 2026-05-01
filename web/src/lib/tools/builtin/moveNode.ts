import { z } from "zod";
import { uiMoveNodeParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_move_node",
  description: "Move a node to an absolute canvas position.",
  parameters: z.object(uiMoveNodeParams),
  async execute({ node_id, position, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const node = nodeStore.findNode(node_id);
    if (!node) {
      throw new Error(`Node not found: ${node_id}`);
    }

    nodeStore.updateNode(node_id, {
      position: {
        x: position.x,
        y: position.y
      }
    });

    return { ok: true, node_id, position };
  }
});
