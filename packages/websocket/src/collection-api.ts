/**
 * Collection API — REST handler for the multipart file-upload endpoint.
 *
 * `/api/collections/:name/index` stays on REST because tRPC's JSON link does
 * not handle `multipart/form-data` bodies. All CRUD + query endpoints have
 * moved to the tRPC `collections` router.
 */

import {
  getVecStore,
  VecNotFoundError,
  splitDocument
} from "@nodetool-ai/vectorstore";
import type { HttpApiOptions } from "./http-api.js";

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
  _options: HttpApiOptions
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

  try {
    const store = await getVecStore();
    const collectionName = decodeURIComponent(indexMatch[1]);
    const collection = await store.getCollection({ name: collectionName });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return errorResponse(400, "No file provided");
    }

    const text = await file.text();
    const chunks = splitDocument(text, file.name);

    if (chunks.length > 0) {
      await collection.add({
        ids: chunks.map((_, i) => `${file.name}#${i}`),
        documents: chunks.map((c) => c.text),
        metadatas: chunks.map((c) => ({
          source: c.source_id,
          start_index: String(c.start_index)
        }))
      });
    }

    return jsonResponse({
      path: file.name,
      chunks: chunks.length,
      error: null
    });
  } catch (err: unknown) {
    if (err instanceof VecNotFoundError) {
      return errorResponse(404, "Collection not found");
    }
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(500, `Vector store error: ${msg}`);
  }
}
