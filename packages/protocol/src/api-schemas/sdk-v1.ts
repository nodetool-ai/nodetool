import { z } from "zod";
import {
  sdkWorkflowSummariesInput,
  sdkWorkflowSummariesOutput,
  workflowInterfaceInput,
  workflowInterfacesInput,
  workflowInterfaceV1,
  workflowInterfacesOutput
} from "./workflows.js";
import {
  sdkNodeTypeInventoryInput,
  sdkNodeTypeInventoryOutput
} from "./nodes.js";

export const sdkV1RpcCommand = z.enum([
  "list_workflow_summaries",
  "get_workflow_interface",
  "get_workflow_interfaces",
  "get_node_type_inventory"
]);
export type SdkV1RpcCommand = z.infer<typeof sdkV1RpcCommand>;

export const sdkV1Error = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean()
});
export type SdkV1Error = z.infer<typeof sdkV1Error>;

export const sdkV1HttpError = sdkV1Error.extend({
  detail: z.string()
});
export type SdkV1HttpError = z.infer<typeof sdkV1HttpError>;

export const sdkV1RpcError = sdkV1Error.extend({
  apiCode: z.string().nullable().optional(),
  trpcCode: z.string().optional()
});
export type SdkV1RpcError = z.infer<typeof sdkV1RpcError>;

const RETRYABLE_ERROR_CODES = new Set([
  "INTERNAL_ERROR",
  "INTERNAL_SERVER_ERROR",
  "PYTHON_BRIDGE_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
  "TOO_MANY_REQUESTS"
]);

export function isSdkV1RetryableError(
  code: string,
  message = ""
): boolean {
  if (message.toLowerCase().includes("disabled")) {
    return false;
  }
  return RETRYABLE_ERROR_CODES.has(code);
}

export function getSdkV1SafeErrorMessage(
  code: string,
  internalMessage = ""
): string {
  if (
    code === "SERVICE_UNAVAILABLE" &&
    internalMessage.toLowerCase().includes("disabled")
  ) {
    return "SDK discovery is disabled";
  }

  switch (code) {
    case "BAD_REQUEST":
    case "INVALID_INPUT":
      return "Invalid request";
    case "FORBIDDEN":
      return "Forbidden";
    case "NOT_FOUND":
      return "Resource not found";
    case "UNAUTHORIZED":
      return "Unauthorized";
    case "WORKFLOW_NOT_FOUND":
      return "Workflow not found";
    case "PYTHON_BRIDGE_UNAVAILABLE":
    case "SERVICE_UNAVAILABLE":
      return "Service unavailable";
    case "TIMEOUT":
      return "Request timed out";
    case "TOO_MANY_REQUESTS":
      return "Too many requests";
    default:
      return "Internal server error";
  }
}

const requestId = z.string().min(1);

export const sdkV1RpcRequest = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("list_workflow_summaries"),
    request_id: requestId,
    data: sdkWorkflowSummariesInput
  }),
  z.object({
    command: z.literal("get_workflow_interface"),
    request_id: requestId,
    data: workflowInterfaceInput
  }),
  z.object({
    command: z.literal("get_workflow_interfaces"),
    request_id: requestId,
    data: workflowInterfacesInput
  }),
  z.object({
    command: z.literal("get_node_type_inventory"),
    request_id: requestId,
    data: sdkNodeTypeInventoryInput
  })
]);
export type SdkV1RpcRequest = z.infer<typeof sdkV1RpcRequest>;

const responseBase = {
  type: z.literal("rpc_response"),
  request_id: requestId
} as const;

const sdkV1RpcSuccessResponse = z.discriminatedUnion("command", [
  z.object({
    ...responseBase,
    command: z.literal("list_workflow_summaries"),
    result: sdkWorkflowSummariesOutput
  }),
  z.object({
    ...responseBase,
    command: z.literal("get_workflow_interface"),
    result: workflowInterfaceV1
  }),
  z.object({
    ...responseBase,
    command: z.literal("get_workflow_interfaces"),
    result: workflowInterfacesOutput
  }),
  z.object({
    ...responseBase,
    command: z.literal("get_node_type_inventory"),
    result: sdkNodeTypeInventoryOutput
  })
]);

const sdkV1RpcErrorResponse = z.object({
  ...responseBase,
  command: sdkV1RpcCommand,
  error: sdkV1RpcError
});

export const sdkV1RpcResponse = z.union([
  sdkV1RpcSuccessResponse,
  sdkV1RpcErrorResponse
]);
export type SdkV1RpcResponse = z.infer<typeof sdkV1RpcResponse>;
