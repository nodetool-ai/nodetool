import { eq, desc, and, sql } from "drizzle-orm";
import type {
  SketchDocumentLike,
  LayerWorkflowBinding
} from "@nodetool-ai/image-editor";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  createTimeOrderedUuid,
  nextUpdatedAtAfter
} from "./base-model.js";
import { getPortableDb } from "./db.js";
import { imageDocuments } from "./schema/image-documents.js";
import { ImageDocumentVersion } from "./image-document-version.js";
import { removeDocumentSharing } from "./document-sharing.js";
import { changingAccess } from "./access-epoch.js";
import {
  DocumentFileBinding,
  etagWithoutFileState,
  type DocumentFileFields
} from "./document-file-binding.js";
import type {
  DocumentFileLocation,
  DocumentFileSync
} from "./document-file-sync.js";

export interface ImageDocumentData {
  sketch: SketchDocumentLike;
  layerBindings: LayerWorkflowBinding[];
}

export interface ImageDocumentResponse {
  id: string;
  projectId: string;
  workflowId?: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  document: ImageDocumentData;
  thumbnailAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageDocumentMutationResult<T> {
  document: ImageDocument;
  result: T;
}

type ImageDocumentMutationMeta<T> =
  | ModelChangeMeta
  | ((result: T) => ModelChangeMeta | undefined);

export class ImageDocumentConflictError extends Error {
  constructor(id: string) {
    super(`Image document ${id} was modified concurrently`);
    this.name = "ImageDocumentConflictError";
  }
}

function assertValidDocumentData(data: ImageDocumentData): void {
  if (!data.sketch || !Array.isArray(data.layerBindings)) {
    throw new Error("document must contain sketch and layerBindings");
  }
}

export class ImageDocument extends DBModel {
  static override table = imageDocuments;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare workflow_id: string | null;
  declare name: string;
  declare width: number;
  declare height: number;
  declare background_color: string;
  declare document: string;
  declare thumbnail_asset_id: string | null;
  /** The sketch's file, relative to its project's folder. */
  declare file_path: string | null;
  /**
   * SHA-256 of the sketch's zip as NodeTool last wrote or imported it. Any
   * other hash means an edit NodeTool has not seen.
   */
  declare file_hash: string | null;
  /** What the last reconcile found wrong with the file, or null. */
  declare file_error: string | null;
  declare created_at: string;
  declare revision: number;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.workflow_id ??= null;
    this.width ??= 1024;
    this.height ??= 1024;
    this.background_color ??= "#ffffff";
    this.document ??= JSON.stringify({
      sketch: {
        version: 3,
        canvas: { width: 1024, height: 1024, backgroundColor: "#ffffff" },
        layers: [
          {
            id: "layer-1",
            name: "Layer 1",
            type: "raster",
            visible: true,
            opacity: 1,
            locked: false,
            alphaLock: false,
            blendMode: "normal",
            data: null,
            transform: { x: 0, y: 0 },
            contentBounds: {
              x: 0,
              y: 0,
              width: 1024,
              height: 1024
            },
            effects: []
          }
        ],
        activeLayerId: "layer-1",
        maskLayerId: null,
        activeTool: "brush",
        viewport: {
          zoom: 1,
          pan: { x: 0, y: 0 }
        },
        history: [],
        historyIndex: -1
      },
      layerBindings: []
    });
    this.thumbnail_asset_id ??= null;
    this.created_at ??= now;
    this.revision ??= 0;
    this.file_path ??= null;
    this.file_hash ??= null;
    this.file_error ??= null;
    this.updated_at ??= now;
    imageDocumentFiles.remember(this);
  }

  override async delete(): Promise<void> {
    await imageDocumentFiles.deleting(this, async () => {
      await super.delete();
      return this;
    });
  }

  /** The etag of the sketch, without the state of its file. */
  override getEtag(): string {
    return etagWithoutFileState(this.toRow());
  }

