import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { Prediction } from "@nodetool/models";
import { appRouter } from "../src/trpc/router.js";
import { createContextFactory } from "../src/trpc/context.js";

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = "test-user";
  });
  const stubBridge = { hasPython: () => false, close: () => {} } as never;
  const stubRegistry = {} as never;
  const stubApiOptions = { metadataRoots: [], registry: stubRegistry } as never;
  const createContext = createContextFactory({
    registry: stubRegistry,
    apiOptions: stubApiOptions,
    pythonBridge: stubBridge,
    getPythonBridgeReady: () => false
  });
  void app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext }
  });
  return app;
}

describe("tRPC Fastify mount", () => {
  it("serves the healthz query at /trpc/healthz", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/trpc/healthz" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // tRPC v11 returns { result: { data: { json: ..., meta: ... } } } when superjson is active.
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data).toEqual({ ok: true });
    await app.close();
  });
});

describe("tRPC /trpc/costs.list over Fastify", () => {
  it("returns an empty list for a user with no predictions", async () => {
    // Prediction.paginate returns [items, cursorString] — empty cursor is "".
    // The costs.list procedure normalizes "" → null for the response payload.
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], ""]);
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/trpc/costs.list?input=${encodeURIComponent(
        JSON.stringify({ json: { limit: 10 } })
      )}`,
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.result?.data?.json ?? body.result?.data;
    expect(data.calls).toEqual([]);
    expect(data.next_start_key).toBeNull();
    await app.close();
  });
});
