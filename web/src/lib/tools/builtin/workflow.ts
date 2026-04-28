import { z } from "zod";
import type { FrontendToolState } from "../frontendTools";

export { optionalWorkflowIdSchema } from "@nodetool-ai/protocol";

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
