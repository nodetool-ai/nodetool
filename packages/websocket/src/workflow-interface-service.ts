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
  type WorkflowInterfaceV1Response,
  type WorkflowInterfacesOutput
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { isSdkWorkflowInterfaceV1Enabled } from "./sdk/sdk-feature-flags.js";

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

const MAX_CACHED_INTERFACES_PER_REGISTRY = 512;
interface WorkflowInterfaceCache {
  revision: number;
  values: Map<string, WorkflowInterfaceV1Response>;
}
const interfaceCaches = new WeakMap<NodeRegistry, WorkflowInterfaceCache>();

function deriveCachedWorkflowInterface(
  workflow: Workflow,
  graph: Parameters<typeof deriveWorkflowInterfaceV1>[0]["graph"],
  registry: NodeRegistry
): WorkflowInterfaceV1Response {
  let cache = interfaceCaches.get(registry);
  if (!cache || cache.revision !== registry.revision) {
    cache = { revision: registry.revision, values: new Map() };
    interfaceCaches.set(registry, cache);
  }
  const etag = workflow.getEtag() ?? null;
  const cacheKey = `${workflow.id}\u0000${etag ?? ""}`;
  const cached = cache.values.get(cacheKey);
  if (cached) return cached;

  const result = workflowInterfaceV1.parse(
    deriveWorkflowInterfaceV1({
      workflowId: workflow.id,
      etag,
      graph,
      registry
    })
  );
  cache.values.set(cacheKey, result);
  if (cache.values.size > MAX_CACHED_INTERFACES_PER_REGISTRY) {
    const oldestKey = cache.values.keys().next().value;
    if (oldestKey !== undefined) cache.values.delete(oldestKey);
  }
  return result;
}

export function deriveWorkflowInterfaceSourceV1(args: {
  readonly workflow: Workflow;
  readonly registry: NodeRegistry;
}) {
  const graph = graphSchema.safeParse(args.workflow.graph);
  if (!graph.success) {
    throw new WorkflowInterfaceServiceError(
      "invalid_graph",
      "Workflow graph is invalid"
    );
  }
  return {
    graph: graph.data,
    workflowInterface: deriveCachedWorkflowInterface(
      args.workflow,
      graph.data,
      args.registry
    )
  };
}

function requireFeature(): void {
  if (!isSdkWorkflowInterfaceV1Enabled()) {
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
  return deriveWorkflowInterfaceSourceV1({
    workflow,
    registry: args.registry
  }).workflowInterface;
}

/** Derives up to 100 interfaces with bounded database queries and item errors. */
export async function getWorkflowInterfacesV1(args: {
  readonly workflowIds: readonly string[];
  readonly userId: string;
  readonly registry: NodeRegistry;
}): Promise<WorkflowInterfacesOutput> {
  requireFeature();
  if (args.workflowIds.length < 1 || args.workflowIds.length > 100) {
    throw new Error("Expected between 1 and 100 workflow ids");
  }

  const workflows = await Workflow.getManyByIds(args.workflowIds);
  const candidateIds = args.workflowIds.filter((id) => {
    const workflow = workflows.get(id);
    return (
      workflow &&
      workflow.user_id !== args.userId &&
      workflow.access !== "public"
    );
  });
  const grantedIds = await WorkflowCollaborator.grantedWorkflowIds(
    args.userId,
    candidateIds
  );
  const result: WorkflowInterfacesOutput = { interfaces: [], errors: [] };

  for (const workflowId of args.workflowIds) {
    const workflow = workflows.get(workflowId);
    if (
      !workflow ||
      (workflow.user_id !== args.userId &&
        workflow.access !== "public" &&
        !grantedIds.has(workflowId))
    ) {
      result.errors.push({
        workflow_id: workflowId,
        code: "workflow_not_found",
        message: "Workflow not found"
      });
      continue;
    }
    const graph = graphSchema.safeParse(workflow.graph);
    if (!graph.success) {
      result.errors.push({
        workflow_id: workflowId,
        code: "invalid_graph",
        message: "Workflow graph is invalid"
      });
      continue;
    }
    result.interfaces.push(
      deriveCachedWorkflowInterface(workflow, graph.data, args.registry)
    );
  }
  return result;
}

/** Lists only small identity columns; workflow graph JSON is not selected. */
export async function listWorkflowSummariesV1(args: {
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
}): Promise<{ workflows: WorkflowSummary[]; next: string | null }> {
  requireFeature();
  const page: Parameters<typeof Workflow.paginateSummaries>[1] = {
    limit: args.limit
  };
  if (args.cursor) {
    page.startKey = args.cursor;
  }
  const [workflows, cursor] = await Workflow.paginateSummaries(
    args.userId,
    page
  );
  return { workflows, next: cursor || null };
}
