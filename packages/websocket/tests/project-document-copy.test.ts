import { beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  Storyboard,
  initTestDb,
  type StoryboardDocument
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import {
  copyProjectDocument,
  ProjectCopyError
} from "../src/lib/project-document-copy.js";

const userId = "copy-user";
const sourceProjectId = "source";
const destinationProjectId = "destination";

const storyboardDocument = (entityId: string): StoryboardDocument => ({
  screenplay: null,
  shots: [],
  brief: "",
  style: "",
  entityIds: [entityId, entityId],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null
});

async function saveAsset(
  storage: InMemoryStorageAdapter,
  values: {
    id?: string;
    metadata?: Record<string, unknown> | null;
    content?: Uint8Array;
  } = {}
): Promise<Asset> {
  const asset = new Asset({
    id: values.id,
    user_id: userId,
    project_id: sourceProjectId,
    name: "Reference",
    content_type: "image/png",
    metadata: values.metadata ?? null,
    size: values.content?.byteLength ?? null
  });
  await asset.save();
  if (values.content) {
    await storage.store(
      getAssetStorageKey(userId, asset.id, asset.content_type),
      values.content,
      asset.content_type
    );
  }
  return asset;
}

describe("copyProjectDocument", () => {
  beforeEach(() => initTestDb());

  it("copies repeated entity references once and gives the destination independent bytes", async () => {
    const storage = new InMemoryStorageAdapter();
    const reference = await saveAsset(storage, {
      content: new Uint8Array([1, 2, 3])
    });
    const board = new Storyboard({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Board",
      document: JSON.stringify(storyboardDocument(reference.id))
    });
    await board.save();

    const copied = await copyProjectDocument({
      userId,
      type: "storyboard",
      id: board.id,
      destinationProjectId,
      storage
    });

    expect(copied.copiedDocuments).toBe(1);
    expect(copied.copiedAssets).toBe(1);
    const copiedBoard = await Storyboard.findById(copied.id);
    const copiedEntityId = copiedBoard?.toDocument().entityIds[0];
    expect(copiedEntityId).toBeDefined();
    expect(copiedEntityId).not.toBe(reference.id);
    expect(copiedBoard?.toDocument().entityIds).toEqual([
      copiedEntityId,
      copiedEntityId
    ]);
    const copiedAsset = await Asset.find(userId, copiedEntityId ?? "");
    expect(copiedAsset?.project_id).toBe(destinationProjectId);
    expect(
      await storage.retrieve(
        getAssetStorageKey(userId, copiedEntityId ?? "", "image/png")
      )
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("fails before writing a visible copy when a required asset is unavailable", async () => {
    const storage = new InMemoryStorageAdapter();
    const reference = await saveAsset(storage);
    const board = new Storyboard({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Board",
      document: JSON.stringify(storyboardDocument(reference.id))
    });
    await board.save();

    await expect(
      copyProjectDocument({
        userId,
        type: "storyboard",
        id: board.id,
        destinationProjectId,
        storage
      })
    ).rejects.toBeInstanceOf(ProjectCopyError);
    expect((await Storyboard.listByProject(destinationProjectId, userId)).length).toBe(0);
  });

  it("traverses a large asset dependency graph without duplicate copies", async () => {
    const storage = new InMemoryStorageAdapter();
    const count = 1_200;
    let nextId: string | null = null;
    for (let index = count - 1; index >= 0; index -= 1) {
      const asset = await saveAsset(storage, {
        metadata: nextId ? { assetId: nextId } : null,
        content: new Uint8Array([index % 255])
      });
      nextId = asset.id;
    }
    const board = new Storyboard({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Large graph",
      document: JSON.stringify(storyboardDocument(nextId ?? ""))
    });
    await board.save();

    const copied = await copyProjectDocument({
      userId,
      type: "storyboard",
      id: board.id,
      destinationProjectId,
      storage
    });

    expect(copied.copiedAssets).toBe(count);
  });
});
