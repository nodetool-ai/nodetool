import {
  sdkV1ModelDownloadCancelRequest,
  sdkV1ModelDownloadQuery,
  sdkV1ModelDownloadStartRequest
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1HttpError
} from "./sdk-v1-service-error.js";

interface HandleSdkV1ModelDownloadOptions {
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

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

async function parseJson(request: Request): Promise<JsonValue> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function serviceErrorResponse(
  error: unknown,
  options: HandleSdkV1ModelDownloadOptions
): Response {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, options.onInternalError);
  const mapped = sdkV1HttpError(normalized);
  return jsonResponse(mapped.body, mapped.status);
}

export async function handleSdkV1ModelDownloadStart(
  request: Request,
  options: HandleSdkV1ModelDownloadOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  const parsed = sdkV1ModelDownloadStartRequest.safeParse(
    await parseJson(request)
  );
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "Invalid model download request"
    );
  }
  try {
    return jsonResponse(
      await options.boundary.handlers.startModelDownload({
        userId: options.getUserId(request),
        request: parsed.data
      }),
      202
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}

export async function handleSdkV1ModelDownloads(
  request: Request,
  options: HandleSdkV1ModelDownloadOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  const parsed = sdkV1ModelDownloadQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return errorResponse(400, "INVALID_INPUT", "Invalid model download query");
  }
  try {
    return jsonResponse(
      await options.boundary.handlers.listModelDownloads({
        userId: options.getUserId(request),
        query: parsed.data
      })
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}

export async function handleSdkV1ModelDownloadCancel(
  request: Request,
  options: HandleSdkV1ModelDownloadOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  const parsed = sdkV1ModelDownloadCancelRequest.safeParse(
    await parseJson(request)
  );
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "Invalid model download cancellation request"
    );
  }
  try {
    return jsonResponse(
      await options.boundary.handlers.cancelModelDownload({
        userId: options.getUserId(request),
        operationId: parsed.data.operation_id
      })
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}
