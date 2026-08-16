import {
  sdkV1ModelDownloadCancelRequest,
  sdkV1ModelDownloadQuery,
  sdkV1ModelDownloadStartRequest
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import {
  SdkModelDownloadServiceError,
  type SdkV1ModelDownloadService
} from "./sdk-model-download-service.js";

export interface HandleSdkV1ModelDownloadOptions {
  service: SdkV1ModelDownloadService;
  getUserId: (request: Request) => string;
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
  message: string
): Response {
  return jsonResponse(
    { code, message, detail: message, retryable: status >= 500 },
    status
  );
}

/** A decoded JSON request body, before a schema validates its shape. */
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

function serviceError(error: unknown): Response | null {
  return error instanceof SdkModelDownloadServiceError
    ? errorResponse(error.statusCode, error.code, error.message)
    : null;
}

function reportInternalError(
  error: unknown,
  options: HandleSdkV1ModelDownloadOptions
): Response {
  try {
    options.onInternalError?.(error);
  } catch {
    // Error reporting must not replace the redacted public response.
  }
  return errorResponse(500, "INTERNAL_ERROR", "Internal server error");
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
      options.service.start({
        userId: options.getUserId(request),
        request: parsed.data
      }),
      202
    );
  } catch (error) {
    return serviceError(error) ?? reportInternalError(error, options);
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
      options.service.list({
        userId: options.getUserId(request),
        query: parsed.data
      })
    );
  } catch (error) {
    return serviceError(error) ?? reportInternalError(error, options);
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
      options.service.cancel({
        userId: options.getUserId(request),
        operationId: parsed.data.operation_id
      })
    );
  } catch (error) {
    return serviceError(error) ?? reportInternalError(error, options);
  }
}
