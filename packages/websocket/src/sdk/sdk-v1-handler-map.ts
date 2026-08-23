import { implementedSdkV1HttpOperations } from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import type { SdkV1Service } from "./sdk-v1-service.js";

type ServiceInput<Method extends keyof SdkV1Service> = Parameters<
  SdkV1Service[Method]
>[0];
type ServiceOutput<Method extends keyof SdkV1Service> = Awaited<
  ReturnType<SdkV1Service[Method]>
>;

export interface SdkV1HandlerInputById {
  readonly getNodeTypeInventory: ServiceInput<"getNodeTypeInventory">;
  readonly getCapabilities: undefined;
  readonly listModels: ServiceInput<"listModels">;
  readonly listModelDownloads: ServiceInput<"listModelDownloads">;
  readonly startModelDownload: ServiceInput<"startModelDownload">;
  readonly cancelModelDownload: ServiceInput<"cancelModelDownload">;
  readonly preflightWorkflow: ServiceInput<"preflightWorkflow">;
  readonly listWorkflowSummaries: ServiceInput<"listWorkflowSummaries">;
  readonly getWorkflowInterfaces: ServiceInput<"getWorkflowInterfaces">;
  readonly getWorkflowInterface: ServiceInput<"getWorkflowInterface">;
  readonly uploadTemporaryAsset: ServiceInput<"uploadTemporaryAsset">;
}

export interface SdkV1HandlerOutputById {
  readonly getNodeTypeInventory: ServiceOutput<"getNodeTypeInventory">;
  readonly getCapabilities: ServiceOutput<"getCapabilities">;
  readonly listModels: ServiceOutput<"listModels">;
  readonly listModelDownloads: ServiceOutput<"listModelDownloads">;
  readonly startModelDownload: ServiceOutput<"startModelDownload">;
  readonly cancelModelDownload: ServiceOutput<"cancelModelDownload">;
  readonly preflightWorkflow: ServiceOutput<"preflightWorkflow">;
  readonly listWorkflowSummaries: ServiceOutput<"listWorkflowSummaries">;
  readonly getWorkflowInterfaces: ServiceOutput<"getWorkflowInterfaces">;
  readonly getWorkflowInterface: ServiceOutput<"getWorkflowInterface">;
  readonly uploadTemporaryAsset: ServiceOutput<"uploadTemporaryAsset">;
}

export type SdkV1ImplementedRequestResponseOperationId =
  keyof SdkV1HandlerInputById;

export type SdkV1HandlerMap = {
  readonly [Id in SdkV1ImplementedRequestResponseOperationId]: (
    input: SdkV1HandlerInputById[Id]
  ) => Promise<SdkV1HandlerOutputById[Id]>;
};

export interface SdkV1ImplementationBoundary {
  readonly service: SdkV1Service;
  readonly handlers: SdkV1HandlerMap;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertEqualIds(
  label: string,
  expected: readonly string[],
  actual: readonly string[]
): void {
  const expectedIds = sorted(expected);
  const actualIds = sorted(actual);
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new Error(
      `${label} mismatch: expected [${expectedIds.join(", ")}], ` +
        `received [${actualIds.join(", ")}]`
    );
  }
}

export function assertSdkV1ImplementationCoverage(input: {
  readonly handlers: Readonly<Record<string, unknown>>;
}): void {
  assertEqualIds(
    "SDK v1 HTTP handler coverage",
    implementedSdkV1HttpOperations.map((operation) => operation.id),
    Object.keys(input.handlers)
  );
}

export function createSdkV1HandlerMap(service: SdkV1Service): SdkV1HandlerMap {
  return {
    getNodeTypeInventory: (input) => service.getNodeTypeInventory(input),
    getCapabilities: () => service.getCapabilities(),
    listModels: (input) => service.listModels(input),
    listModelDownloads: (input) => service.listModelDownloads(input),
    startModelDownload: (input) => service.startModelDownload(input),
    cancelModelDownload: (input) => service.cancelModelDownload(input),
    preflightWorkflow: (input) => service.preflightWorkflow(input),
    listWorkflowSummaries: (input) => service.listWorkflowSummaries(input),
    getWorkflowInterfaces: (input) => service.getWorkflowInterfaces(input),
    getWorkflowInterface: (input) => service.getWorkflowInterface(input),
    uploadTemporaryAsset: (input) => service.uploadTemporaryAsset(input)
  };
}

export function createSdkV1ImplementationBoundary(
  service: SdkV1Service
): SdkV1ImplementationBoundary {
  const handlers = createSdkV1HandlerMap(service);
  assertSdkV1ImplementationCoverage({ handlers });
  return { service, handlers };
}
