/**
 * `Asset.find` resolves an exact 12-character prefix of the caller's asset.
 * Every write after that lookup must use the resolved full id: listings match
 * `parent_id` exactly, and a folder's children are found by its full id.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";
const FOLDER = "aaaaaaaaaaaa00000000000000000001";
const OTHER_FOLDER = "bbbbbbbbbbbb00000000000000000002";
const CHILD = "cccccccccccc00000000000000000003";

const createCaller = createCallerFactory(appRouter);
const makeCtx = (): Context =>
  ({
    userId: USER_ID,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  }) as Context;

const saveFolder = async (id: string, parentId: string): Promise<void> => {
  await new Asset({
    id,
    user_id: USER_ID,
    parent_id: parentId,
    name: id,
    content_type: "folder"
  }).save();
};

describe("assets router with short ids", () => {
  beforeEach(async () => {
    initTestDb();
    await saveFolder(FOLDER, USER_ID);
    await saveFolder(OTHER_FOLDER, USER_ID);
    await saveFolder(CHILD, FOLDER);
  });
  afterEach(() => {
    ModelObserver.clear();
  });

  it("stores the full parent id when the move names a short one", async () => {
    const result = await createCaller(makeCtx()).assets.update({
      id: CHILD,
      parent_id: OTHER_FOLDER.slice(0, 12)
    });
    expect(result.parent_id).toBe(OTHER_FOLDER);
    const stored = await Asset.find(USER_ID, CHILD);
    expect(stored?.parent_id).toBe(OTHER_FOLDER);
  });

  it("refuses a folder as its own parent by short id", async () => {
    await expect(
      createCaller(makeCtx()).assets.update({
        id: FOLDER,
        parent_id: FOLDER.slice(0, 12)
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await Asset.find(USER_ID, FOLDER))?.parent_id).toBe(USER_ID);
  });

  it("deletes a folder's contents when the folder is named by short id", async () => {
    const result = await createCaller(makeCtx()).assets.delete({
      id: FOLDER.slice(0, 12)
    });
    expect(result.deleted_asset_ids.sort()).toEqual([FOLDER, CHILD].sort());
    expect(await Asset.find(USER_ID, CHILD)).toBeNull();
  });
});
