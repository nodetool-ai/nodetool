import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdminHTTPClient } from "../src/admin-client.js";

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

function sseResponse(lines: string[]): Response {
  const text = lines.join("\n");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

function bytesResponse(data: Uint8Array): Response {
  return new Response(data, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream" }
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("AdminHTTPClient", () => {
  let client: AdminHTTPClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AdminHTTPClient({
      baseUrl: "http://localhost:8000",
      authToken: "test-token"
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────

  it("strips trailing slashes from baseUrl", () => {
    const c = new AdminHTTPClient({ baseUrl: "http://host:3000///" });
    expect(c.baseUrl).toBe("http://host:3000");
  });

  it("sets Authorization header when authToken is provided", () => {
    expect(client.headers["Authorization"]).toBe("Bearer test-token");
  });

  it("omits Authorization header when authToken is not provided", () => {
    const c = new AdminHTTPClient({ baseUrl: "http://host" });
    expect(c.headers["Authorization"]).toBeUndefined();
  });

  it("always sets Content-Type and Accept headers", () => {
    expect(client.headers["Content-Type"]).toBe("application/json");
    expect(client.headers["Accept"]).toBe(
      "application/json, text/event-stream"
    );
  });

  // ── healthCheck ──────────────────────────────────────────

  it("healthCheck sends GET /admin/health", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    const result = await client.healthCheck();
    expect(result).toEqual({ status: "ok" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/admin/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("healthCheck throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("server down", 500));
    await expect(client.healthCheck()).rejects.toThrow(
      "GET /admin/health failed: 500"
    );
  });

  // ── Workflow CRUD ────────────────────────────────────────

  it("listWorkflows sends GET /api/workflows/", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ workflows: [] }));
    const result = await client.listWorkflows();
    expect(result).toEqual({ workflows: [] });
  });

  it("updateWorkflow sends PUT with body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "w1" }));
    await client.updateWorkflow("w1", { name: "test" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/api/workflows/w1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "test" })
      })
    );
  });

  it("deleteWorkflow sends DELETE", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    const result = await client.deleteWorkflow("w1");
    expect(result).toEqual({ deleted: true });
  });

  it("runWorkflow sends POST with params", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ job_id: "j1" }));
    await client.runWorkflow("w1", { key: "value" });
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("http://localhost:8000/api/workflows/w1/run");
    expect(JSON.parse(call[1].body)).toEqual({ params: { key: "value" } });
  });

  it("runWorkflow defaults params to empty object", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ job_id: "j1" }));
    await client.runWorkflow("w1");
    const call = fetchSpy.mock.calls[0];
    expect(JSON.parse(call[1].body)).toEqual({ params: {} });
  });

  // ── Assets ───────────────────────────────────────────────

  it("getAsset sends GET with user_id param", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "a1" }));
    await client.getAsset("a1", "42");
    expect(fetchSpy.mock.calls[0][0]).toContain("/admin/assets/a1?user_id=42");
  });

  it("getAsset defaults userId to '1'", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "a1" }));
    await client.getAsset("a1");
    expect(fetchSpy.mock.calls[0][0]).toContain("user_id=1");
  });

  it("createAsset sends POST with body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "new" }));
    await client.createAsset({
      name: "file.txt",
      contentType: "text/plain",
      parentId: "p1",
      workflowId: "wf1",
      metadata: { foo: "bar" }
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.name).toBe("file.txt");
    expect(body.content_type).toBe("text/plain");
    expect(body.parent_id).toBe("p1");
    expect(body.workflow_id).toBe("wf1");
    expect(body.metadata).toEqual({ foo: "bar" });
  });

  it("createAsset omits optional fields when not provided", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "new" }));
    await client.createAsset({});
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.parent_id).toBeUndefined();
    expect(body.workflow_id).toBeUndefined();
    expect(body.metadata).toBeUndefined();
  });

  it("uploadAssetFile sends PUT with raw body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const data = new Uint8Array([1, 2, 3]);
    await client.uploadAssetFile("test.bin", data);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("http://localhost:8000/admin/storage/assets/test.bin");
    expect(call[1].method).toBe("PUT");
    // Content-Type should be removed for raw body
    expect(call[1].headers["Content-Type"]).toBeUndefined();
  });

  it("uploadAssetFile throws on error", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("disk full", 507));
    await expect(
      client.uploadAssetFile("f.bin", new Uint8Array([1]))
    ).rejects.toThrow("507");
  });

  it("downloadAssetFile sends GET and returns bytes", async () => {
    const data = new Uint8Array([10, 20, 30]);
    fetchSpy.mockResolvedValueOnce(bytesResponse(data));
    const result = await client.downloadAssetFile("test.bin");
    expect(result).toEqual(data);
  });

  it("downloadAssetFile throws on error", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("not found", 404));
    await expect(client.downloadAssetFile("missing.bin")).rejects.toThrow(
      "404"
    );
  });

  // ── Database ─────────────────────────────────────────────

  it("dbGet sends GET /admin/db/:table/:key", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "k1" }));
    const result = await client.dbGet("users", "k1");
    expect(result).toEqual({ id: "k1" });
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "http://localhost:8000/admin/db/users/k1"
    );
  });

  it("dbSave sends POST /admin/db/:table/save", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await client.dbSave("users", { id: "k1", name: "test" });
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("http://localhost:8000/admin/db/users/save");
    expect(JSON.parse(call[1].body)).toEqual({ id: "k1", name: "test" });
  });

  it("dbDelete sends DELETE /admin/db/:table/:key", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await client.dbDelete("users", "k1");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "http://localhost:8000/admin/db/users/k1"
    );
  });

  // ── Secrets ──────────────────────────────────────────────

  it("importSecrets sends POST with secrets array", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ imported: 2 }));
    await client.importSecrets([{ key: "A", value: "1" }]);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("http://localhost:8000/admin/secrets/import");
    expect(JSON.parse(call[1].body)).toEqual([{ key: "A", value: "1" }]);
  });

  // ── Model Downloads (SSE streaming) ──────────────────────

  it("downloadHuggingfaceModel yields parsed SSE data", async () => {
    const sse = sseResponse([
      'data: {"status":"starting"}\n',
      'data: {"status":"completed"}\n',
      "data: [DONE]\n"
    ]);
    fetchSpy.mockResolvedValueOnce(sse);
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.downloadHuggingfaceModel({
      repoId: "org/model"
    })) {
      results.push(chunk);
    }
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ status: "starting" });
    expect(results[1]).toEqual({ status: "completed" });
  });

  it("downloadHuggingfaceModel sends correct body fields", async () => {
    const sse = sseResponse(["data: [DONE]\n"]);
    fetchSpy.mockResolvedValueOnce(sse);
    const gen = client.downloadHuggingfaceModel({
      repoId: "org/model",
      cacheDir: "/tmp/cache",
      filePath: "model.bin",
      ignorePatterns: ["*.md"],
      allowPatterns: ["*.bin"]
    });
    for await (const _ of gen) {
      // consume
    }
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.repo_id).toBe("org/model");
    expect(body.cache_dir).toBe("/tmp/cache");
    expect(body.file_path).toBe("model.bin");
    expect(body.ignore_patterns).toEqual(["*.md"]);
    expect(body.allow_patterns).toEqual(["*.bin"]);
    expect(body.stream).toBe(true);
  });

  it("downloadHuggingfaceModel throws on HTTP error", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("forbidden", 403));
    const gen = client.downloadHuggingfaceModel({ repoId: "org/model" });
    await expect(gen.next()).rejects.toThrow("403");
  });

  it("downloadOllamaModel yields parsed SSE data", async () => {
    const sse = sseResponse([
      'data: {"status":"pulling"}\n',
      'data: {"status":"done"}\n',
      "data: [DONE]\n"
    ]);
    fetchSpy.mockResolvedValueOnce(sse);
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.downloadOllamaModel("llama3")) {
      results.push(chunk);
    }
    expect(results).toHaveLength(2);
  });

  it("downloadOllamaModel sends model_name and stream in body", async () => {
    const sse = sseResponse(["data: [DONE]\n"]);
    fetchSpy.mockResolvedValueOnce(sse);
    for await (const _ of client.downloadOllamaModel("llama3")) {
      // consume
    }
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.model_name).toBe("llama3");
    expect(body.stream).toBe(true);
  });

  // ── SSE edge cases ───────────────────────────────────────

  it("SSE parser skips malformed JSON lines", async () => {
    const sse = sseResponse([
      "data: NOT_JSON\n",
      'data: {"ok":true}\n',
      "data: [DONE]\n"
    ]);
    fetchSpy.mockResolvedValueOnce(sse);
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.downloadOllamaModel("x")) {
      results.push(chunk);
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("SSE parser ignores non-data lines", async () => {
    const sse = sseResponse([
      ": comment\n",
      "event: update\n",
      'data: {"a":1}\n',
      "data: [DONE]\n"
    ]);
    fetchSpy.mockResolvedValueOnce(sse);
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.downloadOllamaModel("x")) {
      results.push(chunk);
    }
    expect(results).toHaveLength(1);
  });

  it("SSE parser handles empty response body", async () => {
    // Response with no body reader
    const response = new Response(null, { status: 200 });
    fetchSpy.mockResolvedValueOnce(response);
    const gen = client.downloadOllamaModel("x");
    await expect(gen.next()).rejects.toThrow("not readable");
  });

  // ── Cache ────────────────────────────────────────────────

  it("scanCache sends GET /admin/cache/scan", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ repos: [] }));
    const result = await client.scanCache();
    expect(result).toEqual({ repos: [] });
  });

  it("getCacheSize sends GET with cache_dir param", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ total_size_bytes: 1024 }));
    await client.getCacheSize("/my/cache");
    expect(fetchSpy.mock.calls[0][0]).toContain("cache_dir=%2Fmy%2Fcache");
  });

  it("getCacheSize uses default cache dir", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ total_size_bytes: 0 }));
    await client.getCacheSize();
    expect(fetchSpy.mock.calls[0][0]).toContain("cache_dir=");
  });

  it("deleteHuggingfaceModel encodes repoId", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await client.deleteHuggingfaceModel("org/model");
    expect(fetchSpy.mock.calls[0][0]).toContain(
      "/admin/models/huggingface/org%2Fmodel"
    );
  });

  // ── Collections ──────────────────────────────────────────

  it("createCollection sends POST with name and embedding_model", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ name: "col1" }));
    await client.createCollection("col1", "all-MiniLM-L6-v2");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.name).toBe("col1");
    expect(body.embedding_model).toBe("all-MiniLM-L6-v2");
  });

  it("addToCollection sends POST with all fields", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await client.addToCollection(
      "col1",
      ["doc1"],
      ["id1"],
      [{ source: "test" }],
      [[0.1, 0.2]]
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.documents).toEqual(["doc1"]);
    expect(body.ids).toEqual(["id1"]);
    expect(body.embeddings).toEqual([[0.1, 0.2]]);
  });

  // ── Legacy admin operation ───────────────────────────────

  it("adminOperation with SSE content-type yields SSE data", async () => {
    const sse = sseResponse([
      'data: {"step":1}\n',
      'data: {"step":2}\n',
      "data: [DONE]\n"
    ]);
    Object.defineProperty(sse, "headers", {
      value: new Headers({ "content-type": "text/event-stream" })
    });
    fetchSpy.mockResolvedValueOnce(sse);
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.adminOperation("scan")) {
      results.push(chunk);
    }
    expect(results).toHaveLength(2);
  });

  it("adminOperation with JSON response yields single result", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "done" }));
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.adminOperation("info")) {
      results.push(chunk);
    }
    expect(results).toEqual([{ status: "done" }]);
  });

  it("adminOperation with JSON results array yields each item", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ results: [{ a: 1 }, { b: 2 }] })
    );
    const results: Record<string, unknown>[] = [];
    for await (const chunk of client.adminOperation("list")) {
      results.push(chunk);
    }
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("adminOperation throws on HTTP error", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("bad request", 400));
    const gen = client.adminOperation("bad");
    await expect(gen.next()).rejects.toThrow("400");
  });

  it("adminOperation sends operation and params in body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    for await (const _ of client.adminOperation("test", { key: "val" })) {
      // consume
    }
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.operation).toBe("test");
    expect(body.params).toEqual({ key: "val" });
  });

  it("adminOperation defaults params to empty object", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    for await (const _ of client.adminOperation("test")) {
      // consume
    }
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.params).toEqual({});
  });
});
