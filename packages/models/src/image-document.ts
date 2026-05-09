import { eq, desc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { imageDocuments } from "./schema/image-documents.js";

export interface ImageDocumentData {
  layers: unknown[];
  guides: unknown[];
  artboards: unknown[];
  activeLayerId: string | null;
  maskLayerId: string | null;
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
      layers: [],
      guides: [],
      artboards: [],
      activeLayerId: null,
      maskLayerId: null
    });
    this.thumbnail_asset_id ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
    const doc = JSON.parse(this.document);
    if (!Array.isArray(doc.layers)) {
      throw new Error("document must contain a layers array");
    }
  }

  toDocument(): ImageDocumentData {
    return JSON.parse(this.document) as ImageDocumentData;
  }

  fromDocument(doc: ImageDocumentData): void {
    this.document = JSON.stringify(doc);
  }

  toImageDocumentResponse(): {
    id: string;
    projectId: string;
    workflowId?: string;
    name: string;
    width: number;
    height: number;
    backgroundColor: string;
    document: string;
    thumbnailAssetId?: string;
    createdAt: string;
    updatedAt: string;
  } {
    return {
      id: this.id,
      projectId: this.project_id,
      workflowId: this.workflow_id ?? undefined,
      name: this.name,
      width: this.width,
      height: this.height,
      backgroundColor: this.background_color,
      document: this.document,
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
    return rows.map(
      (r: Record<string, unknown>) => new ImageDocument(r)
    );
  }

  static async listByProject(
    projectId: string,
    limit = 50
  ): Promise<ImageDocument[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(imageDocuments)
      .where(eq(imageDocuments.project_id, projectId))
      .orderBy(desc(imageDocuments.updated_at))
      .limit(limit);
    return rows.map(
      (r: Record<string, unknown>) => new ImageDocument(r)
    );
  }

  static async update(
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

  async touchUpdatedAt(): Promise<void> {
    this.updated_at = new Date().toISOString();
    await this.save();
  }
}
