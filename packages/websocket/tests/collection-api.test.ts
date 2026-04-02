import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, Workflow } from "@nodetool/models";
import { SqliteVecStore, resetDefaultStore } from "@nodetool/vectorstore";
import { handleCollectionRequest } from "../src/collection-api.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let dbPath: string;

describe("Collection API (sqlite-vec)", () => {
  beforeEach(async () => {
    // Use a fresh in-memory-like temp DB for each test
    dbPath = join(
      tmpdir(),
      `nt-vec-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.VECTORSTORE_DB_PATH = dbPath;
    resetDefaultStore();

    initTestDb();
  });

  afterEach(() => {
    resetDefaultStore();
    delete process.env.VECTORSTORE_DB_PATH;
    try {
      unlinkSync(dbPath);
    } catch {}
    try {
      unlinkSync(dbPath + "-wal");
    } catch {}
    try {
      unlinkSync(dbPath + "-shm");
    } catch {}
  });

  // ── List ─────────────────────────────────────────────────────────

  it("GET /api/collections returns empty array when no collections", async () => {
    const req = new Request("http://localhost/api/collections");
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as {
      collections: unknown[];
      count: number;
    };
    expect(body.collections).toEqual([]);
    expect(body.count).toBe(0);
  });

  // ── Create ───────────────────────────────────────────────────────

  it("POST /api/collections creates a new collection", async () => {
    const req = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "test-collection",
        embedding_model: "text-embedding-ada-002"
      })
    });
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.name).toBe("test-collection");
    expect(body.count).toBe(0);
    expect((body.metadata as Record<string, string>).embedding_model).toBe(
      "text-embedding-ada-002"
    );
  });

  it("POST /api/collections returns 400 for missing name", async () => {
    const req = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res!.status).toBe(400);
  });

  // ── Get ──────────────────────────────────────────────────────────

  it("GET /api/collections/:name returns collection details", async () => {
    // Create first
    const createReq = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "my-col" })
    });
    await handleCollectionRequest(createReq, "/api/collections", {});

    // Get
    const req = new Request("http://localhost/api/collections/my-col");
    const res = await handleCollectionRequest(
      req,
      "/api/collections/my-col",
      {}
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.name).toBe("my-col");
    expect(body.count).toBe(0);
  });

  // ── List with data ───────────────────────────────────────────────

  it("GET /api/collections returns created collections", async () => {
    // Create two collections
    for (const name of ["alpha", "beta"]) {
      const req = new Request("http://localhost/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      await handleCollectionRequest(req, "/api/collections", {});
    }

    const req = new Request("http://localhost/api/collections");
    const res = await handleCollectionRequest(req, "/api/collections", {});
    const body = (await jsonBody(res!)) as {
      collections: Array<Record<string, unknown>>;
      count: number;
    };
    expect(body.count).toBe(2);
    expect(body.collections.map((c) => c.name).sort()).toEqual([
      "alpha",
      "beta"
    ]);
  });

  it("GET /api/collections returns workflow_name when workflow exists", async () => {
    const wf = await Workflow.create({
      user_id: "user-1",
      name: "My Workflow",
      access: "private",
      graph: { nodes: [], edges: [] }
    });

    // Create collection with workflow metadata
    const createReq = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "wf-col" })
    });
    await handleCollectionRequest(createReq, "/api/collections", {});

    // Update collection metadata to include workflow reference
    const putReq = new Request("http://localhost/api/collections/wf-col", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metadata: { workflow: wf.id } })
    });
    await handleCollectionRequest(putReq, "/api/collections/wf-col", {});

    // List and verify workflow_name
    const req = new Request("http://localhost/api/collections");
    const res = await handleCollectionRequest(req, "/api/collections", {});
    const body = (await jsonBody(res!)) as {
      collections: Array<Record<string, unknown>>;
    };
    expect(body.collections[0].workflow_name).toBe("My Workflow");
  });

  // ── Update ───────────────────────────────────────────────────────

  it("PUT /api/collections/:name updates collection", async () => {
    // Create
    const createReq = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "original" })
    });
    await handleCollectionRequest(createReq, "/api/collections", {});

    // Update
    const req = new Request("http://localhost/api/collections/original", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "renamed", metadata: { foo: "bar" } })
    });
    const res = await handleCollectionRequest(
      req,
      "/api/collections/original",
      {}
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.name).toBe("renamed");
    expect((body.metadata as Record<string, unknown>).foo).toBe("bar");
  });

  // ── Delete ───────────────────────────────────────────────────────

  it("DELETE /api/collections/:name returns 200", async () => {
    // Create
    const createReq = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "to-delete" })
    });
    await handleCollectionRequest(createReq, "/api/collections", {});

    // Delete
    const req = new Request("http://localhost/api/collections/to-delete", {
      method: "DELETE"
    });
    const res = await handleCollectionRequest(
      req,
      "/api/collections/to-delete",
      {}
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.message).toContain("deleted successfully");

    // Verify it's gone
    const getReq = new Request("http://localhost/api/collections/to-delete");
    const getRes = await handleCollectionRequest(
      getReq,
      "/api/collections/to-delete",
      {}
    );
    expect(getRes!.status).toBe(404);
  });

  // ── Error cases ──────────────────────────────────────────────────

  it("returns 404 when collection not found", async () => {
    const req = new Request("http://localhost/api/collections/missing");
    const res = await handleCollectionRequest(
      req,
      "/api/collections/missing",
      {}
    );
    expect(res!.status).toBe(404);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.detail).toBe("Collection not found");
  });

  it("returns 405 for unsupported method on root", async () => {
    const req = new Request("http://localhost/api/collections", {
      method: "DELETE"
    });
    const res = await handleCollectionRequest(req, "/api/collections", {});
    expect(res!.status).toBe(405);
  });

  it("returns null for non-collection paths", async () => {
    const req = new Request("http://localhost/api/other");
    const res = await handleCollectionRequest(req, "/api/other", {});
    expect(res).toBeNull();
  });

  // ── File index ───────────────────────────────────────────────────

  it("POST /api/collections/:name/index indexes file into collection", async () => {
    // Create the collection first
    const createReq = new Request("http://localhost/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "index-col" })
    });
    await handleCollectionRequest(createReq, "/api/collections", {});

    const file = new File(["hello world"], "test.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request(
      "http://localhost/api/collections/index-col/index",
      {
        method: "POST",
        body: formData
      }
    );
    const res = await handleCollectionRequest(
      req,
      "/api/collections/index-col/index",
      {}
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as Record<string, unknown>;
    expect(body.path).toBe("test.txt");
    expect(body.chunks).toBe(1);
    expect(body.error).toBeNull();

    // Verify the document was actually added to the collection
    const getReq = new Request("http://localhost/api/collections/index-col");
    const getRes = await handleCollectionRequest(
      getReq,
      "/api/collections/index-col",
      {}
    );
    const getBody = (await jsonBody(getRes!)) as Record<string, unknown>;
    expect(getBody.count).toBe(1);
  });

  it("POST /api/collections/:name/index returns 400 without multipart", async () => {
    const req = new Request(
      "http://localhost/api/collections/test-collection/index",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }
    );
    const res = await handleCollectionRequest(
      req,
      "/api/collections/test-collection/index",
      {}
    );
    expect(res!.status).toBe(400);
  });

  // ── Trailing slash normalization ─────────────────────────────────

  it("handles trailing slash normalization", async () => {
    const req = new Request("http://localhost/api/collections/");
    const res = await handleCollectionRequest(req, "/api/collections/", {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});
