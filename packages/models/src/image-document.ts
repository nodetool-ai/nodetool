import { eq, desc, and } from "drizzle-orm";
import type {
  SketchDocumentLike,
  LayerWorkflowBinding
} from "@nodetool-ai/image-editor";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { imageDocuments } from "./schema/image-documents.js";

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

function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
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
  declare created_at: string;
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
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
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

  static async findById(id: string): Promise<ImageDocument | null> {
    return ImageDocument.get<ImageDocument>(id);
  }

  static async listByUser(
    userId: string,
    limit = 50
  ): Promise<ImageDocument[]> {
    const db = getDb();
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
    const db = getDb();
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
    }>
  ): Promise<ImageDocument | null> {
    if (fields.document !== undefined) {
      assertValidDocumentData(JSON.parse(fields.document) as ImageDocumentData);
    }
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(imageDocuments)
      .set({ ...fields, updated_at: now })
      .where(
        and(
          eq(imageDocuments.id, id),
          eq(imageDocuments.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const updated = new ImageDocument(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }

  static async updateDocumentDataIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    data: ImageDocumentData
  ): Promise<ImageDocument | null> {
    assertValidDocumentData(data);
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(imageDocuments)
      .set({
        document: JSON.stringify(data),
        updated_at: now
      })
      .where(
        and(
          eq(imageDocuments.id, id),
          eq(imageDocuments.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const updated = new ImageDocument(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }

  static async mutateDocumentData<T>(
    id: string,
    mutator: (
      data: ImageDocumentData,
      document: ImageDocument
    ) => T | Promise<T>,
    maxRetries = 5
  ): Promise<ImageDocumentMutationResult<T> | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const doc = await ImageDocument.get<ImageDocument>(id);
      if (!doc) {
        return null;
      }

      const data = doc.toDocumentData();
      const result = await mutator(data, doc);
      const updated = await ImageDocument.updateDocumentDataIfUnchanged(
        id,
        doc.updated_at,
        data
      );
      if (updated) {
        return { document: updated, result };
      }
    }

    throw new ImageDocumentConflictError(id);
  }
}
