import { beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  emptyScriptDocument,
  Script,
  Storyboard,
  TimelineSequence,
  Project,
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
  beforeEach(async () => {
    initTestDb();
    await Project.create<Project>({
      id: sourceProjectId,
      user_id: userId,
      name: "Source"
    });
    await Project.create<Project>({
      id: destinationProjectId,
      user_id: userId,
      name: "Destination"
    });
  });

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
    if (!copiedAsset) throw new Error("Copied asset was not persisted");
    copiedAsset.name = "Destination reference";
    await copiedAsset.save();
    expect((await Asset.find(userId, reference.id))?.name).toBe("Reference");
    await storage.delete(
      storage.uriForKey(
        getAssetStorageKey(userId, reference.id, reference.content_type)
      )
    );
    await reference.delete();
    await board.delete();
    expect(
      await storage.retrieve(
        storage.uriForKey(
          getAssetStorageKey(userId, copiedAsset.id, "image/png")
        )
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
    expect(
      (await Storyboard.listByProject(destinationProjectId, userId)).length
    ).toBe(0);
  });

  it("removes staged objects when the destination is deleted before commit", async () => {
    class DeletingStorage extends InMemoryStorageAdapter {
      armed = false;

      override async store(
        key: string,
        data: Uint8Array,
        contentType?: string
      ): Promise<string> {
        const uri = await super.store(key, data, contentType);
        if (this.armed) {
          this.armed = false;
          await Project.deleteOwned(userId, destinationProjectId);
        }
        return uri;
      }
    }

    const storage = new DeletingStorage();
    const reference = await saveAsset(storage, {
      content: new Uint8Array([7, 8, 9])
    });
    const board = await Storyboard.create<Storyboard>({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Board",
      document: JSON.stringify(storyboardDocument(reference.id))
    });
    storage.armed = true;

    await expect(
      copyProjectDocument({
        userId,
        type: "storyboard",
        id: board.id,
        destinationProjectId,
        storage
      })
    ).rejects.toThrow("Destination project is unavailable");

    expect(
      await Storyboard.listByProject(destinationProjectId, userId)
    ).toEqual([]);
    expect((await storage.list("")).entries).toHaveLength(1);
  });

  it("rewrites an extension-bearing asset locator without requiring a second asset", async () => {
    const storage = new InMemoryStorageAdapter();
    const reference = await saveAsset(storage, {
      content: new Uint8Array([4, 5, 6])
    });
    const document = storyboardDocument("");
    document.shots = [
      {
        type: "shot",
        id: "shot-1",
        index: 0,
        action: "show the reference",
        status: "draft",
        keyframe: { type: "image", uri: `asset://${reference.id}.png` }
      }
    ];
    const board = new Storyboard({
      user_id: userId,
      project_id: sourceProjectId,
      name: "URI board",
      document: JSON.stringify(document)
    });
    await board.save();

    const copied = await copyProjectDocument({
      userId,
      type: "storyboard",
      id: board.id,
      destinationProjectId,
      storage
    });

    const copiedBoard = await Storyboard.findById(copied.id);
    const keyframe = copiedBoard?.toDocument().shots[0]?.keyframe;
    expect(keyframe?.uri).toBeDefined();
    expect(keyframe?.uri).not.toBe(`asset://${reference.id}.png`);
    expect(copied.copiedAssets).toBe(1);
  });

  it("rejects unsupported workflow bindings before it copies anything", async () => {
    const storage = new InMemoryStorageAdapter();
    const document = {
      ...storyboardDocument(""),
      workflowId: "workflow-1"
    };
    const board = new Storyboard({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Workflow board",
      document: JSON.stringify(document)
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
    expect(
      (await Storyboard.listByProject(destinationProjectId, userId)).length
    ).toBe(0);
  });

  it("copies linked document cycles once and remaps both directions", async () => {
    const storage = new InMemoryStorageAdapter();
    const script = new Script({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Script",
      document: JSON.stringify(emptyScriptDocument())
    });
    await script.save();
    const timeline = new TimelineSequence({
      user_id: userId,
      project_id: sourceProjectId,
      name: "Timeline",
      document: JSON.stringify({
        tracks: [],
        clips: [],
        markers: [],
        scriptId: script.id
      })
    });
    await timeline.save();
    script.timeline_id = timeline.id;
    await script.save();

    const copied = await copyProjectDocument({
      userId,
      type: "script",
      id: script.id,
      destinationProjectId,
      storage
    });

    expect(copied.copiedDocuments).toBe(2);
    const copiedScript = await Script.findById(copied.id);
    const copiedTimeline = await TimelineSequence.findById(
      copiedScript?.timeline_id ?? ""
    );
    expect(copiedTimeline?.toDocument()).toMatchObject({ scriptId: copied.id });
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
