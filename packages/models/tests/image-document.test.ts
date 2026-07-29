import { describe, it, expect, beforeEach, vi } from "vitest";
import { getRawDb, initTestDb } from "../src/db.js";
import {
  ImageDocument,
  ImageDocumentConflictError,
  type ImageDocumentData
} from "../src/image-document.js";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

function makeDocument(): ImageDocumentData {
  return {
    sketch: {
      version: 1,
      canvas: { width: 1024, height: 1024 },
      layers: [],
      activeLayerId: ""
    },
    layerBindings: []
  };
}

function makeBinding(layerId: string): LayerWorkflowBinding {
  return {
    layerId,
    workflowId: `wf-${layerId}`,
    status: "draft",
    versions: []
  };
}

async function createDoc(
  userId = "u1",
  projectId = "p1",
  name = "Image Document"
): Promise<ImageDocument> {
  return ImageDocument.create<ImageDocument>({
    user_id: userId,
    project_id: projectId,
    name,
    document: JSON.stringify(makeDocument())
  });
}

describe("ImageDocument model", () => {
  beforeEach(() => {
    initTestDb();
    getRawDb().exec(`
      CREATE TABLE IF NOT EXISTS image_documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workflow_id TEXT,
        name TEXT NOT NULL,
        width INTEGER NOT NULL DEFAULT 1024,
        height INTEGER NOT NULL DEFAULT 1024,
        background_color TEXT NOT NULL DEFAULT '#ffffff',
        document TEXT NOT NULL,
        thumbnail_asset_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_image_document_user
        ON image_documents (user_id);
      CREATE INDEX IF NOT EXISTS idx_image_document_project
        ON image_documents (project_id);
      CREATE INDEX IF NOT EXISTS idx_image_document_updated
        ON image_documents (updated_at);
    `);
  });

  it("listByProject scopes by user before applying limit", async () => {
    await createDoc("other", "p1", "Other");
    await createDoc("u1", "p1", "Mine");

    const docs = await ImageDocument.listByProject("p1", "u1", 1);

    expect(docs).toHaveLength(1);
    expect(docs[0]!.user_id).toBe("u1");
    expect(docs[0]!.name).toBe("Mine");
  });

  it("updateDocumentDataIfUnchanged rejects stale writes", async () => {
    const doc = await createDoc();
    const originalUpdatedAt = doc.updated_at;

    const firstData = doc.toDocumentData();
    firstData.layerBindings.push(makeBinding("a"));
    const first = await ImageDocument.updateDocumentDataIfUnchanged(
      doc.id,
      originalUpdatedAt,
      firstData
    );
    expect(first).not.toBeNull();

    const staleData = doc.toDocumentData();
    staleData.layerBindings.push(makeBinding("b"));
    const stale = await ImageDocument.updateDocumentDataIfUnchanged(
      doc.id,
      originalUpdatedAt,
      staleData
    );

    expect(stale).toBeNull();
    const reloaded = await ImageDocument.findById(doc.id);
    expect(reloaded!.toDocumentData().layerBindings.map((b) => b.layerId)).toEqual([
      "a"
    ]);
  });

  it("updateFieldsIfUnchanged writes scalar fields + document atomically", async () => {
    const doc = await createDoc();
    const originalUpdatedAt = doc.updated_at;

    const data = doc.toDocumentData();
    data.layerBindings.push(makeBinding("a"));
    const updated = await ImageDocument.updateFieldsIfUnchanged(
      doc.id,
      originalUpdatedAt,
      { name: "Renamed", document: JSON.stringify(data) }
    );
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Renamed");
    expect(updated!.updated_at).not.toBe(originalUpdatedAt);
    expect(
      updated!.toDocumentData().layerBindings.map((b) => b.layerId)
    ).toEqual(["a"]);
  });

  it("updateFieldsIfUnchanged rejects a stale write instead of clobbering", async () => {
    const doc = await createDoc();
    const stale = doc.updated_at;

    // A concurrent save appends a layer binding and bumps updated_at.
    const concurrentData = doc.toDocumentData();
    concurrentData.layerBindings.push(makeBinding("from-job"));
    const first = await ImageDocument.updateFieldsIfUnchanged(doc.id, stale, {
      document: JSON.stringify(concurrentData)
    });
    expect(first).not.toBeNull();

    // The editor saves its stale full snapshot (without the job's binding).
    const staleSnapshot = makeDocument(); // empty layerBindings
    const second = await ImageDocument.updateFieldsIfUnchanged(doc.id, stale, {
      name: "Editor Save",
      document: JSON.stringify(staleSnapshot)
    });
    expect(second).toBeNull();

    // The job's binding survived — it was not clobbered.
    const reloaded = await ImageDocument.findById(doc.id);
    expect(
      reloaded!.toDocumentData().layerBindings.map((b) => b.layerId)
    ).toEqual(["from-job"]);
  });

  it("mutateDocumentData retries CAS conflicts against fresh data", async () => {
    const doc = await createDoc();
    const originalUpdate = ImageDocument.updateDocumentDataIfUnchanged;
    let calls = 0;
    const spy = vi
      .spyOn(ImageDocument, "updateDocumentDataIfUnchanged")
      .mockImplementation(async (id, expectedUpdatedAt, data) => {
        calls++;
        if (calls === 1) {
          const concurrent = await ImageDocument.findById(id);
          const concurrentData = concurrent!.toDocumentData();
          concurrentData.layerBindings.push(makeBinding("concurrent"));
          await originalUpdate.call(
            ImageDocument,
            id,
            expectedUpdatedAt,
            concurrentData
          );
          return null;
        }
        return originalUpdate.call(ImageDocument, id, expectedUpdatedAt, data);
      });

    const mutation = await ImageDocument.mutateDocumentData(doc.id, (data) => {
      data.layerBindings.push(makeBinding("new"));
      return "ok";
    });

    expect(mutation!.result).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(2);
    const reloaded = await ImageDocument.findById(doc.id);
    expect(reloaded!.toDocumentData().layerBindings.map((b) => b.layerId)).toEqual([
      "concurrent",
      "new"
    ]);
  });

  it("mutateDocumentData throws after repeated CAS conflicts", async () => {
    const doc = await createDoc();
    vi.spyOn(ImageDocument, "updateDocumentDataIfUnchanged").mockResolvedValue(
      null
    );

    await expect(
      ImageDocument.mutateDocumentData(
        doc.id,
        (data) => {
          data.layerBindings.push(makeBinding("new"));
        },
        2
      )
    ).rejects.toBeInstanceOf(ImageDocumentConflictError);
  });
});
