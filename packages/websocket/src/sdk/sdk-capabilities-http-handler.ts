import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1HttpError
} from "./sdk-v1-service-error.js";

interface HandleSdkV1CapabilitiesOptions {
  readonly boundary: SdkV1ImplementationBoundary;
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
  options: HandleSdkV1CapabilitiesOptions
): Response {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, options.onInternalError);
  const mapped = sdkV1HttpError(normalized);
  return jsonResponse(mapped.body, mapped.status);
}

export async function handleSdkV1Capabilities(
  request: Request,
  options: HandleSdkV1CapabilitiesOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  try {
    return jsonResponse(
      await options.boundary.handlers.getCapabilities(undefined)
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}
