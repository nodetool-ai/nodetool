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

describe("GET /api/assets/packages/:packageName/*", () => {
  let app: FastifyInstance;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "nodetool-pkg-route-"));
    await mkdir(join(root, "nodetool-base", "audio"), { recursive: true });
    await writeFile(
      join(root, "nodetool-base", "cat.png"),
      Buffer.from([1, 2, 3, 4])
    );
    await writeFile(
      join(root, "nodetool-base", "audio", "loop.mp3"),
      Buffer.from([5, 6, 7])
    );
    // A file that lives outside the package dir, used for traversal checks.
    await writeFile(join(root, "secret.txt"), Buffer.from([9, 9, 9]));
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

  it("serves a nested package asset path", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-base/audio/loop.mp3"
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(Array.from(res.rawPayload)).toEqual([5, 6, 7]);
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

  it("rejects path traversal out of the package dir", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-base/%2e%2e%2fsecret.txt"
    });
    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.includes(9)).toBe(false);
  });
});
