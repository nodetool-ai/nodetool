import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  getSdkV1SafeErrorMessage,
  isSdkV1RetryableError,
  sdkV1RpcRequest,
  sdkV1RpcResponse,
  type SdkV1RpcCommand,
  type SdkV1RpcError,
  type SdkV1RpcResponse
} from "@nodetool-ai/protocol/api-schemas/sdk-v1.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "../lib/wire-values.js";
import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  type SdkV1ServiceError
} from "./sdk-v1-service-error.js";

const SUPPORTED_COMMANDS = new Set<SdkV1RpcCommand>([
  "list_workflow_summaries",
  "get_workflow_interface",
  "get_workflow_interfaces",
  "get_node_type_inventory"
]);

interface HandleSdkV1DiscoveryRpcOptions {
  readonly boundary: SdkV1ImplementationBoundary;
  readonly userId: string | null;
  readonly registry: NodeRegistry;
  readonly pythonBridgeReady: boolean;
  readonly onInternalError?: (error: unknown) => void;
}

type RpcError = SdkV1RpcError;

function response(value: unknown): SdkV1RpcResponse {
  return sdkV1RpcResponse.parse(value);
}

function errorResponse(
  requestId: string,
  command: SdkV1RpcCommand,
  error: RpcError
): SdkV1RpcResponse {
  return response({
    type: "rpc_response",
    request_id: requestId,
    command,
    error
  });
}

function validationError(
  requestId: string,
  command: SdkV1RpcCommand
): SdkV1RpcResponse {
  return errorResponse(requestId, command, {
    code: "BAD_REQUEST",
    message: "Invalid request",
    retryable: false,
    apiCode: null,
    trpcCode: "BAD_REQUEST"
  });
}

function legacyServiceError(error: SdkV1ServiceError): RpcError {
  let code: string;
  let apiCode: string | null;
  let trpcCode: string;

  switch (error.category) {
    case "authentication-required":
      code = "UNAUTHORIZED";
      apiCode = null;
      trpcCode = "UNAUTHORIZED";
      break;
    case "not-found":
      code = error.code === "WORKFLOW_NOT_FOUND" ? error.code : "NOT_FOUND";
      apiCode = code;
      trpcCode = "NOT_FOUND";
      break;
    case "invalid-resource":
      code = "INVALID_INPUT";
      apiCode = code;
      trpcCode = "BAD_REQUEST";
      break;
    case "unavailable":
    case "not-implemented":
      code = "SERVICE_UNAVAILABLE";
      apiCode = code;
      trpcCode = "INTERNAL_SERVER_ERROR";
      break;
    case "payload-too-large":
      code = "BAD_REQUEST";
      apiCode = null;
      trpcCode = "BAD_REQUEST";
      break;
    case "internal":
      code = "INTERNAL_SERVER_ERROR";
      apiCode = null;
      trpcCode = "INTERNAL_SERVER_ERROR";
      break;
  }

  return {
    code,
    message: getSdkV1SafeErrorMessage(code, error.publicMessage),
    retryable: isSdkV1RetryableError(code, error.publicMessage),
    apiCode,
    trpcCode
  };
}

/** Handles the four implemented read-only SDK commands without a tRPC hop. */
export async function handleSdkV1DiscoveryRpc(
  input: unknown,
  options: HandleSdkV1DiscoveryRpcOptions
): Promise<SdkV1RpcResponse | null> {
  if (!isObjectLike(input)) {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  const command = candidate.command;
  if (
    !isString(command) ||
    !SUPPORTED_COMMANDS.has(command as SdkV1RpcCommand)
  ) {
    return null;
  }
  const ownedCommand = command as SdkV1RpcCommand;
  const requestId = candidate.request_id;
  if (!isNonEmptyString(requestId)) {
    return null;
  }

  if (!options.userId) {
    return errorResponse(requestId, ownedCommand, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      retryable: false,
      apiCode: null,
      trpcCode: "UNAUTHORIZED"
    });
  }

  const parsed = sdkV1RpcRequest.safeParse(input);
  if (!parsed.success) {
    return validationError(requestId, ownedCommand);
  }

  try {
    let result: unknown;
    switch (parsed.data.command) {
      case "list_workflow_summaries":
        result = await options.boundary.handlers[
          "sdkRpc.list_workflow_summaries"
        ]({
          userId: options.userId,
          request: parsed.data.data,
          registryRevision: Number.isSafeInteger(options.registry.revision)
            ? options.registry.revision
            : null
        });
        break;
      case "get_workflow_interface":
        result = await options.boundary.handlers[
          "sdkRpc.get_workflow_interface"
        ]({
          userId: options.userId,
          workflowId: parsed.data.data.id,
          registry: options.registry
        });
        break;
      case "get_workflow_interfaces":
        result = await options.boundary.handlers[
          "sdkRpc.get_workflow_interfaces"
        ]({
          userId: options.userId,
          request: parsed.data.data,
          registry: options.registry
        });
        break;
      case "get_node_type_inventory":
        result = await options.boundary.handlers[
          "sdkRpc.get_node_type_inventory"
        ]({
          request: parsed.data.data,
          registry: options.registry,
          pythonBridgeReady: options.pythonBridgeReady
        });
        break;
    }
    return response({
      type: "rpc_response",
      request_id: parsed.data.request_id,
      command: parsed.data.command,
      result
    });
  } catch (error) {
    const normalized = normalizeSdkV1ServiceError(error);
    reportSdkV1InternalError(normalized, options.onInternalError);
    return errorResponse(
      requestId,
      ownedCommand,
      legacyServiceError(normalized)
    );
  }
}
