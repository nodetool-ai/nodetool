import { z } from "zod";
import {
  uiFocusNodesParams,
  uiUndoParams,
  workflowDocumentRevision
} from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { noNodeStoreError, resolveWorkflowId } from "./workflow";
import { requestFitNode } from "../../../hooks/useFitNodeEvent";

FrontendToolRegistry.register({
  name: "ui_focus_nodes",
  description:
    "Select nodes and frame them on the canvas, so the user sees what you changed. Required: `node_ids`.",
  parameters: z.object(uiFocusNodesParams),
  async execute({ node_ids, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw noNodeStoreError(state, workflowId);
    }
    const nodes = node_ids.flatMap((id) => {
      const node = nodeStore.findNode(id);
      return node ? [node] : [];
    });
    const missing = node_ids.filter((id) => !nodes.some((node) => node.id === id));
    if (nodes.length === 0) {
      throw new Error(`No node found for ${missing.join(", ")}. Read ui_get_graph for the node ids.`);
    }
    nodeStore.setSelectedNodes(nodes);
    const ids = nodes.map((node) => node.id);
    requestFitNode({ nodeId: ids[0], nodeIds: ids, workflowId });
    return missing.length > 0 ? { ok: true, focused: ids, missing } : { ok: true, focused: ids };
  }
});

FrontendToolRegistry.register({
  name: "ui_undo",
  description:
    "Undo your own last graph edits in the editor. Required: `based_on_revision`, the " +
    "document_revision your last edit returned. Refuses when the user edited the graph " +
    "after that. Optional: `steps`.",
  parameters: z.object(uiUndoParams),
  async execute({ based_on_revision, steps, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const store = state.getNodeStore(workflowId);
    if (!store) {
      throw noNodeStoreError(state, workflowId);
    }
    const before = store.getState();
    if (workflowDocumentRevision(workflowId, before.nodes, before.edges) !== based_on_revision) {
      throw new Error(
        "document_revision_conflict: The graph changed after your last edit, so nothing was undone. " +
          "Read ui_get_graph and change the graph with the edit tools instead."
      );
    }
    const history = store.temporal.getState();
    const undone = Math.min(steps ?? 1, history.pastStates.length);
    if (undone === 0) {
      throw new Error("There is no edit to undo.");
    }
    history.undo(undone);
    const after = store.getState();
    return {
      ok: true,
      undone,
      document_revision: workflowDocumentRevision(workflowId, after.nodes, after.edges)
    };
  }
});
