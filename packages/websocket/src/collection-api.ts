/**
 * Collection API — REST handler for the multipart file-upload endpoint.
 *
 * `/api/collections/:name/index` stays on REST because tRPC's JSON link does
 * not handle `multipart/form-data` bodies. All CRUD + query endpoints have
 * moved to the tRPC `collections` router.
 */

import { createLogger } from "@nodetool-ai/config";
import { getMaxUploadBytes } from "@nodetool-ai/storage";
import {
  getDefaultVectorProvider,
  CollectionNotFoundError,
  splitDocument
} from "@nodetool-ai/vectorstore";
import { getUserId, type HttpApiOptions } from "./http-api.js";
import { notifyResourceChange } from "./resource-events.js";
import { canAccessCollection } from "@nodetool-ai/vectorstore";

const log = createLogger("nodetool.websocket.collection-api");

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/**
 * Handle POST /api/collections/:name/index (multipart/form-data file upload).
 * Returns `null` for any non-matching path so callers can fall through.
 */
export async function handleCollectionRequest(
  request: Request,
  pathname: string,
  options: HttpApiOptions
): Promise<Response | null> {
  pathname = normalizePath(pathname);

  const indexMatch = pathname.match(/^\/api\/collections\/([^/]+)\/index$/);
  if (!indexMatch) return null;

  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return errorResponse(400, "Expected multipart/form-data");
  }

  const collectionName = decodeURIComponent(indexMatch[1]);
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  try {
    const provider = getDefaultVectorProvider();
    const collection = await provider.getCollection({ name: collectionName });

    // Same ownership rule the tRPC router enforces, and the same 404-not-403
    // response for someone else's collection so this endpoint can't be used to
    // probe for names. See @nodetool-ai/vectorstore collection-access.ts.
    if (
      !canAccessCollection(
        collection.metadata as Record<string, string | number | boolean>,
        userId
      )
    ) {
      return errorResponse(404, "Collection not found");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return errorResponse(400, "No file provided");
    }

    // The whole file is read into a string and chunked in memory, so cap it at
    // the same limit storage uploads use rather than relying on Fastify's
    // 100 MB body limit.
    const max = getMaxUploadBytes();
    if (file.size > max) {
      return errorResponse(
        413,
        `Upload exceeds maximum size: ${file.size} > ${max} bytes ` +
          `(set NODETOOL_MAX_UPLOAD_BYTES to raise the limit)`
      );
    }

    const text = await file.text();
    const chunks = splitDocument(text, file.name);

    if (chunks.length > 0) {
      await collection.upsert(
        chunks.map((c, i) => ({
          id: `${file.name}#${i}`,
          document: c.text,
          metadata: {
            source: c.source_id,
            start_index: String(c.start_index)
          }
        }))
      );
      notifyResourceChange({
        event: "updated",
        resource_type: "collection",
        resource: { id: collectionName }
      });
    }

    return jsonResponse({
      path: file.name,
      chunks: chunks.length,
      error: null
    });
  } catch (err: unknown) {
    if (err instanceof CollectionNotFoundError) {
      return errorResponse(404, "Collection not found");
    }
    // Log the detail, return a generic message: provider errors carry SQL
    // text, file paths, and upstream URLs that shouldn't reach the client.
    log.error("Collection index failed", {
      collection: collectionName,
      error: err instanceof Error ? err.message : String(err)
    });
    return errorResponse(500, "Vector store error");
  }
}
