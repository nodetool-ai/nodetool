/**
 * Integration tests for constant package-asset serving:
 *   GET /api/assets/packages/<package-name>/<file>
 *
 * Verifies that assets resolve from a configured bundled root (the path the
 * Electron build ships next to server.mjs) without a Python installation.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- package-assets-route
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assetsRoutes from "../src/routes/assets.js";

describe("GET /api/assets/packages/:packageName/:assetName", () => {
  let app: FastifyInstance;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "nodetool-pkg-route-"));
    await mkdir(join(root, "nodetool-base"), { recursive: true });
    await writeFile(
      join(root, "nodetool-base", "cat.png"),
      Buffer.from([1, 2, 3, 4])
    );
    app = Fastify({ logger: false });
    await app.register(assetsRoutes, {
      apiOptions: { packageAssetsRoots: [root] }
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it("serves a constant package asset from a configured root", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-base/cat.png"
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(Array.from(res.rawPayload)).toEqual([1, 2, 3, 4]);
  });

  it("404s for a missing asset in a known package", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-base/missing.png"
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s for an unknown package with no configured root", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/no-such-pkg/x.png"
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects path traversal in the asset name", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-base/weird..name.png"
    });
    expect(res.statusCode).toBe(404);
  });
});
