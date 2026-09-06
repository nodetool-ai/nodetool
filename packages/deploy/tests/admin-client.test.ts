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
    expect(client.headers["Accept"]).toBe("application/json");
  });

  // ── healthCheck ──────────────────────────────────────────

  it("healthCheck sends GET /health", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    const result = await client.healthCheck();
    expect(result).toEqual({ status: "ok" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("healthCheck throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("server down", 500));
    await expect(client.healthCheck()).rejects.toThrow(
      "GET /health failed: 500"
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
});
