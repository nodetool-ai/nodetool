import type { FrontendToolState } from "../frontendTools";

export const optionalWorkflowIdSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
  description:
    "Optional workflow id; when omitted/null, the current workflow is used."
} as const;

export const optionalWorkflowIdSchemaCompact = {
  anyOf: [{ type: "string" }, { type: "null" }]
} as const;

export function resolveWorkflowId(
  state: FrontendToolState,
  workflow_id?: string | null
) {
  const workflowId = workflow_id ?? state.currentWorkflowId;
  if (!workflowId) throw new Error("No current workflow selected");

  if (workflow_id != null && workflow_id !== state.currentWorkflowId) {
    state.setCurrentWorkflowId(workflowId);
  }

  return workflowId;
}
