import { describe, it, expect } from "vitest";
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

function makeMockReply(): FastifyReply {
  const headers: Record<string, string> = {};
  return {
    status: () => ({ send: () => {} }),
    header: (k: string, v: string) => {
      headers[k] = v;
    },
    send: () => {},
    _headers: headers
  } as unknown as FastifyReply;
}

describe("bridge: userId propagation", () => {
  it("sets x-user-id header when req.userId is a string", async () => {
    const req = makeMockReq({ userId: "abc-123" });
    const reply = makeMockReply();
    let capturedUserId: string | null = null;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    expect(capturedUserId).toBe("abc-123");
  });

  it("does not set x-user-id header when req.userId is null", async () => {
    const req = makeMockReq({ userId: null });
    const reply = makeMockReply();
    let capturedUserId: string | null | undefined = undefined;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    expect(capturedUserId).toBeNull();
  });

  it("strips a client-supplied x-user-id header when userId is null", async () => {
    // A client must never be able to inject its own identity: on auth-exempt /
    // public routes req.userId is unset, and forwarding an incoming x-user-id
    // would let the caller impersonate any user downstream (IDOR).
    const req = makeMockReq({
      userId: null,
      headers: { host: "localhost", "x-user-id": "from-header" }
    });
    const reply = makeMockReply();
    let capturedUserId: string | null = null;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response("{}", { status: 200 });
    });

    expect(capturedUserId).toBeNull();
  });

  it("overrides a client-supplied x-user-id header with the authenticated userId", async () => {
    const req = makeMockReq({
      userId: "authed-user",
      headers: { host: "localhost", "x-user-id": "from-header" }
    });
    const reply = makeMockReply();
    let capturedUserId: string | null = null;

    await bridge(req, reply, async (request) => {
      capturedUserId = request.headers.get("x-user-id");
      return new Response("{}", { status: 200 });
    });

    expect(capturedUserId).toBe("authed-user");
  });
});
