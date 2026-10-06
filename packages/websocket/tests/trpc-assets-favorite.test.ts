import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";
const createCaller = createCallerFactory(appRouter);
const makeCtx = (): Context =>
  ({
    userId: USER_ID,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  }) as Context;

const saveAsset = async (id: string, parentId: string): Promise<void> => {
  await new Asset({
    id,
    user_id: USER_ID,
    parent_id: parentId,
    name: `${id}.png`,
    content_type: "image/png"
  }).save();
};

describe("assets favorites", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
  });

  it("stars through update and lists starred assets from every folder", async () => {
    await saveAsset("in-home", USER_ID);
    await saveAsset("in-folder", "folder-1");
    await saveAsset("unstarred", USER_ID);
    const caller = createCaller(makeCtx());

    const updated = await caller.assets.update({ id: "in-home", favorite: true });
    expect(updated.favorite).toBe(true);
    await caller.assets.update({ id: "in-folder", favorite: true });

    const favorites = await caller.assets.list({
      favorite: true,
      project_id: "default"
    });
    expect(favorites.assets.map((asset) => asset.id).sort()).toEqual([
      "in-folder",
      "in-home"
    ]);

    await caller.assets.update({ id: "in-home", favorite: false });
    const after = await caller.assets.list({
      favorite: true,
      project_id: "default"
    });
    expect(after.assets.map((asset) => asset.id)).toEqual(["in-folder"]);
  });
});
