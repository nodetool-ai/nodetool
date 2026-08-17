import {
  sdkV1ModelCatalogQuery,
  type SdkV1ModelCatalog,
  type SdkV1ModelCatalogQuery
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import { SdkModelCatalogServiceError } from "./sdk-model-catalog-service.js";

export interface SdkV1ModelCatalogHttpService {
  list(args: {
    userId: string;
    query: SdkV1ModelCatalogQuery;
  }): Promise<SdkV1ModelCatalog> | SdkV1ModelCatalog;
}

interface HandleSdkV1ModelCatalogOptions {
  service: SdkV1ModelCatalogHttpService;
  getUserId: (request: Request) => string;
  onInternalError?: (error: unknown) => void;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(
    { code, message, detail: message, retryable: status >= 500 },
    status
  );
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
      await options.service.list({
        userId: options.getUserId(request),
        query: parsed.data
      })
    );
  } catch (error) {
    if (error instanceof SdkModelCatalogServiceError) {
      return errorResponse(501, "MODEL_SCOPE_UNAVAILABLE", error.message);
    }
    try {
      options.onInternalError?.(error);
    } catch {
      // Error reporting must not replace the redacted public response.
    }
    return errorResponse(500, "INTERNAL_ERROR", "Internal server error");
  }
}
