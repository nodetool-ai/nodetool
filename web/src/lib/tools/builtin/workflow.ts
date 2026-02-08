import { z } from "zod";
import type { FrontendToolState } from "../frontendTools";

export const optionalWorkflowIdSchema = z
  .string()
  .nullable()
  .optional()
  .describe("Optional workflow id; when omitted/null, the current workflow is used.");

export const optionalWorkflowIdSchemaCompact = z.string().nullable().optional();

export function resolveWorkflowId(
  state: FrontendToolState,
  workflow_id?: string | null
) {
  const workflowId = workflow_id ?? state.currentWorkflowId;
  if (!workflowId) {throw new Error("No current workflow selected");}

  if (workflow_id != null && workflow_id !== state.currentWorkflowId) {
    state.setCurrentWorkflowId(workflowId);
  }

  return workflowId;
}
