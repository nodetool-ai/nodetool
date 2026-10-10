/**
 * The server replaces every content-type parser with a catch-all that hands
 * handlers the raw `Buffer`. Routes that read `req.body` as an object must
 * install their own JSON parser, or every request reaches them as bytes.
 * These tests build Fastify the way `server.ts` does, which the per-route
 * suites (a bare `Fastify()`, default JSON parser) cannot catch.
 */
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import nodesRoutes from "../src/routes/nodes.js";

function serverLikeFastify(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  return app;
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("JSON routes under the server's buffer parser", () => {
  it("validates the Comfy resolve body against its schema", async () => {
    app = serverLikeFastify();
    await app.register(nodesRoutes, { apiOptions: {} as never });
    const workflow = {
      "15": {
        class_type: "SaveImage",
        inputs: { images: ["14", 0], filename_prefix: "x" }
      }
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/comfy/resolve-workflow",
      payload: { workflow }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().prompt).toEqual(workflow);
  });

  it("keeps other routes on the raw buffer", async () => {
    app = serverLikeFastify();
    await app.register(nodesRoutes, { apiOptions: {} as never });
    app.post("/raw", async (req) => ({ isBuffer: Buffer.isBuffer(req.body) }));
    const res = await app.inject({
      method: "POST",
      url: "/raw",
      payload: { a: 1 }
    });
    expect(res.json()).toEqual({ isBuffer: true });
  });
});
