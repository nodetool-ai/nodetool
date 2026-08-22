import { sdkV1ModelCatalogQuery } from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1HttpError
} from "./sdk-v1-service-error.js";

interface HandleSdkV1ModelCatalogOptions {
  readonly boundary: SdkV1ImplementationBoundary;
  readonly getUserId: (request: Request) => string;
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
  message: string
): Response {
  return jsonResponse(
    { code, message, detail: message, retryable: status >= 500 },
    status
  );
}

function serviceErrorResponse(
  error: unknown,
  options: HandleSdkV1ModelCatalogOptions
): Response {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, options.onInternalError);
  const mapped = sdkV1HttpError(normalized);
  return jsonResponse(mapped.body, mapped.status);
}

function rawQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export async function handleSdkV1ModelCatalog(
  request: Request,
  options: HandleSdkV1ModelCatalogOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const parsed = sdkV1ModelCatalogQuery.safeParse(rawQuery(request));
  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Invalid model catalog query");
  }

  try {
    return jsonResponse(
      await options.boundary.handlers.listModels({
        userId: options.getUserId(request),
        query: parsed.data
      })
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}
