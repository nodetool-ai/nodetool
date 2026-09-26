/**
 * External assets after import (A3): offline detection when the referenced
 * file goes missing or changes, relink to another file under the same id and
 * URL, the fingerprint and data protections on `assets.update`, dedupe of a
 * repeated import, and the mtime in the thumbnail URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  initTestDb,
  ModelObserver,
  Project
} from "@nodetool-ai/models";
import {
  assetObjectKey,
  FileStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";

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
import { thumbnailKey } from "../src/lib/thumbnail.js";
import { retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { createStorageHandler } from "../src/storage-api.js";

const createCaller = createCallerFactory(appRouter);
const USER = "user-1";
const CONTENT = "external file contents";

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

beforeEach(async () => {
  initTestDb();
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "external-relink-"))
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

async function importText(file = externalFile) {
  return createCaller(makeCtx()).assets.createExternal({
    path: file,
    content_type: "text/plain"
  });
}

async function streamStatus(assetId: string): Promise<number> {
  const handler = createStorageHandler({ storagePath: storageRoot });
  const response = await handler(
    new Request(`http://localhost/api/storage/${USER}/${assetId}.txt`, {
      headers: { "x-user-id": USER }
    })
  );
  return response.status;
}

describe("offline detection (R1)", () => {
  it("reports an unchanged file as online and a managed asset without the flag", async () => {
    const created = await importText();
    expect(created.offline).toBe(false);

    const managed = await Asset.create<Asset>({
      user_id: USER,
      name: "pic.png",
      content_type: "image/png"
    });
    const response = await createCaller(makeCtx()).assets.get({
      id: managed.id
    });
    expect(response.offline).toBeUndefined();
  });

  it("marks a missing file offline and answers 404 instead of bytes", async () => {
    const created = await importText();
    await fs.rm(externalFile);

    const got = await createCaller(makeCtx()).assets.get({ id: created.id });
    expect(got.offline).toBe(true);
    expect(await streamStatus(created.id)).toBe(404);
    expect(
      await retrieveAssetBytes(mocks.adapter!, USER, created.id, "text/plain")
    ).toBeNull();
  });

  it("marks a file changed in place offline: a size change and an mtime change", async () => {
    const created = await importText();
    const caller = createCaller(makeCtx());

    // Same size, new mtime.
    const later = new Date(Date.now() + 60_000);
    await fs.utimes(externalFile, later, later);
    expect((await caller.assets.get({ id: created.id })).offline).toBe(true);
    expect(await streamStatus(created.id)).toBe(404);
    expect(
      await mocks.adapter!.localPath(
        mocks.adapter!.uriForKey(`${USER}/${created.id}.txt`)
      )
    ).toBeNull();

    // A second import sees the changed file; the size differs too.
    await fs.writeFile(externalFile, `${CONTENT} and more`);
    expect((await caller.assets.get({ id: created.id })).offline).toBe(true);
  });
});

describe("assets.relinkExternal", () => {
  it("points the asset at a new file under the same id and URL", async () => {
    const created = await importText();
    await fs.rm(externalFile);
    const moved = path.join(mediaDir, "moved.txt");
    const movedContent = "moved and longer contents";
    await fs.writeFile(moved, movedContent);

    const adapter = mocks.adapter!;
    const thumbUri = adapter.uriForKey(
      assetObjectKey(USER, thumbnailKey(created.id))
    );
    await adapter.store(
      assetObjectKey(USER, thumbnailKey(created.id)),
      new Uint8Array([1, 2, 3])
    );
    mocks.generateThumb.mockClear();

    const relinked = await createCaller(makeCtx()).assets.relinkExternal({
      id: created.id,
      path: moved
    });

    expect(relinked.id).toBe(created.id);
    expect(relinked.get_url).toBe(created.get_url);
    expect(relinked.offline).toBe(false);
    expect(relinked.size).toBe(movedContent.length);
    expect(relinked.metadata).toMatchObject({
      external_size: movedContent.length
    });
    expect(JSON.stringify(relinked)).not.toContain(mediaDir);
    expect((await Asset.find(USER, created.id))!.external_path).toBe(moved);
    expect(await streamStatus(created.id)).toBe(200);

    // The previous file's thumbnail is dropped and a new one is generated.
    expect(await adapter.exists(thumbUri)).toBe(false);
    expect(mocks.generateThumb).toHaveBeenCalledWith(
      USER,
      created.id,
      "text/plain"
    );
  });

  it("brings a file changed in place back online when relinked to the same path", async () => {
    const created = await importText();
    await fs.writeFile(externalFile, "rewritten");
    const caller = createCaller(makeCtx());
    expect((await caller.assets.get({ id: created.id })).offline).toBe(true);

    const relinked = await caller.assets.relinkExternal({
      id: created.id,
      path: externalFile
    });
    expect(relinked.offline).toBe(false);
    expect(relinked.size).toBe("rewritten".length);
  });

  it("serves the relinked file even when it is older than the cached one", async () => {
    const created = await importText();
    const older = path.join(mediaDir, "older.txt");
    await fs.writeFile(older, "older");
    const past = new Date(Date.now() - 3_600_000);
    await fs.utimes(older, past, past);
    await createCaller(makeCtx()).assets.relinkExternal({
      id: created.id,
      path: older
    });

    const handler = createStorageHandler({ storagePath: storageRoot });
    const response = await handler(
      new Request(`http://localhost/api/storage/${USER}/${created.id}.txt`, {
        headers: {
          "x-user-id": USER,
          "If-Modified-Since": new Date().toUTCString()
        }
      })
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("older");
  });

  it("validates the new path again (R5)", async () => {
    const created = await importText();
    const caller = createCaller(makeCtx());

    const outside = path.join(tmpDir, "outside.txt");
    await fs.writeFile(outside, "x");
    await expect(
      caller.assets.relinkExternal({ id: created.id, path: outside })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.assets.relinkExternal({ id: created.id, path: "moved.txt" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.assets.relinkExternal({
        id: created.id,
        path: path.join(mediaDir, "gone.txt")
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.assets.relinkExternal({ id: created.id, path: mediaDir })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect((await Asset.find(USER, created.id))!.external_path).toBe(
      externalFile
    );
  });

  it("refuses a file of another media kind, a managed asset, and another user's asset", async () => {
    const created = await importText();
    const caller = createCaller(makeCtx());

    const audio = path.join(mediaDir, "voice.wav");
    await fs.writeFile(audio, "RIFF");
    await expect(
      caller.assets.relinkExternal({ id: created.id, path: audio })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const managed = await Asset.create<Asset>({
      user_id: USER,
      name: "notes.txt",
      content_type: "text/plain"
    });
    await expect(
      caller.assets.relinkExternal({ id: managed.id, path: externalFile })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      createCaller(makeCtx("user-2")).assets.relinkExternal({
        id: created.id,
        path: externalFile
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses in production", async () => {
    const created = await importText();
    vi.stubEnv("NODETOOL_ENV", "production");
    await expect(
      createCaller(makeCtx()).assets.relinkExternal({
        id: created.id,
        path: externalFile
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("assets.update on an external asset", () => {
  it("keeps the recorded fingerprint and size whatever the caller sends", async () => {
    const created = await importText();
    const recorded = created.metadata!;

    const updated = await createCaller(makeCtx()).assets.update({
      id: created.id,
      name: "renamed.txt",
      size: 1,
      metadata: { note: "kept", external_size: 1, external_mtime: 2 }
    });

    expect(updated.name).toBe("renamed.txt");
    expect(updated.size).toBe(CONTENT.length);
    expect(updated.metadata).toEqual({
      note: "kept",
      external_size: recorded["external_size"],
      external_mtime: recorded["external_mtime"]
    });
    expect(updated.offline).toBe(false);
    expect((await Asset.find(USER, created.id))!.external_path).toBe(
      externalFile
    );
  });

  it("refuses new data instead of writing a copy that shadows the file", async () => {
    const created = await importText();
    await expect(
      createCaller(makeCtx()).assets.update({
        id: created.id,
        data: "replacement",
        data_encoding: "utf-8"
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await fs.readdir(storageRoot)).toEqual([]);
    expect(await fs.readFile(externalFile, "utf8")).toBe(CONTENT);
  });

  it("still lets a managed asset's metadata and size be set", async () => {
    const managed = await Asset.create<Asset>({
      user_id: USER,
      name: "notes.txt",
      content_type: "text/plain"
    });
    const updated = await createCaller(makeCtx()).assets.update({
      id: managed.id,
      size: 7,
      metadata: { external_size: 3 }
    });
    expect(updated.size).toBe(7);
    expect(updated.metadata).toEqual({ external_size: 3 });
  });
});

describe("assets.createExternal dedupe (R4)", () => {
  it("returns the existing row for the same unchanged file in the same project", async () => {
    const first = await importText();
    const second = await importText();
    expect(second.id).toBe(first.id);
    expect(await Asset.findByExternalPath(USER, externalFile)).toHaveLength(1);
  });

  it("creates a new row once the file changed, for another user, or another project", async () => {
    const first = await importText();

    await fs.writeFile(externalFile, "changed contents");
    const afterChange = await importText();
    expect(afterChange.id).not.toBe(first.id);

    const otherUser = await createCaller(makeCtx("user-2")).assets.createExternal(
      { path: externalFile, content_type: "text/plain" }
    );
    expect(otherUser.id).not.toBe(afterChange.id);
    expect(otherUser.user_id).toBe("user-2");

    await Project.create<Project>({ id: "p1", user_id: USER, name: "Film" });
    const projectImport = await createCaller(makeCtx()).assets.createExternal({
      path: externalFile,
      content_type: "text/plain",
      project_id: "p1"
    });
    expect(projectImport.id).not.toBe(afterChange.id);
  });
});

describe("thumbnail cache key (R2)", () => {
  it("carries the file's mtime and changes it on relink", async () => {
    const image = path.join(mediaDir, "still.png");
    await fs.writeFile(image, "png");
    const created = await createCaller(makeCtx()).assets.createExternal({
      path: image
    });
    const mtime = Math.trunc(created.metadata!["external_mtime"] as number);
    expect(created.thumb_url).toBe(
      `/api/storage/${USER}/${thumbnailKey(created.id)}?v=${mtime}`
    );
    expect(created.get_url).toBe(`/api/storage/${USER}/${created.id}.png`);

    const replacement = path.join(mediaDir, "still-2.png");
    await fs.writeFile(replacement, "png2");
    const later = new Date(Math.floor(Date.now() / 1000) * 1000 + 120_000);
    await fs.utimes(replacement, later, later);
    const relinked = await createCaller(makeCtx()).assets.relinkExternal({
      id: created.id,
      path: replacement
    });
    expect(relinked.get_url).toBe(created.get_url);
    expect(relinked.thumb_url).not.toBe(created.thumb_url);
    expect(relinked.thumb_url).toContain(`?v=${later.getTime()}`);
  });

  it("leaves a managed asset's thumbnail URL unversioned", async () => {
    const managed = await Asset.create<Asset>({
      user_id: USER,
      name: "pic.png",
      content_type: "image/png"
    });
    const response = await createCaller(makeCtx()).assets.get({
      id: managed.id
    });
    expect(response.thumb_url).toBe(
      `/api/storage/${USER}/${thumbnailKey(managed.id)}`
    );
  });
});
