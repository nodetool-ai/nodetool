/**
 * The binary download routes stream file bytes off disk. Before, `bridge`
 * buffered every storage and local-file body into memory and, for bodies over
 * the gzip threshold, compressed it with `gzipSync` on the event loop. That
 * also gzipped 206 range responses, so the body no longer matched its
 * `Content-Range`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("@nodetool-ai/models", () => ({
  Asset: {
    find: async (userId: string, assetId: string) => ({
      id: assetId,
      user_id: userId
    })
  }
}));

import storageRoutes from "../src/routes/storage.js";
import type { HttpApiOptions } from "../src/http-api.js";
import { GZIP_THRESHOLD } from "../src/lib/compression.js";

let tmpDir: string;
let app: FastifyInstance;
let bytes: Buffer;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-route-stream-"));
  bytes = randomBytes(GZIP_THRESHOLD * 4);
  await fs.writeFile(path.join(tmpDir, "big.bin"), bytes);
  app = Fastify();
  await app.register(storageRoutes, {
    apiOptions: { storage: { storagePath: tmpDir } } as HttpApiOptions
  });
});

afterEach(async () => {
  await app.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("GET /api/storage/* streaming", () => {
  it("streams a large file uncompressed even when the client accepts gzip", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/storage/big.bin",
      headers: { "accept-encoding": "gzip" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers["content-length"]).toBe(String(bytes.length));
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it("returns exactly the requested range bytes", async () => {
    const start = 100;
    const end = GZIP_THRESHOLD * 2;
    const res = await app.inject({
      method: "GET",
      url: "/api/storage/big.bin",
      headers: { "accept-encoding": "gzip", range: `bytes=${start}-${end}` }
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers["content-range"]).toBe(
      `bytes ${start}-${end}/${bytes.length}`
    );
    expect(res.rawPayload.equals(bytes.subarray(start, end + 1))).toBe(true);
  });

  it("still answers a missing key with a JSON 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/storage/missing.bin"
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "Not found" });
  });
});
