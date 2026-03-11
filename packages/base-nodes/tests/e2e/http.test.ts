import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeRegistry, makeRunner, nd } from "./helpers.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "hello world",
      json: async () => ({ key: "value", count: 42 }),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Headers(),
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("e2e: HTTP nodes", () => {
  it("GetRequest returns text", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t1" },
      {
        nodes: [nd("get", "lib.http.GetRequest", { name: "out", properties: { url: "http://example.com" } })],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("hello world");
  });

  it("PostRequest sends body with POST method", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t2" },
      {
        nodes: [
          nd("post", "lib.http.PostRequest", {
            name: "out",
            properties: { url: "http://api.example.com", data: "payload" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain("hello world");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://api.example.com",
      expect.objectContaining({ method: "POST", body: "payload" })
    );
  });

  it("JSONGetRequest parses JSON", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t3" },
      {
        nodes: [
          nd("jget", "lib.http.JSONGetRequest", {
            name: "out",
            properties: { url: "http://example.com/api" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContainEqual(
      expect.objectContaining({ key: "value", count: 42 })
    );
  });

  it("JSONPostRequest sends JSON body and parses response", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t4" },
      {
        nodes: [
          nd("jpost", "lib.http.JSONPostRequest", {
            name: "out",
            properties: { url: "http://example.com/api", data: { foo: "bar" } },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContainEqual(expect.objectContaining({ count: 42 }));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://example.com/api",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("FetchPage returns html and success=true", async () => {
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t5" },
      {
        nodes: [
          nd("fp", "lib.http.FetchPage", {
            name: "out",
            properties: { url: "http://example.com" },
          }),
        ],
        edges: [],
      }
    );
    expect(result.status).toBe("completed");
    // FetchPage returns { html, success, error_message } — runner collects all values
    expect(result.outputs.out).toContain("hello world"); // html
    expect(result.outputs.out).toContain(true);          // success
  });

  it("GetRequest with network error reports node error in messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t6" },
      {
        nodes: [
          nd("get", "lib.http.GetRequest", {
            name: "out",
            properties: { url: "http://example.com" },
          }),
        ],
        edges: [],
      }
    );
    // Node errors are caught by the actor; overall run still "completes"
    expect(result.status).toBe("completed");
    // Output node produced no data since it errored
    expect(result.outputs.out).toEqual([]);
    // The error is reported via a node_update message
    const errMsg = result.messages.find(
      (m) => m.type === "node_update" && (m as Record<string, unknown>).error
    );
    expect(errMsg).toBeDefined();
  });

  it("FetchPage with fetch error returns success=false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect failed")));
    const registry = makeRegistry();
    const runner = makeRunner(registry);
    const result = await runner.run(
      { job_id: "t7" },
      {
        nodes: [
          nd("fp", "lib.http.FetchPage", {
            name: "out",
            properties: { url: "http://example.com" },
          }),
        ],
        edges: [],
      }
    );
    // FetchPage catches fetch errors internally — run completes
    expect(result.status).toBe("completed");
    expect(result.outputs.out).toContain(false); // success = false
  });
});
