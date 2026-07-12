import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import workflowsRoutes from "../src/routes/workflows.js";

describe("workflows REST routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(workflowsRoutes, { apiOptions: {} });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("handles workflow creation at POST /api/workflows", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/workflows",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ detail: "Invalid workflow" });
  });
});
