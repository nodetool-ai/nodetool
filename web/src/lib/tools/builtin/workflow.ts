import type { FrontendToolState } from "../frontendTools";
import { isFullResourceId, isShortResourceId, shortResourceId } from "@nodetool-ai/protocol";

export function resolveWorkflowId(
  state: FrontendToolState,
  workflow_id?: string | null
): string {
  // Resolve which workflow a tool targets without switching the visible tab:
  // an explicit `workflow_id` edits that workflow's store in the background,
  // leaving the user's current tab untouched. Tab switching is the job of the
  // dedicated `ui_open_workflow` / `ui_switch_tab` tools.
  const workflowId = workflow_id ?? state.currentWorkflowId;
  if (!workflowId) {
    throw new Error("No current workflow selected");
  }
  if (!isShortResourceId(workflowId)) {
    return workflowId;
  }
  const knownIds = new Set(state.getOpenWorkflowIds?.() ?? []);
  if (state.currentWorkflowId) {
    knownIds.add(state.currentWorkflowId);
  }
  if (knownIds.has(workflowId)) {
    return workflowId;
  }
  const matches = [...knownIds].filter(
    (id) => isFullResourceId(id) && shortResourceId(id) === workflowId
  );
  if (matches.length > 1) {
    throw new Error(`Workflow prefix ${workflowId} is ambiguous. Pass a full workflow id from ui_get_graph.`);
  }
  const [match] = matches;
  if (match) {
    return match;
  }
  // An unopened workflow is resolved in the authorized server scope.
  return workflowId;
}

/**
 * The error every graph *write* tool raises when the workflow has no open
 * editor. A workflow created over the API has no node store, and the bare
 * "No node store for workflow <id>" left one agent with no route forward: it
 * rebuilt the whole workflow from scratch. Name both routes instead.
 */
export function noNodeStoreError(
  state: FrontendToolState,
  workflowId: string
): Error {
  const open = state.getOpenWorkflowIds?.() ?? [];
  return new Error(
    `No node store for workflow ${workflowId}: no editor is open for it. ` +
      `Open it with ui_open_workflow (workflow_id: "${workflowId}"), or edit ` +
      "it without an editor using the API tools (get_workflow, " +
      "create_workflow, validate_workflow). " +
      (open.length > 0
        ? `Open workflows: ${open.join(", ")}.`
        : "No workflow editors are open.")
  );
}
