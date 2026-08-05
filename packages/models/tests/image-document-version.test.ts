/**
 * Tests for the ImageDocumentVersion model.
 *
 * Covers: snapshot field copying and version assignment, listForDocument
 * ordering/filtering/limit, findByVersion, autosave pruning, bulk delete, and
 * the unique-index retry when two writers pick the same version number.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { ImageDocument } from "../src/image-document.js";
import { ImageDocumentVersion } from "../src/image-document-version.js";

const DOC = JSON.stringify({
  sketch: { version: 3, layers: [] },
  layerBindings: []
});

async function createDocument(id = "doc-1"): Promise<ImageDocument> {
  return ImageDocument.create<ImageDocument>({
    id,
    user_id: "user-1",
    project_id: "proj-1",
    name: "My sketch",
    width: 1280,
    height: 720,
    background_color: "#101010",
    document: DOC
  });
}

describe("ImageDocumentVersion model", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  it("snapshot copies the document fields and starts at version 1", async () => {
    const doc = await createDocument();
    const snap = await ImageDocumentVersion.snapshot(doc, {
      saveType: "manual",
      name: "before edit"
    });

    expect(snap.image_document_id).toBe(doc.id);
    expect(snap.user_id).toBe("user-1");
    expect(snap.name).toBe("before edit");
    expect(snap.save_type).toBe("manual");
    expect(snap.width).toBe(1280);
    expect(snap.height).toBe(720);
    expect(snap.background_color).toBe("#101010");
    expect(snap.document).toBe(DOC);
    expect(snap.version).toBe(1);
    expect(snap.id).toBeTruthy();
    expect(snap.created_at).toBeTruthy();
  });

  it("snapshot assigns monotonically increasing versions per document", async () => {
    const doc = await createDocument();
    const other = await createDocument("doc-2");

    const first = await ImageDocumentVersion.snapshot(doc, {
      saveType: "manual"
    });
    const second = await ImageDocumentVersion.snapshot(doc, {
      saveType: "autosave"
    });
    const otherFirst = await ImageDocumentVersion.snapshot(other, {
      saveType: "manual"
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.name).toBeNull();
    // Versions are per document, not global.
    expect(otherFirst.version).toBe(1);
    expect(await ImageDocumentVersion.nextVersion(doc.id)).toBe(3);
  });

  it("retries once when a concurrent writer takes the version number", async () => {
    const doc = await createDocument();
    await ImageDocumentVersion.snapshot(doc, { saveType: "manual" });

    // Stand in for the racing writer: nextVersion() reports 2, but by the time
    // the insert runs version 2 is already taken, so the unique index rejects
    // it and the retry lands on 3.
    const original = ImageDocumentVersion.nextVersion;
    let calls = 0;
    ImageDocumentVersion.nextVersion = async (imageDocumentId: string) => {
      const next = await original.call(ImageDocumentVersion, imageDocumentId);
      if (calls++ === 0) {
        await ImageDocumentVersion.create<ImageDocumentVersion>({
          image_document_id: imageDocumentId,
          user_id: "user-2",
          version: next,
          save_type: "manual",
          document: DOC
        });
      }
      return next;
    };

    try {
      const snap = await ImageDocumentVersion.snapshot(doc, {
        saveType: "manual"
      });
      expect(snap.version).toBe(3);
      expect(calls).toBe(2);
    } finally {
      ImageDocumentVersion.nextVersion = original;
    }
  });

  it("rethrows errors that are not unique-constraint violations", async () => {
    const doc = await createDocument();
    const original = ImageDocumentVersion.nextVersion;
    ImageDocumentVersion.nextVersion = async () => {
      throw new Error("db is on fire");
    };
    try {
      await expect(
        ImageDocumentVersion.snapshot(doc, { saveType: "manual" })
      ).rejects.toThrow("db is on fire");
    } finally {
      ImageDocumentVersion.nextVersion = original;
    }
  });

  it("listForDocument returns newest first and honours limit and saveType", async () => {
    const doc = await createDocument();
    await ImageDocumentVersion.snapshot(doc, { saveType: "manual" });
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" });
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" });
    await ImageDocumentVersion.snapshot(doc, { saveType: "restore" });
    // A sibling document's versions must not leak in.
    const other = await createDocument("doc-2");
    await ImageDocumentVersion.snapshot(other, { saveType: "manual" });

    const all = await ImageDocumentVersion.listForDocument(doc.id);
    expect(all.map((v: ImageDocumentVersion) => v.version)).toEqual([
      4, 3, 2, 1
    ]);

    const limited = await ImageDocumentVersion.listForDocument(doc.id, {
      limit: 2
    });
    expect(limited.map((v: ImageDocumentVersion) => v.version)).toEqual([4, 3]);

    const autosaves = await ImageDocumentVersion.listForDocument(doc.id, {
      saveType: "autosave"
    });
    expect(autosaves.map((v: ImageDocumentVersion) => v.version)).toEqual([
      3, 2
    ]);
  });

  it("findByVersion returns the row or null", async () => {
    const doc = await createDocument();
    await ImageDocumentVersion.snapshot(doc, { saveType: "manual" });

    const found = await ImageDocumentVersion.findByVersion(doc.id, 1);
    expect(found?.version).toBe(1);
    expect(found?.image_document_id).toBe(doc.id);

    expect(await ImageDocumentVersion.findByVersion(doc.id, 99)).toBeNull();
    expect(await ImageDocumentVersion.findByVersion("nope", 1)).toBeNull();
  });

  it("pruneAutosaves drops the oldest autosaves and keeps manual and restore", async () => {
    const doc = await createDocument();
    await ImageDocumentVersion.snapshot(doc, { saveType: "manual" }); // v1
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" }); // v2
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" }); // v3
    await ImageDocumentVersion.snapshot(doc, { saveType: "restore" }); // v4
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" }); // v5

    await ImageDocumentVersion.pruneAutosaves(doc.id, 1);

    const remaining = await ImageDocumentVersion.listForDocument(doc.id);
    expect(remaining.map((v: ImageDocumentVersion) => v.version)).toEqual([
      5, 4, 1
    ]);
  });

  it("pruneAutosaves is a no-op when under the limit", async () => {
    const doc = await createDocument();
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" });
    await ImageDocumentVersion.pruneAutosaves(doc.id, 5);
    expect((await ImageDocumentVersion.listForDocument(doc.id)).length).toBe(1);
  });

  it("deleteForDocument removes only that document's versions", async () => {
    const doc = await createDocument();
    const other = await createDocument("doc-2");
    await ImageDocumentVersion.snapshot(doc, { saveType: "manual" });
    await ImageDocumentVersion.snapshot(doc, { saveType: "autosave" });
    await ImageDocumentVersion.snapshot(other, { saveType: "manual" });

    await ImageDocumentVersion.deleteForDocument(doc.id);

    expect(await ImageDocumentVersion.listForDocument(doc.id)).toEqual([]);
    expect((await ImageDocumentVersion.listForDocument(other.id)).length).toBe(
      1
    );
  });
});
