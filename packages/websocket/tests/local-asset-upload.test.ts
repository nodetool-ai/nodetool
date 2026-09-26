import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorageAdapter } from "@nodetool-ai/storage";

vi.mock("../src/lib/storage.js", () => ({ getAssetAdapter: vi.fn() }));
vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: vi.fn(),
  storeAssetFileWithThumbnail: vi.fn(),
  generateThumbnailForStoredAsset: vi.fn(),
  thumbnailKey: (id: string) => `${id}_thumb.jpg`
}));
vi.mock("../src/lib/asset-response.js", () => ({
  toAssetResponse: async (asset: unknown) => asset
}));
vi.mock("@nodetool-ai/models", async (original) => ({
  ...await original<typeof import("@nodetool-ai/models")>(),
  Asset: { create: vi.fn() }
}));

import { Asset } from "@nodetool-ai/models";
import { getAssetAdapter } from "../src/lib/storage.js";
import assetsRoutes from "../src/routes/assets.js";
import { generateThumbnailForStoredAsset } from "../src/lib/thumbnail.js";

describe("local asset uploads", () => {
  let app: FastifyInstance;
  let directory: string;
  let adapter: FileStorageAdapter;
  const deleteAsset = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    directory = await mkdtemp(join(tmpdir(), "local-upload-test-"));
    adapter = new FileStorageAdapter(directory);
    vi.mocked(getAssetAdapter).mockReturnValue(adapter);
    vi.mocked(Asset.create).mockImplementation(async (values) => ({
      ...values, id: "asset-1", delete: deleteAsset
    }) as never);
    app = Fastify({ bodyLimit: 1024 });
    app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    app.addHook("onRequest", async (request) => { request.userId = "owner"; });
    await app.register(assetsRoutes, { apiOptions: {} });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  async function upload(bytes: number) {
    const form = new FormData();
    form.append("json", JSON.stringify({ name: "clip.mp4", content_type: "video/mp4", parent_id: "owner" }));
    form.append("file", new Blob([new Uint8Array(bytes).fill(7)]), "clip.mp4");
    const request = new Request("http://localhost/api/assets", { method: "POST", body: form });
    return app.inject({ method: "POST", url: "/api/assets", headers: { "content-type": request.headers.get("content-type")! }, payload: Buffer.from(await request.arrayBuffer()) });
  }

  it("streams a file larger than the API body limit into the owner's storage", async () => {
    const publish = vi.spyOn(adapter, "storeFile");
    const response = await upload(2048);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().size).toBe(2048);
    expect(await readFile(join(directory, "owner", "asset-1.mp4"))).toEqual(Buffer.alloc(2048, 7));
    const stagedPath = publish.mock.calls[0]?.[1];
    expect(stagedPath).toBeDefined();
    await expect(stat(stagedPath!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a file over the configured cap without creating an asset", async () => {
    vi.stubEnv("NODETOOL_MAX_UPLOAD_BYTES", "1024");
    const response = await upload(2048);
    expect(response.statusCode, response.body).toBe(413);
    expect(Asset.create).not.toHaveBeenCalled();
  });

  it("removes the staged file and asset row if publication fails", async () => {
    let stagedPath = "";
    vi.spyOn(adapter, "storeFile").mockImplementation(async (_key, path) => {
      stagedPath = path;
      throw new Error("Disk full");
    });
    expect((await upload(2048)).statusCode).toBe(500);
    expect(deleteAsset).toHaveBeenCalledOnce();
    expect(stagedPath).not.toBe("");
    await expect(stat(stagedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the general API body limit for JSON requests", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/assets", payload: { name: "x".repeat(2048) }
    });
    expect(response.statusCode).toBe(413);
    expect(Asset.create).not.toHaveBeenCalled();
  });

  it("rejects malformed metadata without publishing the staged file", async () => {
    const form = new FormData();
    form.append("file", new Blob(["video bytes"]), "clip.mp4");
    form.append("json", "{invalid");
    const request = new Request("http://localhost/api/assets", { method: "POST", body: form });
    const response = await app.inject({
      method: "POST", url: "/api/assets",
      headers: { "content-type": request.headers.get("content-type")! },
      payload: Buffer.from(await request.arrayBuffer())
    });
    expect(response.statusCode).toBe(400);
    expect(Asset.create).not.toHaveBeenCalled();
    expect((await adapter.list("")).entries).toEqual([]);
  });

  it("still creates folders from multipart metadata without a file", async () => {
    const form = new FormData();
    form.append("json", JSON.stringify({ name: "Videos", content_type: "folder", parent_id: "owner" }));
    const request = new Request("http://localhost/api/assets", { method: "POST", body: form });
    const response = await app.inject({
      method: "POST", url: "/api/assets",
      headers: { "content-type": request.headers.get("content-type")! },
      payload: Buffer.from(await request.arrayBuffer())
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().content_type).toBe("folder");
  });

  it("streams a large multipart body with bounded memory and preserves its bytes", async () => {
    const bytes = Number(process.env["NODETOOL_TEST_UPLOAD_BYTES"] ?? 128 * 1024 * 1024);
    const boundary = "nodetool-large-upload-test";
    const chunk = Buffer.alloc(1024 * 1024, 7);
    const expected = createHash("sha256");
    const initialRss = process.memoryUsage().rss;
    let peakRss = initialRss;
    async function* body() {
      yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
      for (let offset = 0; offset < bytes; offset += chunk.length) {
        const part = chunk.subarray(0, Math.min(chunk.length, bytes - offset));
        expected.update(part);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        yield part;
      }
      yield Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="json"\r\n\r\n${JSON.stringify({ name: "clip.mp4", content_type: "video/mp4", parent_id: "owner" })}\r\n--${boundary}--\r\n`);
    }
    const response = await app.inject({
      method: "POST", url: "/api/assets",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Readable.from(body())
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().size).toBe(bytes);
    const stored = join(directory, "owner", "asset-1.mp4");
    expect((await stat(stored)).size).toBe(bytes);
    const actual = createHash("sha256");
    for await (const part of createReadStream(stored)) {
      actual.update(part);
    }
    expect(actual.digest("hex")).toBe(expected.digest("hex"));
    // The staged file is local, so its thumbnail is read in place whatever
    // its size.
    expect(generateThumbnailForStoredAsset).toHaveBeenCalledWith(
      "owner",
      "asset-1",
      "video/mp4"
    );
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    expect(peakRss - initialRss).toBeLessThan(512 * 1024 * 1024);
    console.info(`Streamed ${bytes} bytes, sampled RSS growth ${peakRss - initialRss} bytes`);
  }, 60_000);
});
