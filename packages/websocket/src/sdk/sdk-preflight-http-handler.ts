import {
  sdkV1PreflightRequest,
  type SdkV1PreflightRequest,
  type SdkV1PreflightSummary
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { isSdkLifecycleV1Enabled } from "./sdk-feature-flags.js";
import {
  SdkV1PreflightServiceError,
  type SdkV1PreflightPrincipal
} from "./sdk-preflight-orchestrator.js";

export interface SdkV1PreflightHttpService {
  preflight(input: {
    request: SdkV1PreflightRequest;
    principal: SdkV1PreflightPrincipal;
  }): Promise<SdkV1PreflightSummary>;
}

interface HandleSdkV1PreflightOptions {
  service: SdkV1PreflightHttpService;
  /**
   * Resolves only the server-authenticated principal. Implementations must not
   * trust an x-user-id value supplied directly by a remote caller.
   */
  getPrincipal: (
    request: Request
  ) => Promise<SdkV1PreflightPrincipal | null> | SdkV1PreflightPrincipal | null;
  environment?: NodeJS.ProcessEnv;
  onInternalError?: (error: unknown) => void;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false
): Response {
  return jsonResponse(
    {
      code,
      message,
      retryable,
      detail: message
    },
    status
  );
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
 * Standalone HTTP adapter for side-effect-free SDK workflow preflight.
 *
 * This leaf handler is intentionally absent from the production dispatcher
 * until the Phase 0 Electron/VL gate permits lifecycle routes to be added.
 */
export async function handleSdkV1Preflight(
  request: Request,
  options: HandleSdkV1PreflightOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  if (!isSdkLifecycleV1Enabled(options.environment)) {
    return errorResponse(
      503,
      "SDK_LIFECYCLE_DISABLED",
      "SDK lifecycle v1 is disabled"
    );
  }
  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/json")
  ) {
    return errorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json"
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Invalid preflight request");
  }
  const parsed = sdkV1PreflightRequest.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_REQUEST", "Invalid preflight request");
  }

  try {
    const principal = await options.getPrincipal(request);
    if (!principal) {
      return errorResponse(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required"
      );
    }
    return jsonResponse(
      await options.service.preflight({
        request: parsed.data,
        principal
      })
    );
  } catch (error) {
    if (error instanceof SdkV1PreflightServiceError) {
      const status = error.code === "WORKFLOW_NOT_FOUND" ? 404 : 503;
      const message =
        error.code === "WORKFLOW_NOT_FOUND"
          ? "Workflow not found."
          : "Requested preflight level is not available.";
      return errorResponse(status, error.code, message, error.retryable);
    }
    reportInternalError(options.onInternalError, error);
    return errorResponse(500, "INTERNAL_ERROR", "Internal server error", true);
  }
}
