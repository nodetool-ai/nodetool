/**
 * The agent surface's REST endpoints must stay registered.
 *
 * The editor runs workflows over the WebSocket, so nothing in `web/` notices
 * when `POST /api/workflows/:id/run` disappears — but `run_workflow`,
 * `debug_workflow`, `start_background_job` and the `nodetool debug` harness all
 * go through it, and they answered 404 for as long as it was gone. These
 * assertions fail at registration time instead of in an agent transcript.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import workflowsRoutes from "../src/routes/workflows.js";

const fakeRegistry = {
  listMetadata: () => []
} as unknown as NodeRegistry;

describe("workflows routes — agent-facing endpoints", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(workflowsRoutes, {
      apiOptions: { registry: fakeRegistry }
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ["POST", "/api/workflows/:id/run"],
    ["POST", "/api/workflows/:id/debug"],
    ["GET", "/api/debug/sessions/:id"],
    ["POST", "/api/debug/sessions/:id/:action"],
    ["GET", "/api/workflows/:id"],
    ["GET", "/api/workflows/examples/:package_name/:example_name"]
  ])("registers %s %s", (method, url) => {
    expect(
      app.hasRoute({ method: method as "GET" | "POST", url })
    ).toBe(true);
  });

  it("answers an unknown debug session with the handler's 404, not the router's", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/debug/sessions/does-not-exist"
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().detail).toBe("Debug session not found");
  });
});
