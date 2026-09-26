/**
 * External asset references: `assets.createExternal` records a local file's
 * path instead of copying its bytes, key-based readers find those bytes
 * through the storage adapter and `/api/storage`, and deleting the asset
 * leaves the original file on disk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Asset, initTestDb, ModelObserver } from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({
  adapter: null as StorageAdapter | null,
  generateThumb: vi.fn(async () => {})
}));

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => mocks.adapter
}));

vi.mock("../src/lib/thumbnail.js", async (orig) => {
  const actual = await orig<typeof import("../src/lib/thumbnail.js")>();
  return { ...actual, generateThumbnailForStoredAsset: mocks.generateThumb };
});

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { THUMBNAIL_SOURCE_MAX_BYTES } from "../src/lib/thumbnail.js";
import { retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { createStorageHandler } from "../src/storage-api.js";
import {
  DEFAULT_EXTERNAL_ASSET_THRESHOLD_BYTES,
  EXTERNAL_ASSET_THRESHOLD_SETTING
} from "../src/lib/external-assets.js";

const createCaller = createCallerFactory(appRouter);
const USER = "user-1";

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

let tmpDir: string;
let storageRoot: string;
let mediaDir: string;
let externalFile: string;
const CONTENT = "external file contents";

beforeEach(async () => {
  initTestDb();
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "external-assets-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  mediaDir = path.join(tmpDir, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  externalFile = path.join(mediaDir, "notes.txt");
  await fs.writeFile(externalFile, CONTENT);
  mocks.adapter = new FileStorageAdapter(storageRoot, {
    externalPathLookup: lookupExternalAssetPath
  });
  vi.stubEnv("NODETOOL_LOCAL_FILE_ROOTS", mediaDir);
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
  mocks.generateThumb.mockClear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  ModelObserver.clear();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("assets.createExternal", () => {
  it("creates a row pointing at the file without copying its bytes", async () => {
    const created = await createCaller(makeCtx()).assets.createExternal({
      path: externalFile,
      content_type: "text/plain"
    });

    expect(created).toMatchObject({
      name: "notes.txt",
      content_type: "text/plain",
      parent_id: USER,
      size: CONTENT.length
    });
    expect(created.metadata).toMatchObject({ external_size: CONTENT.length });
    expect(typeof created.metadata?.["external_mtime"]).toBe("number");
    // D5: the URL is id-based and never carries the disk path.
    expect(created.get_url).toContain(`${USER}/${created.id}.txt`);
    expect(JSON.stringify(created)).not.toContain(mediaDir);

    const row = await Asset.find(USER, created.id);
    expect(row!.external_path).toBe(externalFile);
    expect(await fs.readdir(storageRoot)).toEqual([]);

    const bytes = await retrieveAssetBytes(
      mocks.adapter!,
      USER,
      created.id,
      "text/plain"
    );
    expect(Buffer.from(bytes!).toString()).toBe(CONTENT);
  });

  it("infers the content type from the name and generates a thumbnail for small images", async () => {
    const image = path.join(mediaDir, "still.png");
    await fs.writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const created = await createCaller(makeCtx()).assets.createExternal({
      path: image
    });
    expect(created.content_type).toBe("image/png");
    expect(mocks.generateThumb).toHaveBeenCalledWith(
      USER,
      created.id,
      "image/png"
    );
  });

  it("generates a thumbnail for a file above the old byte cap", async () => {
    const video = path.join(mediaDir, "long take.mp4");
    await fs.writeFile(video, "");
    // Sparse: the size exceeds the byte cap without writing the bytes.
    await fs.truncate(video, THUMBNAIL_SOURCE_MAX_BYTES + 1);
    const created = await createCaller(makeCtx()).assets.createExternal({
      path: video
    });
    expect(mocks.generateThumb).toHaveBeenCalledWith(
      USER,
      created.id,
      "video/mp4"
    );
  });

  it("refuses in production", async () => {
    vi.stubEnv("NODETOOL_ENV", "production");
    await expect(
      createCaller(makeCtx()).assets.createExternal({ path: externalFile })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses when the asset store is not the local file store", async () => {
    mocks.adapter = {} as StorageAdapter;
    await expect(
      createCaller(makeCtx()).assets.createExternal({ path: externalFile })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses relative paths, paths outside the roots, directories, and missing files", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.assets.createExternal({ path: "notes.txt" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const outside = path.join(tmpDir, "outside.txt");
    await fs.writeFile(outside, "x");
    await expect(
      caller.assets.createExternal({ path: outside })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.assets.createExternal({ path: mediaDir })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.assets.createExternal({ path: path.join(mediaDir, "gone.txt") })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("assets.externalImportConfig", () => {
  it("reports availability and the default threshold", async () => {
    await expect(
      createCaller(makeCtx()).assets.externalImportConfig()
    ).resolves.toEqual({
      enabled: true,
      threshold_bytes: DEFAULT_EXTERNAL_ASSET_THRESHOLD_BYTES
    });
  });

  it("honours the env override and disables itself in production", async () => {
    vi.stubEnv(EXTERNAL_ASSET_THRESHOLD_SETTING, "2048");
    vi.stubEnv("NODETOOL_ENV", "production");
    await expect(
      createCaller(makeCtx()).assets.externalImportConfig()
    ).resolves.toEqual({ enabled: false, threshold_bytes: 2048 });
  });
});

describe("external asset reads and deletes", () => {
  it("streams the file through /api/storage with Range support", async () => {
    const created = await createCaller(makeCtx()).assets.createExternal({
      path: externalFile,
      content_type: "text/plain"
    });
    const handler = createStorageHandler({ storagePath: storageRoot });
    const url = `http://localhost/api/storage/${USER}/${created.id}.txt`;

    const full = await handler(
      new Request(url, { headers: { "x-user-id": USER } })
    );
    expect(full.status).toBe(200);
    expect(full.headers.get("Content-Type")).toBe("text/plain");
    expect(await full.text()).toBe(CONTENT);

    const ranged = await handler(
      new Request(url, { headers: { "x-user-id": USER, Range: "bytes=0-7" } })
    );
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe(CONTENT.slice(0, 8));

    const foreign = await handler(
      new Request(url, { headers: { "x-user-id": "user-2" } })
    );
    expect(foreign.status).toBe(404);
  });

  it("does not resolve another user's key or a mismatched extension", async () => {
    const created = await createCaller(makeCtx()).assets.createExternal({
      path: externalFile,
      content_type: "text/plain"
    });
    expect(await lookupExternalAssetPath(`user-2/${created.id}.txt`)).toBeNull();
    expect(await lookupExternalAssetPath(`${USER}/${created.id}.png`)).toBeNull();
    expect(await lookupExternalAssetPath(`${created.id}.txt`)).toBeNull();
    expect(await lookupExternalAssetPath(`${USER}/${created.id}.txt`)).toBe(
      externalFile
    );
  });

  it("deleting the asset leaves the original file on disk (F6)", async () => {
    const caller = createCaller(makeCtx());
    const created = await caller.assets.createExternal({
      path: externalFile,
      content_type: "text/plain"
    });

    await expect(caller.assets.delete({ id: created.id })).resolves.toEqual({
      deleted_asset_ids: [created.id]
    });

    expect(await Asset.find(USER, created.id)).toBeNull();
    expect(await fs.readFile(externalFile, "utf8")).toBe(CONTENT);
  });
});
