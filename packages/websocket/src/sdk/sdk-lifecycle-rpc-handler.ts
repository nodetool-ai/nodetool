import {
  sdkV1LifecycleRpcRequest,
  sdkV1LifecycleRpcResponse,
  type SdkV1Capabilities,
  type SdkV1LifecycleRpcResponse,
  type SdkV1PreflightRequest,
  type SdkV1PreflightSummary
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { isSdkLifecycleV1Enabled } from "./sdk-feature-flags.js";
import {
  SdkV1PreflightServiceError,
  type SdkV1PreflightPrincipal
} from "./sdk-preflight-orchestrator.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "../lib/wire-values.js";

const SUPPORTED_COMMANDS = new Set([
  "get_capabilities",
  "preflight_workflow"
]);

interface HandleSdkV1LifecycleRpcOptions {
  getCapabilities: () => Promise<SdkV1Capabilities> | SdkV1Capabilities;
  preflightService: {
    preflight(input: {
      request: SdkV1PreflightRequest;
      principal: SdkV1PreflightPrincipal;
    }): Promise<SdkV1PreflightSummary>;
  };
  /**
   * Resolves the principal already authenticated for the WebSocket
   * connection. It must not read identity from command data.
   */
  getPrincipal: () =>
    | Promise<SdkV1PreflightPrincipal | null>
    | SdkV1PreflightPrincipal
    | null;
  environment?: NodeJS.ProcessEnv;
  onInternalError?: (error: unknown) => void;
}

function rpcResponse(
  value: SdkV1LifecycleRpcResponse
): SdkV1LifecycleRpcResponse {
  return sdkV1LifecycleRpcResponse.parse(value);
}

function rpcError(
  requestId: string,
  command: "get_capabilities" | "preflight_workflow",
  code: string,
  message: string,
  retryable = false
): SdkV1LifecycleRpcResponse {
  return rpcResponse({
    type: "rpc_response",
    request_id: requestId,
    command,
    error: { code, message, retryable }
  });
}

function reportInternalError(
  callback: ((error: unknown) => void) | undefined,
  error: unknown
): void {
  try {
    callback?.(error);
  } catch {
    // Diagnostics must not replace the redacted public response.
  }
}

/**
 * Standalone WebSocket adapter for the read-only SDK lifecycle commands.
 *
 * This adapter is also used by the production runner when the lifecycle
 * feature flag is enabled. A null result means the command belongs to a later
 * lifecycle phase or is not a lifecycle command.
 */
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

  const ownedCommand = command as
    | "get_capabilities"
    | "preflight_workflow";

  if (!isSdkLifecycleV1Enabled(options.environment)) {
    return rpcError(
      requestId,
      ownedCommand,
      "SDK_LIFECYCLE_DISABLED",
      "SDK lifecycle v1 is disabled"
    );
  }

  const parsed = sdkV1LifecycleRpcRequest.safeParse(input);
  if (!parsed.success) {
    return rpcError(
      requestId,
      ownedCommand,
      "INVALID_REQUEST",
      "Invalid request"
    );
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
        result: await options.getCapabilities()
      });
    } catch (error) {
      reportInternalError(options.onInternalError, error);
      return rpcError(
        requestId,
        parsed.data.command,
        "INTERNAL_ERROR",
        "Internal server error",
        true
      );
    }
  }

  try {
    const principal = await options.getPrincipal();
    if (!principal) {
      return rpcError(
        requestId,
        parsed.data.command,
        "AUTHENTICATION_REQUIRED",
        "Authentication required"
      );
    }

    const result: SdkV1PreflightSummary =
      await options.preflightService.preflight({
        request: parsed.data.data,
        principal
      });
    return rpcResponse({
      type: "rpc_response",
      request_id: parsed.data.request_id,
      command: parsed.data.command,
      result
    });
  } catch (error) {
    if (error instanceof SdkV1PreflightServiceError) {
      const message =
        error.code === "WORKFLOW_NOT_FOUND"
          ? "Workflow not found."
          : "Requested preflight level is not available.";
      return rpcError(
        requestId,
        parsed.data.command,
        error.code,
        message,
        error.retryable
      );
    }
    reportInternalError(options.onInternalError, error);
    return rpcError(
      requestId,
      parsed.data.command,
      "INTERNAL_ERROR",
      "Internal server error",
      true
    );
  }
}
