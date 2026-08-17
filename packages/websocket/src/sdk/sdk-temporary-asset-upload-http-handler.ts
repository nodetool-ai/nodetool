import { randomUUID } from "node:crypto";
import {
  sdkV1TemporaryAssetUpload,
  type SdkV1TemporaryAssetUpload
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { getMaxUploadBytes, type StorageAdapter } from "@nodetool-ai/storage";
import { getAssetFileName } from "../lib/asset-paths.js";
import { isSdkLifecycleV1Enabled } from "./sdk-feature-flags.js";

interface HandleSdkV1TemporaryAssetUploadOptions {
  storage: StorageAdapter;
  environment?: NodeJS.ProcessEnv;
  getConfiguredMaxUploadBytes?: () => number;
  createId?: () => string;
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
 * Stores one execution input directly in temporary storage.
 *
 * This deliberately creates no Asset row and no thumbnail. The returned URI
 * is consumed by the workflow runtime through its temporary storage adapter.
 * Retention is therefore controlled by the configured temporary store.
 */
export async function handleSdkV1TemporaryAssetUpload(
  request: Request,
  options: HandleSdkV1TemporaryAssetUploadOptions
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

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Expected multipart/form-data"
    );
  }

  const maxUploadBytes =
    options.getConfiguredMaxUploadBytes?.() ?? getMaxUploadBytes();

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

  if (file.size > maxUploadBytes) {
    return errorResponse(
      413,
      "UPLOAD_TOO_LARGE",
      `Upload exceeds the configured ${maxUploadBytes} byte limit`
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = file.type || "application/octet-stream";
    const id = (options.createId ?? randomUUID)();
    const key = `temp/sdk-inputs/${getAssetFileName(id, mediaType)}`;
    const storedUri = await options.storage.store(key, bytes, mediaType);
    const uri = storedUri.startsWith("file://")
      ? `/api/storage/${key}`
      : storedUri;
    const result: SdkV1TemporaryAssetUpload = {
      version: 1,
      uri,
      name: file.name || getAssetFileName(id, mediaType),
      content_type: mediaType,
      size: bytes.byteLength,
      expires_at: null
    };
    return jsonResponse(sdkV1TemporaryAssetUpload.parse(result));
  } catch (error) {
    try {
      options.onInternalError?.(error);
    } catch {
      // Error reporting must never replace the redacted public response.
    }
    return errorResponse(500, "INTERNAL_ERROR", "Internal server error", true);
  }
}
