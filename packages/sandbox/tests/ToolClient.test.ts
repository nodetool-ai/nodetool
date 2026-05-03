import { describe, it, expect, vi } from "vitest";
import { ToolClient, ToolInvocationError } from "../src/ToolClient.js";

function makeFetch(
  responder: (input: RequestInfo | URL, init?: RequestInit) => Response
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(input, init))) as typeof fetch;
}

describe("ToolClient", () => {
  it("calls /health with GET and parses the response", async () => {
    const client = new ToolClient({
      baseUrl: "http://sbx:7788",
      fetch: makeFetch((url, init) => {
        expect(String(url)).toBe("http://sbx:7788/health");
        expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
        return new Response(
          JSON.stringify({
            ok: true,
            version: "0.1.0",
            uptime_seconds: 12.5,
            workspace: "/workspace"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    });
    const health = await client.health();
    expect(health.ok).toBe(true);
    expect(health.version).toBe("0.1.0");
  });

  it("validates input and sends JSON body for file.read", async () => {
    let captured: { url: string; body: unknown } | null = null;
    const client = new ToolClient({
      baseUrl: "http://sbx:7788",
      fetch: makeFetch((url, init) => {
        captured = { url: String(url), body: JSON.parse(init!.body as string) };
        return new Response(
          JSON.stringify({ content: "hi", total_lines: 1, truncated: false }),
          { status: 200 }
        );
      })
    });
    const out = await client.fileRead({ file: "/tmp/x" });
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("http://sbx:7788/file/read");
    expect(captured!.body).toEqual({ file: "/tmp/x" });
    expect(out.content).toBe("hi");
  });

  it("throws ToolInvocationError on non-2xx responses", async () => {
    const client = new ToolClient({
      baseUrl: "http://sbx:7788",
      fetch: makeFetch(
        () =>
          new Response(JSON.stringify({ error: "boom" }), { status: 500 })
      )
    });
    await expect(client.fileRead({ file: "/tmp/x" })).rejects.toBeInstanceOf(
      ToolInvocationError
    );
  });

  it("adds request details to network fetch failures", async () => {
    const client = new ToolClient({
      baseUrl: "http://sbx:7788",
      fetch: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("fetch failed"))
    });

    await expect(client.health()).rejects.toThrow(
      "sandbox request failed: GET http://sbx:7788/health: fetch failed"
    );
  });

  it("strips a trailing slash from baseUrl", async () => {
    let capturedUrl = "";
    const client = new ToolClient({
      baseUrl: "http://sbx:7788/",
      fetch: makeFetch((url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({
            ok: true,
            version: "0.1.0",
            uptime_seconds: 0,
            workspace: "/workspace"
          }),
          { status: 200 }
        );
      })
    });
    await client.health();
    expect(capturedUrl).toBe("http://sbx:7788/health");
  });

  it("raises a zod error when response body is malformed", async () => {
    const client = new ToolClient({
      baseUrl: "http://sbx:7788",
      fetch: makeFetch(
        () => new Response(JSON.stringify({ wrong: true }), { status: 200 })
      )
    });
    await expect(client.fileRead({ file: "/tmp/x" })).rejects.toThrow();
  });
});
