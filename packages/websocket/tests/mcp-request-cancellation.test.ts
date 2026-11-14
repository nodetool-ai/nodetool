import { describe, expect, it } from "vitest";
import { jsonRpcRequestIds } from "../src/mcp-server.js";

function post(body: string): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

describe("jsonRpcRequestIds", () => {
  it("names the requests a body carries, skipping notifications", async () => {
    const request = post(
      JSON.stringify([
        { jsonrpc: "2.0", id: 7, method: "tools/call", params: {} },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: "a", method: "tools/list" }
      ])
    );
    expect(await jsonRpcRequestIds(request)).toEqual([7, "a"]);
    // The body is read from a clone, so the transport can still read it.
    expect(await request.json()).toHaveLength(3);
  });

  it("reads a single message and ignores a response or bad JSON", async () => {
    expect(
      await jsonRpcRequestIds(post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })))
    ).toEqual([1]);
    expect(
      await jsonRpcRequestIds(post(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })))
    ).toEqual([]);
    expect(await jsonRpcRequestIds(post("{not json"))).toEqual([]);
    expect(
      await jsonRpcRequestIds(new Request("http://localhost/mcp", { method: "DELETE" }))
    ).toEqual([]);
  });
});