  /** Every create and save of a sketch row writes its file afterwards. */
  protected override async persist(event: ModelChangeEvent): Promise<this> {
    const previous = await imageDocumentFiles.beforePersist(this);
    await super.persist(event);
    await this.syncFile(previous);
    return this;
  }

  /**
   * Write the file of this row, which a caller just wrote without `save()`.
   * `previous` is the file the row had in the project it left, if it moved.
   */
  async syncFile(previous: DocumentFileLocation | null = null): Promise<void> {
    await imageDocumentFiles.saved(this, previous);
  }

  /** Record the file state without touching `updated_at`. */
  static setFileState(id: string, state: DocumentFileFields): Promise<void> {
    return imageDocumentFiles.setFileState(id, state);
  }

  /** Whether a sketch of any user has exactly this ID. */
  static existsExactly(id: string): Promise<boolean> {
    return imageDocumentFiles.existsExactly(id);
  }

  /** The sketches whose files belong in the folder of `projectIds`. */
  static listForProjects(
    userId: string,
    projectIds: readonly string[]
  ): Promise<ImageDocument[]> {
    return imageDocumentFiles.listForProjects(userId, projectIds);
  }

  /** The projects that hold a sketch whose file was never written. */
  static projectsWithUnwrittenFiles(
    userId?: string
  ): Promise<Array<{ user_id: string; project_id: string; count: number }>> {
    return imageDocumentFiles.projectsWithUnwrittenFiles(userId);
  }

  /**
   * Insert a sketch only when no row has its ID. Returns null when a row
   * with that ID exists, which is left exactly as it is, whoever owns it.
   */
  static async insertNew(
    data: Record<string, unknown>
  ): Promise<ImageDocument | null> {
    const row = new ImageDocument(data);
    row.beforeSave();
    return imageDocumentFiles.insertNew(row);
  }

  /**
   * Point a sketch the caller owns at `projectId` and take its file along.
   * Returns false when the caller owns no such sketch.
   */
  static moveToProject(
    userId: string,
    id: string,
    projectId: string
  ): Promise<boolean> {
    return imageDocumentFiles.moveToProject(userId, id, projectId);
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    // Resource refs carry this; every write must move it forward.
    this.revision = (this.revision ?? 0) + 1;
    assertValidDocumentData(JSON.parse(this.document) as ImageDocumentData);
  }

  toDocumentData(): ImageDocumentData {
    return JSON.parse(this.document) as ImageDocumentData;
  }

