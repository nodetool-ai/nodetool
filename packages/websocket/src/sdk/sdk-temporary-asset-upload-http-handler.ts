import { getMaxUploadBytes } from "@nodetool-ai/storage";
import type { SdkV1ImplementationBoundary } from "./sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1HttpError
} from "./sdk-v1-service-error.js";

interface HandleSdkV1TemporaryAssetUploadOptions {
  readonly boundary: SdkV1ImplementationBoundary;
  readonly getConfiguredMaxUploadBytes?: () => number;
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
  options: HandleSdkV1TemporaryAssetUploadOptions
): Response {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, options.onInternalError);
  const mapped = sdkV1HttpError(normalized);
  return jsonResponse(mapped.body, mapped.status);
}

export async function handleSdkV1TemporaryAssetUpload(
  request: Request,
  options: HandleSdkV1TemporaryAssetUploadOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  try {
    options.boundary.service.assertLifecycleAvailable();
  } catch (error) {
    return serviceErrorResponse(error, options);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Expected multipart/form-data"
    );
  }

  let file: File;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (!(value instanceof File)) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Multipart field 'file' is required"
      );
    }
    file = value;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Invalid multipart form data");
  }

  const maxUploadBytes =
    options.getConfiguredMaxUploadBytes?.() ?? getMaxUploadBytes();
  if (file.size > maxUploadBytes) {
    return errorResponse(
      413,
      "UPLOAD_TOO_LARGE",
      `Upload exceeds the configured ${maxUploadBytes} byte limit`
    );
  }

  try {
    return jsonResponse(
      await options.boundary.handlers.uploadTemporaryAsset({
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
        name: file.name
      })
    );
  } catch (error) {
    return serviceErrorResponse(error, options);
  }
}
