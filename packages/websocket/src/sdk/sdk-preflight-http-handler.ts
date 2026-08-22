import { sdkV1PreflightRequest } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1PreflightPrincipal } from "./sdk-preflight-orchestrator.js";
import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1HttpError
} from "./sdk-v1-service-error.js";

interface HandleSdkV1PreflightOptions {
  readonly boundary: SdkV1ImplementationBoundary;
  readonly getPrincipal: (
    request: Request
  ) => Promise<SdkV1PreflightPrincipal | null> | SdkV1PreflightPrincipal | null;
  readonly onInternalError?: (error: unknown) => void;
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

function serviceErrorResponse(
  error: unknown,
  options: HandleSdkV1PreflightOptions
): Response {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, options.onInternalError);
  const mapped = sdkV1HttpError(normalized);
  return jsonResponse(mapped.body, mapped.status);
}

export async function handleSdkV1Preflight(
  request: Request,
  options: HandleSdkV1PreflightOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  try {
    options.boundary.service.assertLifecycleAvailable();
  } catch (error) {
    return serviceErrorResponse(error, options);
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
    return jsonResponse(
      await options.boundary.handlers.preflightWorkflow({
        request: parsed.data,
        principal: await options.getPrincipal(request)
      })
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}
