import type { CostEstimateInput, NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  SdkV1PreflightRequest,
  SdkV1PreflightSummary
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import {
  runSdkV1Preflight,
  type SdkV1AuthorizedWorkflowSource,
  type SdkV1PreflightPrincipal,
  type SdkV1RequirementResolver
} from "./sdk-preflight-orchestrator.js";
import {
  createNodeToolSdkV1RequirementResolver,
  type CreateNodeToolSdkV1RequirementResolverOptions
} from "./sdk-preflight-requirement-resolver.js";
import { createNodeToolSdkV1RuntimeProbe } from "./sdk-runtime-requirement-probe.js";
import { createNodeToolSdkV1ModelProbe } from "./sdk-model-requirement-probe.js";
import { createNodeToolSdkV1NodePackageProbe } from "./sdk-node-package-requirement-probe.js";
import {
  createNodeToolSdkV1ExecutionReadinessProbe,
  type SdkV1ExecutionTargetReadiness
} from "./sdk-execution-readiness-probe.js";
import { createNodeToolSdkV1WorkflowSource } from "./sdk-preflight-workflow-source.js";
import type { SdkV1ExecutionReadiness } from "./sdk-static-preflight-service.js";
import type { SdkExecutionCapacitySnapshot } from "../unified-websocket-runner.js";
import { getExistingDownloadManager } from "@nodetool-ai/huggingface";
import { createNodeToolSdkV1HuggingFaceDownloadStateReader } from "./sdk-huggingface-download-state.js";
import { isFunctionValue } from "../lib/wire-values.js";

type RequirementResolverOptions = Omit<
  CreateNodeToolSdkV1RequirementResolverOptions,
  "userId"
>;

export interface CreateNodeToolSdkV1PreflightServiceOptions {
  registry: NodeRegistry;
  workflowSource?: SdkV1AuthorizedWorkflowSource;
  requirementResolverOptions?: RequirementResolverOptions;
  getPythonBridgeReady?: () => boolean;
  createRequirementResolver?: (
    principal: Readonly<SdkV1PreflightPrincipal>
  ) => SdkV1RequirementResolver;
  probeExecutionReadiness?: (input: {
    request: Readonly<SdkV1PreflightRequest & { level: "execution" }>;
    principal: Readonly<SdkV1PreflightPrincipal>;
  }) => Promise<SdkV1ExecutionReadiness> | SdkV1ExecutionReadiness;
  getExecutionCapacitySnapshot?: (input: {
    request: Readonly<SdkV1PreflightRequest & { level: "execution" }>;
    principal: Readonly<SdkV1PreflightPrincipal>;
  }) => Promise<SdkExecutionCapacitySnapshot> | SdkExecutionCapacitySnapshot;
  getExecutionTargetReadiness?: (input: {
    request: Readonly<SdkV1PreflightRequest & { level: "execution" }>;
    principal: Readonly<SdkV1PreflightPrincipal>;
  }) => Promise<SdkV1ExecutionTargetReadiness> | SdkV1ExecutionTargetReadiness;
  getModelPrice?: CostEstimateInput["getModelPrice"];
  quantities?: Readonly<Record<string, number>>;
  approvalThreshold?: number | null;
  /**
   * Optional cache/local model inventory. Preflight never calls remote
   * provider model-list endpoints implicitly.
   */
  listCachedModelIds?: (
    userId: string,
    providerId: string,
    modelTypes: readonly (
      | "language_model"
      | "image_model"
      | "video_model"
      | "tts_model"
      | "asr_model"
      | "embedding_model"
    )[]
  ) => Promise<readonly string[]>;
  getModelDownloadStatus?: (
    userId: string,
    providerId: string,
    modelId: string
  ) =>
    | Promise<"downloading" | "not_downloading" | "unknown">
    | "downloading"
    | "not_downloading"
    | "unknown";
  resolveNodePackageId?: Parameters<
    typeof runSdkV1Preflight
  >[0]["resolveNodePackageId"];
  /**
   * Optional authoritative package inventory. Supplying an inventory does not
   * derive requirements; resolveNodePackageId must independently identify them.
   */
  listInstalledNodePackageIds?: (
    userId: string
  ) => Promise<readonly string[]> | readonly string[];
}

export interface NodeToolSdkV1PreflightService {
  preflight(input: {
    request: SdkV1PreflightRequest;
    principal: SdkV1PreflightPrincipal;
  }): Promise<SdkV1PreflightSummary>;
}

/**
 * Binds NodeTool's workflow authorization and requirement lookup to the same
 * authenticated principal. This remains transport-independent and unrouted.
 */
export function createNodeToolSdkV1PreflightService(
  options: CreateNodeToolSdkV1PreflightServiceOptions
): NodeToolSdkV1PreflightService {
  const listRegistryPackageIds = (): readonly string[] =>
    isFunctionValue(options.registry.listNodePackageIds)
      ? options.registry.listNodePackageIds()
      : [];
  const resolveRegistryPackageId = (nodeType: string): string | null =>
    isFunctionValue(options.registry.getNodePackageId)
      ? (options.registry.getNodePackageId(nodeType) ?? null)
      : null;
  const readHuggingFaceDownloadState =
    createNodeToolSdkV1HuggingFaceDownloadStateReader({
      providerIds: ["huggingface"],
      getDownloadManager: (userId) => getExistingDownloadManager(userId)
    });
  const workflowSource =
    options.workflowSource ??
    createNodeToolSdkV1WorkflowSource({ registry: options.registry });
  const createRequirementResolver =
    options.createRequirementResolver ??
    ((principal: SdkV1PreflightPrincipal) => {
      const configuredProbes = options.requirementResolverOptions?.probes;
      const modelProbe =
        configuredProbes?.model ??
        createNodeToolSdkV1ModelProbe({
          userId: principal.userId,
          listProviderIds: options.requirementResolverOptions?.listProviderIds,
          isProviderReady: options.requirementResolverOptions?.isProviderReady,
          listModelIds: options.listCachedModelIds,
          getModelDownloadStatus:
            options.getModelDownloadStatus ?? readHuggingFaceDownloadState
        });
      const nodePackageProbe =
        configuredProbes?.node_pack ??
        createNodeToolSdkV1NodePackageProbe({
          userId: principal.userId,
          listInstalledPackageIds:
            options.listInstalledNodePackageIds ?? listRegistryPackageIds
        });
      const probes: NonNullable<
        Parameters<typeof createNodeToolSdkV1RequirementResolver>[0]["probes"]
      > = { ...configuredProbes };
      if (modelProbe) {
        probes.model = modelProbe;
      }
      if (nodePackageProbe) {
        probes.node_pack = nodePackageProbe;
      }
      if (options.getPythonBridgeReady) {
        probes.runtime =
          configuredProbes?.runtime ??
          createNodeToolSdkV1RuntimeProbe({
            getPythonBridgeReady: options.getPythonBridgeReady
          });
      }
      return createNodeToolSdkV1RequirementResolver({
        ...options.requirementResolverOptions,
        probes,
        userId: principal.userId
      });
    });

  return {
    async preflight(input) {
      const resolveRequirement =
        input.request.level === "static"
          ? undefined
          : createRequirementResolver(input.principal);
      const executionContext =
        input.request.level === "execution"
          ? {
              request: {
                ...input.request,
                level: "execution" as const
              },
              principal: input.principal
            }
          : null;
      const probeExecutionReadiness =
        executionContext && options.probeExecutionReadiness
          ? () => options.probeExecutionReadiness!(executionContext)
          : executionContext && options.getExecutionCapacitySnapshot
            ? createNodeToolSdkV1ExecutionReadinessProbe({
                getCapacitySnapshot: () =>
                  options.getExecutionCapacitySnapshot!(executionContext),
                getTargetReadiness: options.getExecutionTargetReadiness
                  ? () => options.getExecutionTargetReadiness!(executionContext)
                  : undefined
              })
            : undefined;

      return runSdkV1Preflight({
        request: input.request,
        principal: input.principal,
        workflowSource,
        registry: options.registry,
        resolveRequirement,
        probeExecutionReadiness,
        getModelPrice: options.getModelPrice,
        quantities: options.quantities,
        approvalThreshold: options.approvalThreshold,
        resolveNodePackageId:
          options.resolveNodePackageId ??
          (({ nodeType }) => resolveRegistryPackageId(nodeType))
      });
    }
  };
}
