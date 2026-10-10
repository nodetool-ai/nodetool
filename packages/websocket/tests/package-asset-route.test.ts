/**
 * `GET /api/assets/packages/:pkg/*` is public. A miss in the bundled roots
 * falls back to a Python package metadata scan, which walks the filesystem
 * synchronously. The scan result is reused for a while instead of being
 * repeated on every request, and found files stream instead of buffering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";

const loadPythonPackageMetadata = vi.fn();
vi.mock("@nodetool-ai/node-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/node-sdk")>()),
  loadPythonPackageMetadata: (...args: unknown[]) =>
    loadPythonPackageMetadata(...args)
}));

import assetsRoutes from "../src/routes/assets.js";
import type { HttpApiOptions } from "../src/http-api.js";
import { GZIP_THRESHOLD } from "../src/lib/compression.js";

let tmpDir: string;
let app: FastifyInstance;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "package-asset-route-"));
  loadPythonPackageMetadata.mockReset();
  loadPythonPackageMetadata.mockReturnValue({
    files: [],
    packages: [],
    nodesByType: new Map(),
    duplicates: [],
    warnings: []
  });
  app = Fastify();
  await app.register(assetsRoutes, {
    apiOptions: { packageAssetsRoots: [tmpDir] } as HttpApiOptions
  });
});

afterEach(async () => {
  await app.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("GET /api/assets/packages/:pkg/*", () => {
  it("scans package metadata once for repeated misses", async () => {
    for (const name of ["a.png", "b.png", "c.png"]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/assets/packages/nodetool-missing/${name}`
      });
      expect(res.statusCode).toBe(404);
    }
    expect(loadPythonPackageMetadata).toHaveBeenCalledTimes(1);
  });

  it("serves a file from a Python package's source folder", async () => {
    const source = path.join(tmpDir, "src");
    const assets = path.join(source, "nodetool", "assets", "nodetool-py");
    await fs.mkdir(assets, { recursive: true });
    await fs.writeFile(path.join(assets, "logo.txt"), "hi");
    loadPythonPackageMetadata.mockReturnValue({
      files: [],
      packages: [{ name: "nodetool-py", sourceFolder: source }],
      nodesByType: new Map(),
      duplicates: [],
      warnings: []
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-py/logo.txt"
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("hi");
  });

  it("streams a bundled file uncompressed with its length", async () => {
    const bytes = randomBytes(GZIP_THRESHOLD * 2);
    await fs.mkdir(path.join(tmpDir, "nodetool-base"));
    await fs.writeFile(path.join(tmpDir, "nodetool-base", "loop.mp3"), bytes);
    const res = await app.inject({
      method: "GET",
      url: "/api/assets/packages/nodetool-base/loop.mp3",
      headers: { "accept-encoding": "gzip" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers["content-length"]).toBe(String(bytes.length));
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.rawPayload.equals(bytes)).toBe(true);
    expect(loadPythonPackageMetadata).not.toHaveBeenCalled();
  });
});