  toResponse(): ImageDocumentResponse {
    const doc = this.toDocumentData();
    return {
      id: this.id,
      projectId: this.project_id,
      workflowId: this.workflow_id ?? undefined,
      name: this.name,
      width: this.width,
      height: this.height,
      backgroundColor: this.background_color,
      document: doc,
      thumbnailAssetId: this.thumbnail_asset_id ?? undefined,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  /**
   * Delete a image document the caller owns, and everything that hung off it.
   *
   * The ownership test lives here rather than in each caller because there are
   * two of them — the tRPC route and the sandbox's `delete_sketch`
   * capability — and a delete is not a place for two copies of one rule.
   * Missing and not-yours are the same answer, so a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    return changingAccess([{ kind: "sketch", id }], async () => {
      const row = await ImageDocument.findById(id);
      if (!row || row.user_id !== userId) return false;
      await row.delete();
      await removeDocumentSharing("sketch", row.id);
      // Belt-and-braces with the FK cascade: version rows outliving their
      // document would be unreachable garbage.
      await ImageDocumentVersion.deleteForDocument(row.id);
      return true;
    });
  }

  static async findById(id: string): Promise<ImageDocument | null> {
    return ImageDocument.get<ImageDocument>(id);
  }

  static async listByUser(
    userId: string,
    limit = 50
  ): Promise<ImageDocument[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(imageDocuments)
      .where(eq(imageDocuments.user_id, userId))
      .orderBy(desc(imageDocuments.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new ImageDocument(r));
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<ImageDocument[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(imageDocuments)
      .where(
        and(
          eq(imageDocuments.project_id, projectId),
          eq(imageDocuments.user_id, userId)
        )
      )
      .orderBy(desc(imageDocuments.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new ImageDocument(r));
  }

  static async updateDoc(
    id: string,
    fields: Partial<{
      name: string;
      width: number;
      height: number;
      background_color: string;
      workflow_id: string | null;
      document: string;
      thumbnail_asset_id: string | null;
    }>
  ): Promise<ImageDocument | null> {
    const doc = await ImageDocument.get<ImageDocument>(id);
    if (!doc) return null;

    if (fields.document !== undefined) {
      JSON.parse(fields.document);
    }

    Object.assign(doc, fields);
    await doc.save();
    return doc;
  }

  /**
   * Atomic compare-and-swap for a client-driven save that may touch scalar
   * fields and/or the serialized document in one write. Applies only when the
   * row's `updated_at` still equals `expectedUpdatedAt`; returns null on
   * conflict so the caller can report it instead of clobbering a concurrent
   * change (the TOCTOU that `updateDoc` + a manual updated_at check left open).
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: Partial<{
      name: string;
      width: number;
      height: number;
      background_color: string;
      workflow_id: string | null;
      document: string;
      thumbnail_asset_id: string | null;
    }>,
    meta?: ModelChangeMeta
  ): Promise<ImageDocument | null> {
    if (fields.document !== undefined) {
      assertValidDocumentData(JSON.parse(fields.document) as ImageDocumentData);
    }
    const db = getPortableDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(imageDocuments)
      .set({ ...fields, revision: sql`${imageDocuments.revision} + 1`, updated_at: now })
      .where(
        and(
          eq(imageDocuments.id, id),
          eq(imageDocuments.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new ImageDocument(row);
    await updated.syncFile();
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }

  static async updateDocumentDataIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    data: ImageDocumentData,
    meta?: ModelChangeMeta
  ): Promise<ImageDocument | null> {
    assertValidDocumentData(data);
    const db = getPortableDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(imageDocuments)
      .set({
        document: JSON.stringify(data),
        revision: sql`${imageDocuments.revision} + 1`,
        updated_at: now
      })
      .where(
        and(
          eq(imageDocuments.id, id),
          eq(imageDocuments.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) {
      return null;
    }

    const updated = new ImageDocument(row);
    await updated.syncFile();
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }

  static async mutateDocumentData<T>(
    id: string,
    mutator: (
      data: ImageDocumentData,
      document: ImageDocument
    ) => T | Promise<T>,
    maxRetries = 5,
    meta?: ImageDocumentMutationMeta<T>
  ): Promise<ImageDocumentMutationResult<T> | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const doc = await ImageDocument.get<ImageDocument>(id);
      if (!doc) {
        return null;
      }

      const data = doc.toDocumentData();
      const result = await mutator(data, doc);
      // A failed CAS attempt never notifies observers, so its attempt-specific
      // metadata is discarded along with its document data.
      const changeMeta =
        typeof meta === "function" ? meta(result) : meta;
      const updated = await ImageDocument.updateDocumentDataIfUnchanged(
        id,
        doc.updated_at,
        data,
        changeMeta
      );
      if (updated) {
        return { document: updated, result };
      }
    }

    throw new ImageDocumentConflictError(id);
  }
}

const imageDocumentFiles = new DocumentFileBinding<ImageDocument>(
  imageDocuments,
  (row) => new ImageDocument(row)
);

/**
 * Install what writes a sketch's file in its project folder after the row is
 * saved, and deletes it after the row is deleted. See {@link DocumentFileSync}.
 */
export function setImageDocumentFileSync(
  sync: DocumentFileSync<ImageDocument> | null
): void {
  imageDocumentFiles.sync = sync;
}
