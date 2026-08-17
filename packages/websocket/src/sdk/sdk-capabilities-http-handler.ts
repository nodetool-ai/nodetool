import type { SdkV1Capabilities } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { isSdkLifecycleV1Enabled } from "./sdk-feature-flags.js";

interface HandleSdkV1CapabilitiesOptions {
  getCapabilities: () => Promise<SdkV1Capabilities> | SdkV1Capabilities;
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

/**
 * Standalone HTTP adapter for the future capabilities route.
 *
 * Deliberately not imported by the current HTTP dispatcher. Keeping this leaf
 * handler isolated allows its contract and failure behavior to be verified
 * before the Phase 0 Electron/VL non-regression gate enables production
 * routing.
 */
export async function handleSdkV1Capabilities(
  request: Request,
  options: HandleSdkV1CapabilitiesOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  if (!isSdkLifecycleV1Enabled(options.environment)) {
    return errorResponse(
      503,
      "SDK_LIFECYCLE_DISABLED",
      "SDK lifecycle v1 is disabled"
    );
  }

  try {
    return jsonResponse(await options.getCapabilities());
  } catch (error) {
    try {
      options.onInternalError?.(error);
    } catch {
      // Error reporting must never replace the redacted public response.
    }
    return errorResponse(500, "INTERNAL_ERROR", "Internal server error", true);
  }
}
