/**
 * `/api/storage` on the file backend for a collaborator on a shared document.
 *
 * `assets.get` returns the owner's asset with owner-prefixed URLs
 * (`/api/storage/<ownerId>/<assetId>.<ext>`). These tests read the bytes
 * behind those URLs as the collaborator. Real DB and models, real files.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  DocumentCollaborator,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";
import { invalidateSharedAssets } from "../src/lib/document-access.js";
import { createStorageHandler } from "../src/storage-api.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

const caller = (userId: string) =>
  createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);

const OWNER = "owner-1";
const GUEST = "guest-1";
const STRANGER = "stranger-1";

const SHOWN = "a".repeat(32);
const HIDDEN = "b".repeat(32);
const LATER = "c".repeat(32);

let tmpDir: string;

async function saveOwnerAsset(id: string): Promise<void> {
  await new Asset({
    id,
    user_id: OWNER,
    project_id: "default",
    parent_id: OWNER,
    name: `${id}.png`,
    content_type: "image/png"
  }).save();
  await fs.mkdir(path.join(tmpDir, OWNER), { recursive: true });
  await fs.writeFile(path.join(tmpDir, OWNER, `${id}.png`), `bytes-${id}`);
  await fs.writeFile(
    path.join(tmpDir, OWNER, `${id}_thumb.jpg`),
    `thumb-${id}`
  );
}

function storyboardDocument(entityIds: string[]) {
  return {
    screenplay: null,
    shots: [],
    brief: "",
    style: "",
    entityIds,
    aspectRatio: "16:9" as const,
    setupStage: "done" as const,
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null
  };
}

/** A storyboard of the owner's that names `SHOWN`, shared with GUEST. */
async function shareBoardShowing(): Promise<string> {
  const board = await caller(OWNER).storyboards.create({
    name: "Trailer",
    projectId: "default"
  });
  await caller(OWNER).storyboards.update({
    id: board.id,
    document: storyboardDocument([SHOWN])
  });
  const link = await caller(OWNER).documentSharing.createLink({
    type: "storyboard",
    id: board.id,
    role: "viewer"
  });
  await caller(GUEST).documentSharing.accept({ token: link.token });
  return board.id;
}

function read(userId: string, key: string, method = "GET"): Promise<Response> {
  const handler = createStorageHandler({ storagePath: tmpDir });
  return handler(
    new Request(`http://localhost/api/storage/${key}`, {
      method,
      headers: { "x-user-id": userId }
    })
  );
}

describe("/api/storage for a document collaborator", () => {
  beforeEach(async () => {
    initTestDb();
    invalidateSharedAssets();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-api-sharing-"));
    await saveOwnerAsset(SHOWN);
    await saveOwnerAsset(HIDDEN);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    ModelObserver.clear();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("serves the bytes and thumbnail of an asset the shared document shows", async () => {
    await shareBoardShowing();

    const bytes = await read(GUEST, `${OWNER}/${SHOWN}.png`);
    expect(bytes.status).toBe(200);
    expect(await bytes.text()).toBe(`bytes-${SHOWN}`);

    const thumb = await read(GUEST, `${OWNER}/${SHOWN}_thumb.jpg`);
    expect(thumb.status).toBe(200);
    expect(await thumb.text()).toBe(`thumb-${SHOWN}`);

    const head = await read(GUEST, `${OWNER}/${SHOWN}.png`, "HEAD");
    expect(head.status).toBe(200);
  });

  it("hides the owner's assets the document does not show", async () => {
    await shareBoardShowing();

    const res = await read(GUEST, `${OWNER}/${HIDDEN}.png`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(`bytes-${HIDDEN}`);
    expect((await read(GUEST, `${OWNER}/${HIDDEN}_thumb.jpg`)).status).toBe(
      404
    );
  });

  it("hides shown media from a user without a grant", async () => {
    await shareBoardShowing();

    expect((await read(STRANGER, `${OWNER}/${SHOWN}.png`)).status).toBe(404);
  });

  it("opens media on the request right after the link is accepted", async () => {
    const board = await caller(OWNER).storyboards.create({
      name: "Trailer",
      projectId: "default"
    });
    await caller(OWNER).storyboards.update({
      id: board.id,
      document: storyboardDocument([SHOWN])
    });
    const link = await caller(OWNER).documentSharing.createLink({
      type: "storyboard",
      id: board.id,
      role: "viewer"
    });

    expect((await read(GUEST, `${OWNER}/${SHOWN}.png`)).status).toBe(404);
    await caller(GUEST).documentSharing.accept({ token: link.token });
    expect((await read(GUEST, `${OWNER}/${SHOWN}.png`)).status).toBe(200);
  });

  it("closes media once the collaborator is removed", async () => {
    const boardId = await shareBoardShowing();
    expect((await read(GUEST, `${OWNER}/${SHOWN}.png`)).status).toBe(200);

    await caller(OWNER).documentSharing.removeCollaborator({
      type: "storyboard",
      id: boardId,
      user_id: GUEST
    });

    expect((await read(GUEST, `${OWNER}/${SHOWN}.png`)).status).toBe(404);
  });

  it("falls back to the owner's legacy flat object", async () => {
    await shareBoardShowing();
    await fs.rm(path.join(tmpDir, OWNER, `${SHOWN}.png`));
    await fs.writeFile(path.join(tmpDir, `${SHOWN}.png`), "flat-bytes");

    const res = await read(GUEST, `${OWNER}/${SHOWN}.png`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("flat-bytes");
  });

  it("loads the shared documents once for a burst of media requests", async () => {
    await shareBoardShowing();
    const listForUser = vi.spyOn(DocumentCollaborator, "listForUser");

    const responses = await Promise.all([
      read(GUEST, `${OWNER}/${SHOWN}.png`),
      read(GUEST, `${OWNER}/${SHOWN}_thumb.jpg`),
      read(GUEST, `${OWNER}/${SHOWN}.png`, "HEAD"),
      read(GUEST, `${OWNER}/${HIDDEN}.png`)
    ]);

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 404]);
    expect(listForUser).toHaveBeenCalledTimes(1);
  });

  it("serves media the owner adds to the document once the cache is a second old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await saveOwnerAsset(LATER);
    const boardId = await shareBoardShowing();
    expect((await read(GUEST, `${OWNER}/${SHOWN}.png`)).status).toBe(200);

    await caller(OWNER).storyboards.update({
      id: boardId,
      document: storyboardDocument([SHOWN, LATER])
    });
    vi.setSystemTime(Date.now() + 1_500);

    const res = await read(GUEST, `${OWNER}/${LATER}.png`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`bytes-${LATER}`);
  });
});
