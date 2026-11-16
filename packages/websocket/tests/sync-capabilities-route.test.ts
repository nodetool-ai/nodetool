/**
 * The anonymous capability probe over HTTP, behind the server's auth rule:
 * exactly `GET /api/sync/capabilities` skips auth, and nothing else does,
 * including a tRPC batch that names the capabilities procedure.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import {
  isPublicAuthExemptRoute,
  routedPathname
} from "../src/lib/public-routes.js";
import syncCapabilitiesRoute from "../src/routes/sync-capabilities.js";

describe("GET /api/sync/capabilities", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    // The server's rule: an exempt route passes, every other request needs
    // a session, which these requests do not carry.
    app.addHook("onRequest", async (req, reply) => {
      const pathname = routedPathname(req.url);
      if (pathname !== null && isPublicAuthExemptRoute(pathname, req.method)) {
        return;
      }
      await reply.status(401).send({ error: "Unauthorized" });
    });
    await app.register(syncCapabilitiesRoute);
    // Stands in for the tRPC mount, which would answer any procedure.
    app.all("/trpc/*", async () => ({ reached: true }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("answers a client that has not signed in", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sync/capabilities" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      protocol_version: sync.SYNC_PROTOCOL_VERSION,
      min_client_protocol_version: sync.MIN_CLIENT_PROTOCOL_VERSION
    });
    expect(sync.capabilitiesOutput.parse(res.json())).toBeTruthy();
  });

  it("exempts only that GET", async () => {
    expect(
      (await app.inject({ method: "POST", url: "/api/sync/capabilities" })).statusCode
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/api/sync/capabilities/extra" }))
        .statusCode
    ).toBe(401);
  });

  it("refuses a tRPC batch that pairs the probe with a protected procedure", async () => {
    const batch = await app.inject({
      method: "GET",
      url: "/trpc/sync.capabilities,workflows.list?batch=1&input=%7B%7D"
    });
    expect(batch.statusCode).toBe(401);
    const single = await app.inject({ method: "GET", url: "/trpc/sync.capabilities" });
    expect(single.statusCode).toBe(401);
  });
});
