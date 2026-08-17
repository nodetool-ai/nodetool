import type {
  CostEstimateInput,
  GraphValidationInput,
  GraphValidationRegistry
} from "@nodetool-ai/node-sdk";
import {
  sdkV1PreflightRequest,
  type SdkV1PreflightRequest,
  type SdkV1PreflightSummary,
  type SdkV1Requirement
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { WorkflowInterfaceV1Response } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  buildSdkV1AvailabilityPreflight,
  buildSdkV1ExecutionPreflight,
  buildSdkV1StaticPreflight,
  type BuildSdkV1StaticPreflightOptions,
  type SdkV1ExecutionReadiness,
  type SdkV1RequirementAvailability
} from "./sdk-static-preflight-service.js";

type PreflightRegistry = GraphValidationRegistry & {
  getMetadata: CostEstimateInput["getMetadata"];
};

export interface SdkV1PreflightPrincipal {
  userId: string;
}

interface SdkV1AuthorizedWorkflow {
  graph: GraphValidationInput;
  workflowInterface: WorkflowInterfaceV1Response;
}

export interface SdkV1AuthorizedWorkflowSource {
  /**
   * Returns null for both missing and inaccessible workflows. Implementations
   * own tenant/workspace authorization and must not reveal which case applied.
   */
  loadAuthorizedWorkflow(input: {
    workflowId: string;
    workspaceId: string | null;
    principal: SdkV1PreflightPrincipal;
  }): Promise<SdkV1AuthorizedWorkflow | null>;
}

export type SdkV1RequirementResolver = (
  requirement: Readonly<SdkV1Requirement>
) => Promise<SdkV1RequirementAvailability> | SdkV1RequirementAvailability;

interface RunSdkV1PreflightOptions {
  request: SdkV1PreflightRequest;
  principal: SdkV1PreflightPrincipal;
  workflowSource: SdkV1AuthorizedWorkflowSource;
  registry: PreflightRegistry;
  resolveRequirement?: SdkV1RequirementResolver;
  probeExecutionReadiness?: () =>
    | Promise<SdkV1ExecutionReadiness>
    | SdkV1ExecutionReadiness;
  getModelPrice?: CostEstimateInput["getModelPrice"];
  quantities?: Readonly<Record<string, number>>;
  approvalThreshold?: number | null;
  resolveNodePackageId?: BuildSdkV1StaticPreflightOptions["resolveNodePackageId"];
}

export type SdkV1PreflightServiceErrorCode =
  | "WORKFLOW_NOT_FOUND"
  | "PREFLIGHT_LEVEL_UNAVAILABLE";

export class SdkV1PreflightServiceError extends Error {
  constructor(
    public readonly code: SdkV1PreflightServiceErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "SdkV1PreflightServiceError";
  }
}

/**
 * Shared transport-neutral preflight entry point.
 *
 * It performs authorized reads and delegates validation/readiness to the pure
 * builders. It never creates a job, starts a provider request, or initiates a
 * model/asset download.
 */
export async function runSdkV1Preflight(
  options: RunSdkV1PreflightOptions
): Promise<SdkV1PreflightSummary> {
  const request = sdkV1PreflightRequest.parse(options.request);
  const workflow = await options.workflowSource.loadAuthorizedWorkflow({
    workflowId: request.workflow_id,
    workspaceId: request.workspace_id,
    principal: options.principal
  });
  if (!workflow) {
    throw new SdkV1PreflightServiceError(
      "WORKFLOW_NOT_FOUND",
      "Workflow not found.",
      false
    );
  }

  const common = {
    workflowInterface: workflow.workflowInterface,
    graph: workflow.graph,
    registry: options.registry,
    getModelPrice: options.getModelPrice,
    quantities: options.quantities,
    approvalThreshold: options.approvalThreshold,
    resolveNodePackageId: options.resolveNodePackageId
  };

  switch (request.level) {
    case "static":
      return buildSdkV1StaticPreflight({ ...common, request });
    case "availability":
      if (!options.resolveRequirement) {
        throw new SdkV1PreflightServiceError(
          "PREFLIGHT_LEVEL_UNAVAILABLE",
          "Availability preflight is not available.",
          false
        );
      }
      return buildSdkV1AvailabilityPreflight({
        ...common,
        request: { ...request, level: "availability" },
        resolveRequirement: options.resolveRequirement
      });
    case "execution":
      if (!options.resolveRequirement || !options.probeExecutionReadiness) {
        throw new SdkV1PreflightServiceError(
          "PREFLIGHT_LEVEL_UNAVAILABLE",
          "Execution preflight is not available.",
          false
        );
      }
      return buildSdkV1ExecutionPreflight({
        ...common,
        request: { ...request, level: "execution" },
        resolveRequirement: options.resolveRequirement,
        probeExecutionReadiness: options.probeExecutionReadiness
      });
  }
}
