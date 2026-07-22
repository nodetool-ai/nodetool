import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import nodesRoutes from "../src/routes/nodes.js";
import { ApiErrorCode } from "../src/error-codes.js";

const fakeMetadata = [
  {
    node_type: "test.Alpha",
    title: "Alpha",
    description: "the first node",
    namespace: "test"
  },
  {
    node_type: "other.Beta",
    title: "Beta",
    description: "the second node",
    namespace: "other"
  }
];

// Minimal NodeRegistry stand-in — handleNodeMetadata only calls listMetadata().
const fakeRegistry = {
  listMetadata: () => fakeMetadata
} as unknown as NodeRegistry;

describe("nodes routes — KIE invalid input branches", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(nodesRoutes, { apiOptions: { registry: fakeRegistry } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects a missing model_info with 400 INVALID_INPUT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: {}
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ApiErrorCode.INVALID_INPUT);
    expect(res.json().detail).toMatch(/non-empty string/);
  });

  it("rejects an empty-string model_info with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: "" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ApiErrorCode.INVALID_INPUT);
  });

  it("rejects a whitespace-only model_info with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: "   \n\t " }
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-string model_info with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: 42 }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ApiErrorCode.INVALID_INPUT);
  });

  it("returns 400 with the thrown message when resolution fails", async () => {
    // Non-empty docs with no recognizable model Format should make
    // resolveKieDynamicSchema throw, surfacing a 400 error.
    const res = await app.inject({
      method: "POST",
      url: "/api/kie/resolve-dynamic-schema",
      payload: { model_info: "just some prose with no model identifier at all" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ApiErrorCode.INVALID_INPUT);
    expect(typeof res.json().detail).toBe("string");
  });
});

describe("nodes routes — /api/nodes/metadata", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(nodesRoutes, { apiOptions: { registry: fakeRegistry } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists node metadata as slim summaries", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nodes/metadata" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    // Summary shape only carries these keys.
    expect(Object.keys(body[0]).sort()).toEqual([
      "description",
      "namespace",
      "node_type",
      "title"
    ]);
  });

  it("returns the full match for an exact node_type lookup", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/metadata?node_type=test.Alpha"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().node_type).toBe("test.Alpha");
  });

  it("returns 404 for an unknown node_type", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/metadata?node_type=does.not.Exist"
    });
    expect(res.statusCode).toBe(404);
  });

  it("filters by namespace", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/metadata?namespace=other"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].node_type).toBe("other.Beta");
  });
});
