import { z } from "zod";
import { uiApplyGraphPatchParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { noNodeStoreError, resolveWorkflowId } from "./workflow";
import { isRecord } from "../../../utils/typePredicates";
import "./addNode";
import "./connectNodes";
import "./updateNodeData";
import "./moveNode";
import "./deleteNode";
import "./deleteEdge";

/** The patch keys in the order they apply, with the single-edit tool each uses. */
const STEPS = [
  ["delete_edge_ids", "ui_delete_edge", (value: unknown) => ({ edge_id: value })],
  ["delete_node_ids", "ui_delete_node", (value: unknown) => ({ node_id: value })],
  ["add_nodes", "ui_add_node", (value: unknown) => value],
  ["update_nodes", "ui_update_node_data", (value: unknown) => value],
  ["move_nodes", "ui_move_node", (value: unknown) => value],
  ["add_edges", "ui_connect_nodes", (value: unknown) => value]
] as const;

const DROPPED_RESULT_FIELDS = new Set(["ok", "source", "document_revision"]);

FrontendToolRegistry.register({
  name: "ui_apply_graph_patch",
  description:
    "Apply several graph edits as one undo step, in this order: delete_edge_ids, " +
    "delete_node_ids, add_nodes, update_nodes, move_nodes, add_edges. Each entry " +
    "takes the arguments of the matching single-edit tool. If one entry fails, no " +
    "edit is applied and the error names the entry.",
  parameters: z.object(uiApplyGraphPatchParams),
  async execute(args, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, args.workflow_id);
    const store = state.getNodeStore(workflowId);
    if (!store) {
      throw noNodeStoreError(state, workflowId);
    }
    const before = store.getState();
    const history = store.temporal.getState();
    const applied: Array<Record<string, unknown>> = [];
    // One undo entry for the whole patch. A failure restores the graph inside
    // the group, so the group records no change and no entry.
    history.beginGroup();
    try {
      for (const [key, tool, toArgs] of STEPS) {
        const entries = args[key] ?? [];
        for (let index = 0; index < entries.length; index++) {
          try {
            const entryArgs = toArgs(entries[index]);
            const result = await FrontendToolRegistry.call(
              tool,
              isRecord(entryArgs) ? { ...entryArgs, workflow_id: workflowId } : entryArgs,
              `ui_apply_graph_patch:${key}:${index}:${crypto.randomUUID()}`,
              { getState: ctx.getState, signal: ctx.abortSignal }
            );
            const entry: Record<string, unknown> = { op: key };
            if (isRecord(result)) {
              for (const [field, value] of Object.entries(result)) {
                if (!DROPPED_RESULT_FIELDS.has(field)) entry[field] = value;
              }
            }
            applied.push(entry);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${key}[${index}]: ${message} No change was applied.`);
          }
        }
      }
    } catch (error) {
      const current = store.getState();
      current.setNodes(before.nodes);
      current.setEdges(before.edges);
      throw error;
    } finally {
      history.endGroup();
    }
    return { ok: true, applied };
  }
});
