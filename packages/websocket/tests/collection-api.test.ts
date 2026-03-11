import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Workflow,
} from "@nodetool/models";

// Mock chromadb before importing the handler
const mockCollection = {
  name: "test-collection",
  metadata: { embedding_model: "text-embedding-ada-002" },
  configuration: {},
  count: vi.fn().mockResolvedValue(42),
  modify: vi.fn().mockResolvedValue(undefined),
};

const mockClient = {
  listCollections: vi.fn().mockResolvedValue([]),
  createCollection: vi.fn().mockResolvedValue(mockCollection),
  getCollection: vi.fn().mockResolvedValue(mockCollection),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
};

vi.mock("chromadb", () => ({
  ChromaClient: vi.fn().mockImplementation(() => mockClient),
  ChromaNotFoundError: class ChromaNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ChromaNotFoundError";
    }
  },
}));

// Import after mock setup
const { handleCollectionRequest } = await import("../src/collection-api.js");
const { ChromaNotFoundError } = await import("chromadb");

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("Collection API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
    mockClient.listCollections.mockResolvedValue([]);
    mockClient.createCollection.mockResolvedValue(mockCollection);
    mockClient.getCollection.mockResolvedValue(mockCollection);
    mockClient.deleteCollection.mockResolvedValue(undefined);
    mockCollection.count.mockResolvedValue(42);
  });

  it("GET /api/collections returns empty array", async () => {
    const req = new Request("http://localhost/api/collections");
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as { collections: unknown[]; count: number };
    expect(body.collections).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("GET /api/collections returns collections with workflow_name", async () => {
    const wf = await Workflow.create({
      user_id: "user-1",
      name: "My Workflow",
      access: "private",
      graph: { nodes: [], edges: [] },
    });

    const colWithWorkflow = {
      ...mockCollection,
      name: "wf-col",
      metadata: { workflow: wf.id },
    };
    mockClient.listCollections.mockResolvedValue([colWithWorkflow]);

    const req = new Request("http://localhost/api/collections");
    const res = await handleCollectionRequest(req, "/api/collections", {});
    const body = (await jsonBody(res!)) as { collections: Array<Record<string, unknown>> };
    expect(body.collections[0].workflow_name).toBe("My Workflow");
  });

  it("POST /api/collections creates a new collection", async () => {
    const req = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "test-collection",
        embedding_model: "text-embedding-ada-002",
      }),
    });
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.name).toBe("test-collection");
    expect(body.count).toBe(0);
    expect(mockClient.createCollection).toHaveBeenCalledWith({
      name: "test-collection",
      metadata: { embedding_model: "text-embedding-ada-002" },
      embeddingFunction: null,
    });
  });

  it("POST /api/collections returns 400 for missing name", async () => {
    const req = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res!.status).toBe(400);
  });

  it("GET /api/collections/:name returns collection details", async () => {
    const req = new Request("http://localhost/api/collections/test-collection");
    const res = await handleCollectionRequest(
      req,
      "/api/collections/test-collection",
      {},
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.name).toBe("test-collection");
    expect(body.count).toBe(42);
  });

  it("PUT /api/collections/:name updates collection", async () => {
    const req = new Request("http://localhost/api/collections/test-collection", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "renamed", metadata: { foo: "bar" } }),
    });
    const res = await handleCollectionRequest(
      req,
      "/api/collections/test-collection",
      {},
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.name).toBe("renamed");
    expect(mockCollection.modify).toHaveBeenCalled();
  });

  it("DELETE /api/collections/:name returns 200", async () => {
    const req = new Request("http://localhost/api/collections/test-collection", {
      method: "DELETE",
    });
    const res = await handleCollectionRequest(
      req,
      "/api/collections/test-collection",
      {},
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.message).toContain("deleted successfully");
  });

  it("returns 404 when collection not found", async () => {
    mockClient.getCollection.mockRejectedValue(
      new ChromaNotFoundError("not found"),
    );
    const req = new Request("http://localhost/api/collections/missing");
    const res = await handleCollectionRequest(
      req,
      "/api/collections/missing",
      {},
    );
    expect(res!.status).toBe(404);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.detail).toBe("Collection not found");
  });

  it("returns 405 for unsupported method on root", async () => {
    const req = new Request("http://localhost/api/collections", {
      method: "DELETE",
    });
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res!.status).toBe(405);
  });

  it("returns null for non-collection paths", async () => {
    const req = new Request("http://localhost/api/other");
    const res = await handleCollectionRequest(req, "/api/other", {});
    expect(res).toBeNull();
  });

  it("POST /api/collections/:name/index returns stub response", async () => {
    const file = new File(["hello world"], "test.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/collections/test-collection/index", {
      method: "POST",
      body: formData,
    });
    const res = await handleCollectionRequest(
      req,
      "/api/collections/test-collection/index",
      {},
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.path).toBe("test.txt");
    expect(body.error).toBeNull();
  });

  it("POST /api/collections/:name/index returns 400 without multipart", async () => {
    const req = new Request("http://localhost/api/collections/test-collection/index", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handleCollectionRequest(
      req,
      "/api/collections/test-collection/index",
      {},
    );
    expect(res!.status).toBe(400);
  });
});
