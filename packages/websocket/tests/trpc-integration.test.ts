import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
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
