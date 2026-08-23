import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  sdkNodeTypeInventoryOutput,
  type SdkNodeTypeInventoryInput,
  type SdkNodeTypeInventoryOutput
} from "@nodetool-ai/protocol/api-schemas/nodes.js";
import {
  sdkV1ModelCatalog,
  sdkV1ModelDownloadSnapshot,
  sdkV1ModelDownloadState,
  type SdkV1ModelCatalog,
  type SdkV1ModelCatalogQuery,
  type SdkV1ModelDownloadQuery,
  type SdkV1ModelDownloadSnapshot,
  type SdkV1ModelDownloadStartRequest,
  type SdkV1ModelDownloadState
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import {
  sdkV1Capabilities,
  sdkV1PreflightSummary,
  type SdkV1Capabilities,
  type SdkV1PreflightRequest,
  type SdkV1PreflightSummary,
  type SdkV1TemporaryAssetUpload
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import {
  sdkWorkflowSummariesOutput,
  workflowInterfacesOutput,
  workflowInterfaceV1,
  type SdkWorkflowSummariesInput,
  type SdkWorkflowSummariesOutput,
  type WorkflowInterfaceV1Response,
  type WorkflowInterfacesInput,
  type WorkflowInterfacesOutput
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  getWorkflowInterfaceV1,
  getWorkflowInterfacesV1,
  listWorkflowSummariesV1,
  WorkflowInterfaceServiceError
} from "../workflow-interface-service.js";
import {
  isSdkLifecycleV1Enabled,
  isSdkWorkflowInterfaceV1Enabled
} from "./sdk-feature-flags.js";
import {
  getSdkNodeTypeInventory,
  SdkNodeTypeInventoryServiceError
} from "./sdk-node-type-inventory-service.js";
import { SdkModelCatalogServiceError } from "./sdk-model-catalog-service.js";
import {
  SdkModelDownloadServiceError,
  type SdkV1ModelDownloadService
} from "./sdk-model-download-service.js";
import {
  SdkV1PreflightServiceError,
  type SdkV1PreflightPrincipal
} from "./sdk-preflight-orchestrator.js";
import { SdkV1ServiceError } from "./sdk-v1-service-error.js";
import type {
  SdkV1TemporaryAssetInput,
  SdkV1TemporaryAssetService
} from "./sdk-temporary-asset-service.js";

export interface SdkV1ServiceOptions {
  readonly getCapabilities?: () =>
    | Promise<SdkV1Capabilities>
    | SdkV1Capabilities;
  readonly preflightService?: {
    preflight(input: {
      readonly request: SdkV1PreflightRequest;
      readonly principal: SdkV1PreflightPrincipal;
    }): Promise<SdkV1PreflightSummary>;
  };
  readonly modelCatalogService?: {
    list(input: {
      readonly userId: string;
      readonly query: SdkV1ModelCatalogQuery;
    }): Promise<SdkV1ModelCatalog> | SdkV1ModelCatalog;
  };
  readonly modelDownloadService?: SdkV1ModelDownloadService;
  readonly temporaryAssetService?: SdkV1TemporaryAssetService;
  readonly getEnvironment?: () => NodeJS.ProcessEnv;
}

export interface SdkV1Service {
  assertLifecycleAvailable(): void;
  assertWorkflowInterfaceAvailable(): void;
  getNodeTypeInventory(input: {
    readonly request: SdkNodeTypeInventoryInput;
    readonly registry: NodeRegistry;
    readonly pythonBridgeReady: boolean;
  }): Promise<SdkNodeTypeInventoryOutput>;
  getCapabilities(): Promise<SdkV1Capabilities>;
  listModels(input: {
    readonly userId: string;
    readonly query: SdkV1ModelCatalogQuery;
  }): Promise<SdkV1ModelCatalog>;
  listModelDownloads(input: {
    readonly userId: string;
    readonly query: SdkV1ModelDownloadQuery;
  }): Promise<SdkV1ModelDownloadSnapshot>;
  startModelDownload(input: {
    readonly userId: string;
    readonly request: SdkV1ModelDownloadStartRequest;
  }): Promise<SdkV1ModelDownloadState>;
  cancelModelDownload(input: {
    readonly userId: string;
    readonly operationId: string;
  }): Promise<SdkV1ModelDownloadState>;
  preflightWorkflow(input: {
    readonly request: SdkV1PreflightRequest;
    readonly principal: SdkV1PreflightPrincipal | null;
  }): Promise<SdkV1PreflightSummary>;
  listWorkflowSummaries(input: {
    readonly userId: string;
    readonly request: SdkWorkflowSummariesInput;
    readonly registryRevision: number | null;
  }): Promise<SdkWorkflowSummariesOutput>;
  getWorkflowInterfaces(input: {
    readonly userId: string;
    readonly request: WorkflowInterfacesInput;
    readonly registry: NodeRegistry;
  }): Promise<WorkflowInterfacesOutput>;
  getWorkflowInterface(input: {
    readonly userId: string;
    readonly workflowId: string;
    readonly registry: NodeRegistry;
  }): Promise<WorkflowInterfaceV1Response>;
  uploadTemporaryAsset(
    input: SdkV1TemporaryAssetInput
  ): Promise<SdkV1TemporaryAssetUpload>;
}

function unavailableDependency(name: string): never {
  throw new Error(`${name} is unavailable`);
}

function workflowServiceError(error: WorkflowInterfaceServiceError): never {
  if (error.code === "feature_disabled") {
    throw new SdkV1ServiceError(
      "unavailable",
      "SDK_WORKFLOW_INTERFACE_DISABLED",
      error.message,
      false,
      error
    );
  }
  if (error.code === "workflow_not_found") {
    throw new SdkV1ServiceError(
      "not-found",
      "WORKFLOW_NOT_FOUND",
      error.message,
      false,
      error
    );
  }
  throw new SdkV1ServiceError(
    "invalid-resource",
    "INVALID_WORKFLOW_GRAPH",
    error.message,
    false,
    error
  );
}

function preflightServiceError(error: SdkV1PreflightServiceError): never {
  if (error.code === "WORKFLOW_NOT_FOUND") {
    throw new SdkV1ServiceError(
      "not-found",
      error.code,
      "Workflow not found.",
      error.retryable,
      error
    );
  }
  throw new SdkV1ServiceError(
    "unavailable",
    error.code,
    "Requested preflight level is not available.",
    error.retryable,
    error
  );
}

function modelDownloadServiceError(error: SdkModelDownloadServiceError): never {
  const category = error.statusCode === 404 ? "not-found" : "not-implemented";
  throw new SdkV1ServiceError(
    category,
    error.code,
    error.message,
    false,
    error
  );
}

export function createSdkV1Service(
  options: SdkV1ServiceOptions = {}
): SdkV1Service {
  const environment = () => options.getEnvironment?.() ?? process.env;

  const assertLifecycleAvailable = (): void => {
    if (!isSdkLifecycleV1Enabled(environment())) {
      throw new SdkV1ServiceError(
        "unavailable",
        "SDK_LIFECYCLE_DISABLED",
        "SDK lifecycle v1 is disabled"
      );
    }
  };

  const assertWorkflowInterfaceAvailable = (): void => {
    if (!isSdkWorkflowInterfaceV1Enabled(environment())) {
      throw new SdkV1ServiceError(
        "unavailable",
        "SDK_WORKFLOW_INTERFACE_DISABLED",
        "SDK workflow interface v1 is disabled"
      );
    }
  };

  return {
    assertLifecycleAvailable,
    assertWorkflowInterfaceAvailable,

    async getNodeTypeInventory(input) {
      try {
        if (!isSdkWorkflowInterfaceV1Enabled(environment())) {
          throw new SdkV1ServiceError(
            "unavailable",
            "SDK_NODE_TYPE_INVENTORY_DISABLED",
            "SDK node/type inventory v1 is disabled"
          );
        }
        return sdkNodeTypeInventoryOutput.parse(
          getSdkNodeTypeInventory({
            registry: input.registry,
            pythonBridgeReady: input.pythonBridgeReady,
            input: input.request
          })
        );
      } catch (error) {
        if (error instanceof SdkNodeTypeInventoryServiceError) {
          throw new SdkV1ServiceError(
            "unavailable",
            "SDK_NODE_TYPE_INVENTORY_DISABLED",
            error.message,
            false,
            error
          );
        }
        throw error;
      }
    },

    async getCapabilities() {
      assertLifecycleAvailable();
      const getCapabilities =
        options.getCapabilities ??
        (() => unavailableDependency("SDK capability provider"));
      return sdkV1Capabilities.parse(await getCapabilities());
    },

    async listModels(input) {
      try {
        const service =
          options.modelCatalogService ??
          unavailableDependency("SDK model catalog service");
        return sdkV1ModelCatalog.parse(await service.list(input));
      } catch (error) {
        if (error instanceof SdkModelCatalogServiceError) {
          throw new SdkV1ServiceError(
            "not-implemented",
            "MODEL_SCOPE_UNAVAILABLE",
            error.message,
            false,
            error
          );
        }
        throw error;
      }
    },

    async listModelDownloads(input) {
      try {
        const service =
          options.modelDownloadService ??
          unavailableDependency("SDK model download service");
        return sdkV1ModelDownloadSnapshot.parse(service.list(input));
      } catch (error) {
        if (error instanceof SdkModelDownloadServiceError) {
          modelDownloadServiceError(error);
        }
        throw error;
      }
    },

    async startModelDownload(input) {
      try {
        const service =
          options.modelDownloadService ??
          unavailableDependency("SDK model download service");
        return sdkV1ModelDownloadState.parse(service.start(input));
      } catch (error) {
        if (error instanceof SdkModelDownloadServiceError) {
          modelDownloadServiceError(error);
        }
        throw error;
      }
    },

    async cancelModelDownload(input) {
      try {
        const service =
          options.modelDownloadService ??
          unavailableDependency("SDK model download service");
        return sdkV1ModelDownloadState.parse(service.cancel(input));
      } catch (error) {
        if (error instanceof SdkModelDownloadServiceError) {
          modelDownloadServiceError(error);
        }
        throw error;
      }
    },

    async preflightWorkflow(input) {
      assertLifecycleAvailable();
      if (!input.principal) {
        throw new SdkV1ServiceError(
          "authentication-required",
          "AUTHENTICATION_REQUIRED",
          "Authentication required"
        );
      }
      try {
        const service =
          options.preflightService ??
          unavailableDependency("SDK preflight service");
        return sdkV1PreflightSummary.parse(
          await service.preflight({
            request: input.request,
            principal: input.principal
          })
        );
      } catch (error) {
        if (error instanceof SdkV1PreflightServiceError) {
          preflightServiceError(error);
        }
        throw error;
      }
    },

    async listWorkflowSummaries(input) {
      try {
        assertWorkflowInterfaceAvailable();
        const listInput: Parameters<typeof listWorkflowSummariesV1>[0] = input
          .request.cursor
          ? {
              userId: input.userId,
              limit: input.request.limit,
              cursor: input.request.cursor
            }
          : {
              userId: input.userId,
              limit: input.request.limit
            };
        const result = await listWorkflowSummariesV1(listInput);
        return sdkWorkflowSummariesOutput.parse({
          workflows: result.workflows.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            revision: workflow.updated_at,
            registry_revision: input.registryRevision,
            run_mode: workflow.run_mode
          })),
          next: result.next
        });
      } catch (error) {
        if (error instanceof WorkflowInterfaceServiceError) {
          workflowServiceError(error);
        }
        throw error;
      }
    },

    async getWorkflowInterfaces(input) {
      try {
        assertWorkflowInterfaceAvailable();
        return workflowInterfacesOutput.parse(
          await getWorkflowInterfacesV1({
            workflowIds: input.request.ids,
            userId: input.userId,
            registry: input.registry
          })
        );
      } catch (error) {
        if (error instanceof WorkflowInterfaceServiceError) {
          workflowServiceError(error);
        }
        throw error;
      }
    },

    async getWorkflowInterface(input) {
      try {
        assertWorkflowInterfaceAvailable();
        return workflowInterfaceV1.parse(
          await getWorkflowInterfaceV1({
            workflowId: input.workflowId,
            userId: input.userId,
            registry: input.registry
          })
        );
      } catch (error) {
        if (error instanceof WorkflowInterfaceServiceError) {
          workflowServiceError(error);
        }
        throw error;
      }
    },

    async uploadTemporaryAsset(input) {
      assertLifecycleAvailable();
      const service =
        options.temporaryAssetService ??
        unavailableDependency("SDK temporary asset service");
      return service.upload(input);
    }
  };
}
