import {
  sdkV1LifecycleRpcRequest,
  sdkV1LifecycleRpcResponse,
  type SdkV1LifecycleRpcResponse
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "../lib/wire-values.js";
import type { SdkV1PreflightPrincipal } from "./sdk-preflight-orchestrator.js";
import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1RpcError,
  type SdkV1RpcErrorBody
} from "./sdk-v1-service-error.js";

const SUPPORTED_COMMANDS = new Set(["get_capabilities", "preflight_workflow"]);

interface HandleSdkV1LifecycleRpcOptions {
  readonly boundary: SdkV1ImplementationBoundary;
  readonly getPrincipal: () =>
    | Promise<SdkV1PreflightPrincipal | null>
    | SdkV1PreflightPrincipal
    | null;
  readonly onInternalError?: (error: unknown) => void;
}

function rpcResponse(
  value: SdkV1LifecycleRpcResponse
): SdkV1LifecycleRpcResponse {
  return sdkV1LifecycleRpcResponse.parse(value);
}

function rpcError(
  requestId: string,
  command: "get_capabilities" | "preflight_workflow",
  error: SdkV1RpcErrorBody
): SdkV1LifecycleRpcResponse {
  return rpcResponse({
    type: "rpc_response",
    request_id: requestId,
    command,
    error
  });
}

function serviceErrorResponse(
  requestId: string,
  command: "get_capabilities" | "preflight_workflow",
  error: unknown,
  options: HandleSdkV1LifecycleRpcOptions
): SdkV1LifecycleRpcResponse {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, options.onInternalError);
  return rpcError(requestId, command, sdkV1RpcError(normalized));
}

export async function handleSdkV1LifecycleRpc(
  input: unknown,
  options: HandleSdkV1LifecycleRpcOptions
): Promise<SdkV1LifecycleRpcResponse | null> {
  if (!isObjectLike(input)) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const command = candidate.command;
  if (!isString(command) || !SUPPORTED_COMMANDS.has(command)) {
    return null;
  }

  const requestId = candidate.request_id;
  if (!isNonEmptyString(requestId)) {
    return null;
  }

  const ownedCommand = command as "get_capabilities" | "preflight_workflow";

  try {
    options.boundary.service.assertLifecycleAvailable();
  } catch (error) {
    return serviceErrorResponse(requestId, ownedCommand, error, options);
  }

  const parsed = sdkV1LifecycleRpcRequest.safeParse(input);
  if (!parsed.success) {
    return rpcError(requestId, ownedCommand, {
      code: "INVALID_REQUEST",
      message: "Invalid request",
      retryable: false
    });
  }
  if (
    parsed.data.command !== "get_capabilities" &&
    parsed.data.command !== "preflight_workflow"
  ) {
    return null;
  }

  if (parsed.data.command === "get_capabilities") {
    try {
      return rpcResponse({
        type: "rpc_response",
        request_id: parsed.data.request_id,
        command: parsed.data.command,
        result:
          await options.boundary.handlers["lifecycleRpc.get_capabilities"](
            undefined
          )
      });
    } catch (error) {
      return serviceErrorResponse(
        requestId,
        parsed.data.command,
        error,
        options
      );
    }
  }

  try {
    const result = await options.boundary.handlers[
      "lifecycleRpc.preflight_workflow"
    ]({
      request: parsed.data.data,
      principal: await options.getPrincipal()
    });
    return rpcResponse({
      type: "rpc_response",
      request_id: parsed.data.request_id,
      command: parsed.data.command,
      result
    });
  } catch (error) {
    return serviceErrorResponse(requestId, parsed.data.command, error, options);
  }
}
