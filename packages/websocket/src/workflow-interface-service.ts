import {
  Workflow,
  WorkflowCollaborator,
  type WorkflowSummary
} from "@nodetool-ai/models";
import {
  deriveWorkflowInterfaceV1,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import {
  graph as graphSchema,
  workflowInterfaceV1,
  type WorkflowInterfaceV1Response
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

export type WorkflowInterfaceServiceErrorCode =
  | "feature_disabled"
  | "workflow_not_found"
  | "invalid_graph";

export class WorkflowInterfaceServiceError extends Error {
  readonly code: WorkflowInterfaceServiceErrorCode;

  constructor(code: WorkflowInterfaceServiceErrorCode, message: string) {
    super(message);
    this.name = "WorkflowInterfaceServiceError";
    this.code = code;
  }
}

function requireFeature(): void {
  if (process.env["NODETOOL_ENABLE_SDK_WORKFLOW_INTERFACE_V1"] !== "1") {
    throw new WorkflowInterfaceServiceError(
      "feature_disabled",
      "SDK workflow interface v1 is disabled"
    );
  }
}

async function getAccessibleWorkflow(workflowId: string, userId: string) {
  const workflow = await Workflow.get<Workflow>(workflowId);
  if (!workflow) {
    throw new WorkflowInterfaceServiceError(
      "workflow_not_found",
      "Workflow not found"
    );
  }
  if (workflow.user_id === userId || workflow.access === "public") {
    return workflow;
  }
  const collaborator = await WorkflowCollaborator.findFor(workflowId, userId);
  if (!collaborator) {
    throw new WorkflowInterfaceServiceError(
      "workflow_not_found",
      "Workflow not found"
    );
  }
  return workflow;
}

/** Returns a compact graph-derived contract after viewer authorization. */
export async function getWorkflowInterfaceV1(args: {
  readonly workflowId: string;
  readonly userId: string;
  readonly registry: NodeRegistry;
}): Promise<WorkflowInterfaceV1Response> {
  requireFeature();
  const workflow = await getAccessibleWorkflow(args.workflowId, args.userId);
  const graph = graphSchema.safeParse(workflow.graph);
  if (!graph.success) {
    throw new WorkflowInterfaceServiceError(
      "invalid_graph",
      "Workflow graph is invalid"
    );
  }
  return workflowInterfaceV1.parse(
    deriveWorkflowInterfaceV1({
      workflowId: workflow.id,
      etag: workflow.getEtag() ?? null,
      graph: graph.data,
      registry: args.registry
    })
  );
}

/** Lists only small identity columns; workflow graph JSON is not selected. */
export async function listWorkflowSummariesV1(args: {
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
}): Promise<{ workflows: WorkflowSummary[]; next: string | null }> {
  requireFeature();
  const [workflows, cursor] = await Workflow.paginateSummaries(args.userId, {
    limit: args.limit,
    ...(args.cursor ? { startKey: args.cursor } : {})
  });
  return { workflows, next: cursor || null };
}
