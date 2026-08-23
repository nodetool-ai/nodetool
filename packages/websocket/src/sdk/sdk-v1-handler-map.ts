import {
  implementedSdkV1HttpOperations,
  implementedSdkV1WebSocketOperations,
  type SdkV1WebSocketOperationDeclaration
} from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
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
  readonly "sdkRpc.list_workflow_summaries": ServiceInput<"listWorkflowSummaries">;
  readonly "sdkRpc.get_workflow_interface": ServiceInput<"getWorkflowInterface">;
  readonly "sdkRpc.get_workflow_interfaces": ServiceInput<"getWorkflowInterfaces">;
  readonly "sdkRpc.get_node_type_inventory": ServiceInput<"getNodeTypeInventory">;
  readonly "lifecycleRpc.get_capabilities": undefined;
  readonly "lifecycleRpc.preflight_workflow": ServiceInput<"preflightWorkflow">;
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
  readonly "sdkRpc.list_workflow_summaries": ServiceOutput<"listWorkflowSummaries">;
  readonly "sdkRpc.get_workflow_interface": ServiceOutput<"getWorkflowInterface">;
  readonly "sdkRpc.get_workflow_interfaces": ServiceOutput<"getWorkflowInterfaces">;
  readonly "sdkRpc.get_node_type_inventory": ServiceOutput<"getNodeTypeInventory">;
  readonly "lifecycleRpc.get_capabilities": ServiceOutput<"getCapabilities">;
  readonly "lifecycleRpc.preflight_workflow": ServiceOutput<"preflightWorkflow">;
}

export type SdkV1ImplementedRequestResponseOperationId =
  keyof SdkV1HandlerInputById;

export type SdkV1HandlerMap = {
  readonly [Id in SdkV1ImplementedRequestResponseOperationId]: (
    input: SdkV1HandlerInputById[Id]
  ) => Promise<SdkV1HandlerOutputById[Id]>;
};

export type SdkV1EventPublisher = (message: unknown) => void | Promise<void>;
export type SdkV1EventPublisherMap = Readonly<
  Record<string, SdkV1EventPublisher>
>;

export interface SdkV1ImplementationBoundary {
  readonly service: SdkV1Service;
  readonly handlers: SdkV1HandlerMap;
  readonly eventPublishers: SdkV1EventPublisherMap;
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
  readonly eventPublishers: Readonly<Record<string, unknown>>;
}): void {
  const websocketOperations: readonly SdkV1WebSocketOperationDeclaration[] =
    implementedSdkV1WebSocketOperations;
  const requestResponseIds = [
    ...implementedSdkV1HttpOperations.map((operation) => operation.id),
    ...websocketOperations
      .filter((operation) => operation.direction === "request-response")
      .map((operation) => operation.id)
  ];
  const eventIds = websocketOperations
    .filter((operation) => operation.direction === "server-event")
    .map((operation) => operation.id);

  assertEqualIds(
    "SDK v1 request/response handler coverage",
    requestResponseIds,
    Object.keys(input.handlers)
  );
  assertEqualIds(
    "SDK v1 server-event publisher coverage",
    eventIds,
    Object.keys(input.eventPublishers)
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
    uploadTemporaryAsset: (input) => service.uploadTemporaryAsset(input),
    "sdkRpc.list_workflow_summaries": (input) =>
      service.listWorkflowSummaries(input),
    "sdkRpc.get_workflow_interface": (input) =>
      service.getWorkflowInterface(input),
    "sdkRpc.get_workflow_interfaces": (input) =>
      service.getWorkflowInterfaces(input),
    "sdkRpc.get_node_type_inventory": (input) =>
      service.getNodeTypeInventory(input),
    "lifecycleRpc.get_capabilities": () => service.getCapabilities(),
    "lifecycleRpc.preflight_workflow": (input) =>
      service.preflightWorkflow(input)
  };
}

export function createSdkV1ImplementationBoundary(
  service: SdkV1Service,
  eventPublishers: SdkV1EventPublisherMap = {}
): SdkV1ImplementationBoundary {
  const handlers = createSdkV1HandlerMap(service);
  assertSdkV1ImplementationCoverage({ handlers, eventPublishers });
  return { service, handlers, eventPublishers };
}
