import { z } from "zod";
import type { FrontendToolState } from "../frontendTools";

export const optionalWorkflowIdSchemaCompact = z.string().nullable().optional();

export function resolveWorkflowId(
  state: FrontendToolState,
  workflow_id?: string | null
): string {
  // Resolve which workflow a tool targets without switching the visible tab:
  // an explicit `workflow_id` edits that workflow's store in the background,
  // leaving the user's current tab untouched. Tab switching is the job of the
  // dedicated `ui_open_workflow` / `ui_switch_tab` tools.
  const workflowId = workflow_id ?? state.currentWorkflowId;
  if (!workflowId) {throw new Error("No current workflow selected");}
  return workflowId;
}
