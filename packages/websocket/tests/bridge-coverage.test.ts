import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { bridge } from "../src/lib/bridge.js";
import type { FastifyRequest, FastifyReply } from "fastify";

function makeMockReq(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    method: "GET",
    url: "/api/something",
    headers: { host: "localhost" },
    body: null,
    userId: null,
    ...overrides
  } as unknown as FastifyRequest;
}

interface Captured {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  sendCalled: boolean;
}

function makeMockReply(): { reply: FastifyReply; captured: Captured } {
  const captured: Captured = {
    status: 0,
    headers: {},
    body: undefined,
    sendCalled: false
  };
  const reply = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    header(k: string, v: string) {
      captured.headers[k.toLowerCase()] = v;
      return this;
    },
    send(payload?: unknown) {
      captured.sendCalled = true;
      captured.body = payload;
      return this;
    }
  } as unknown as FastifyReply;
  return { reply, captured };
}

describe("bridge", () => {
  it("forwards status and small bodies unchanged with content-length", async () => {
    const { reply, captured } = makeMockReply();
    await bridge(makeMockReq(), reply, async () =>
      new Response("hello", {
        status: 201,
        headers: { "content-type": "text/plain" }
      })
    );
    expect(captured.status).toBe(201);
    expect(captured.headers["content-type"]).toBe("text/plain");
    expect(captured.headers["content-length"]).toBe("5");
    expect(Buffer.isBuffer(captured.body)).toBe(true);
    expect((captured.body as Buffer).toString()).toBe("hello");
  });

  it("sends empty response when handler returns no body", async () => {
    const { reply, captured } = makeMockReply();
    await bridge(makeMockReq(), reply, async () =>
      new Response(null, { status: 204 })
    );
    expect(captured.status).toBe(204);
    expect(captured.sendCalled).toBe(true);
    expect(captured.body).toBeUndefined();
  });

  it("sends empty when body arrayBuffer is zero-length", async () => {
    const { reply, captured } = makeMockReply();
    await bridge(makeMockReq(), reply, async () =>
      new Response("", { status: 200 })
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toBeUndefined();
  });

  it("gzip-compresses large bodies when client accepts gzip", async () => {
    const { reply, captured } = makeMockReply();
    const big = "a".repeat(300 * 1024); // > 256KB threshold
    await bridge(
      makeMockReq({
        headers: { host: "localhost", "accept-encoding": "gzip, deflate" }
      }),
      reply,
      async () => new Response(big, { status: 200 })
    );
    expect(captured.headers["content-encoding"]).toBe("gzip");
    const decompressed = gunzipSync(captured.body as Buffer).toString();
    expect(decompressed).toBe(big);
  });

  it("does not gzip large bodies when client does not accept gzip", async () => {
    const { reply, captured } = makeMockReply();
    const big = "b".repeat(300 * 1024);
    await bridge(makeMockReq(), reply, async () =>
      new Response(big, { status: 200 })
    );
    expect(captured.headers["content-encoding"]).toBeUndefined();
    expect((captured.body as Buffer).length).toBe(big.length);
  });

  it("joins array accept-encoding headers before checking gzip", async () => {
    const { reply, captured } = makeMockReply();
    const big = "c".repeat(300 * 1024);
    await bridge(
      makeMockReq({
        headers: { host: "localhost", "accept-encoding": ["deflate", "gzip"] }
      }),
      reply,
      async () => new Response(big, { status: 200 })
    );
    expect(captured.headers["content-encoding"]).toBe("gzip");
  });

  it("serializes a JSON object body and forwards it to the handler", async () => {
    const { reply } = makeMockReply();
    let received: unknown;
    await bridge(
      makeMockReq({ method: "POST", body: { a: 1, b: "x" } }),
      reply,
      async (request) => {
        received = await request.json();
        return new Response("{}", { status: 200 });
      }
    );
    expect(received).toEqual({ a: 1, b: "x" });
  });

  it("passes a Buffer body through without re-serializing", async () => {
    const { reply } = makeMockReply();
    let text = "";
    await bridge(
      makeMockReq({ method: "POST", body: Buffer.from("raw-bytes") }),
      reply,
      async (request) => {
        text = await request.text();
        return new Response("{}", { status: 200 });
      }
    );
    expect(text).toBe("raw-bytes");
  });

  it("does not attach a body for GET requests even if body is present", async () => {
    const { reply } = makeMockReply();
    let hasBody = true;
    await bridge(
      makeMockReq({ method: "GET", body: { ignored: true } }),
      reply,
      async (request) => {
        hasBody = request.body !== null;
        return new Response("{}", { status: 200 });
      }
    );
    expect(hasBody).toBe(false);
  });

  it("forwards array-valued request headers by appending each", async () => {
    const { reply } = makeMockReply();
    let values: string | null = null;
    await bridge(
      makeMockReq({
        headers: { host: "localhost", "x-multi": ["one", "two"] as any }
      }),
      reply,
      async (request) => {
        values = request.headers.get("x-multi");
        return new Response("{}", { status: 200 });
      }
    );
    expect(values).toBe("one, two");
  });

  it("builds the request URL from x-forwarded-proto and host", async () => {
    const { reply } = makeMockReply();
    let seenUrl = "";
    await bridge(
      makeMockReq({
        url: "/api/x?q=1",
        headers: { host: "example.com", "x-forwarded-proto": "https" }
      }),
      reply,
      async (request) => {
        seenUrl = request.url;
        return new Response("{}", { status: 200 });
      }
    );
    expect(seenUrl).toBe("https://example.com/api/x?q=1");
  });

  it("forwards a zero-length buffer body as no body (undefined)", async () => {
    const { reply } = makeMockReply();
    let bodyNull = false;
    await bridge(
      makeMockReq({ method: "POST", body: Buffer.alloc(0) }),
      reply,
      async (request) => {
        bodyNull = request.body === null;
        return new Response("{}", { status: 200 });
      }
    );
    expect(bodyNull).toBe(true);
  });
});
