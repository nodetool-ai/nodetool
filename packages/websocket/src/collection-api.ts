/**
 * Collection API handler.
 *
 * Handles all /api/collections/* routes backed by sqlite-vec.
 */

import { Workflow } from "@nodetool/models";
import {
  getVecStore,
  VecNotFoundError,
  splitDocument
} from "@nodetool/vectorstore";
import type { HttpApiOptions } from "./http-api.js";

type JsonObject = Record<string, unknown>;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

interface CollectionCreateBody {
  name: string;
  embedding_model?: string;
  embedding_provider?: string;
}

interface CollectionModifyBody {
  name?: string;
  metadata?: Record<string, string>;
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export async function handleCollectionRequest(
  request: Request,
  pathname: string,
  _options: HttpApiOptions
): Promise<Response | null> {
  pathname = normalizePath(pathname);

  if (!pathname.startsWith("/api/collections")) return null;

  try {
    const store = await getVecStore();

    // POST /api/collections/:name/index
    const indexMatch = pathname.match(/^\/api\/collections\/([^/]+)\/index$/);
    if (indexMatch) {
      if (request.method !== "POST")
        return errorResponse(405, "Method not allowed");

      // Parse multipart form data for file upload
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("multipart/form-data")) {
        return errorResponse(400, "Expected multipart/form-data");
      }

      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return errorResponse(400, "No file provided");
      }

      const collectionName = decodeURIComponent(indexMatch[1]);
      const collection = await store.getCollection({ name: collectionName });

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
    }

    // GET /api/collections
    if (pathname === "/api/collections") {
      if (request.method === "GET") {
        const collections = await store.listCollections();
        const results: JsonObject[] = [];

        for (const col of collections) {
          const count = await col.count();
          const metadata = col.metadata ?? {};
          let workflowName: string | null = null;

          const workflowId = metadata.workflow as string | undefined;
          if (workflowId) {
            try {
              const workflow = (await Workflow.get(
                workflowId
              )) as Workflow | null;
              if (workflow) workflowName = workflow.name;
            } catch {
              // workflow not found
            }
          }

          results.push({
            name: col.name,
            count,
            metadata,
            workflow_name: workflowName
          });
        }

        return jsonResponse({ collections: results, count: results.length });
      }

      // POST /api/collections
      if (request.method === "POST") {
        const body = await parseJsonBody<CollectionCreateBody>(request);
        if (!body || typeof body.name !== "string") {
          return errorResponse(400, "Invalid JSON body: name is required");
        }

        const metadata: Record<string, string> = {};
        if (body.embedding_model)
          metadata.embedding_model = body.embedding_model;
        if (body.embedding_provider)
          metadata.embedding_provider = body.embedding_provider;

        const collection = await store.createCollection({
          name: body.name,
          metadata
        });

        return jsonResponse({
          name: collection.name,
          metadata: collection.metadata,
          count: 0
        });
      }

      return errorResponse(405, "Method not allowed");
    }

    // Routes with /:name
    const nameMatch = pathname.match(/^\/api\/collections\/([^/]+)$/);
    if (!nameMatch) return null;
    const name = decodeURIComponent(nameMatch[1]);

    // GET /api/collections/:name
    if (request.method === "GET") {
      const collection = await store.getCollection({ name });
      const count = await collection.count();
      return jsonResponse({
        name: collection.name,
        metadata: collection.metadata,
        count
      });
    }

    // PUT /api/collections/:name
    if (request.method === "PUT") {
      const collection = await store.getCollection({ name });
      const body = await parseJsonBody<CollectionModifyBody>(request);
      if (!body) return errorResponse(400, "Invalid JSON body");

      const metadata = { ...(collection.metadata ?? {}) };
      if (body.metadata) Object.assign(metadata, body.metadata);

      const newName = body.name ?? collection.name;
      await collection.modify({ name: newName, metadata });

      const count = await collection.count();
      return jsonResponse({
        name: newName,
        metadata,
        count
      });
    }

    // DELETE /api/collections/:name
    if (request.method === "DELETE") {
      await store.deleteCollection({ name });
      return jsonResponse({
        message: `Collection ${name} deleted successfully`
      });
    }

    return errorResponse(405, "Method not allowed");
  } catch (err: unknown) {
    if (err instanceof VecNotFoundError) {
      return errorResponse(404, "Collection not found");
    }
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(500, `Vector store error: ${msg}`);
  }
}
