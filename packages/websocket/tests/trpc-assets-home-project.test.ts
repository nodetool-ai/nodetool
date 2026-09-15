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

const saveAsset = async (
  id: string,
  projectId: string,
  parentId: string | null,
  contentType = "image/png"
): Promise<void> => {
  await new Asset({
    id,
    user_id: USER_ID,
    project_id: projectId,
    parent_id: parentId,
    name: `${id}.png`,
    content_type: contentType
  }).save();
};

describe("assets.recursive synthetic Home project scope", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
  });

  it("returns only the selected project's descendants beneath Home", async () => {
    await saveAsset("a-home-null", "project-a", null);
    await saveAsset("a-home-id", "project-a", USER_ID);
    await saveAsset("a-folder", "project-a", USER_ID, "folder");
    await saveAsset("a-nested", "project-a", "a-folder");
    await saveAsset("b-home-null", "project-b", null);
    await saveAsset("b-home-id", "project-b", USER_ID);

    const result = await createCaller(makeCtx()).assets.recursive({
      id: USER_ID,
      project_id: "project-a"
    });
    expect(result.assets.map((asset) => asset.id).sort()).toEqual([
      "a-folder",
      "a-home-id",
      "a-home-null",
      "a-nested"
    ]);
  });
});
