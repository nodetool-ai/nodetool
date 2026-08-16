/**
 * ImageDocumentVersion model — immutable snapshots of a sketch.
 *
 * A snapshot carries the document plus the canvas settings it was written
 * against, so restoring one restores what the editor actually showed. Manual
 * saves, autosaves and the pre-restore snapshot are told apart by `save_type`;
 * only autosaves are ever pruned.
 */

import { eq, and, desc, asc, max } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { imageDocumentVersions } from "./schema/image-document-versions.js";
import type { ImageDocument } from "./image-document.js";

export type ImageDocumentSaveType = "manual" | "autosave" | "restore";

/**
 * The fields {@link ImageDocumentVersion.snapshot} copies off a document, so a
 * caller holding only a row can pass it without faking a model instance.
 */
export type ImageDocumentSnapshotSource = Pick<
  ImageDocument,
  "id" | "user_id" | "width" | "height" | "background_color" | "document"
>;

/**
 * Whether an insert lost the race for a version number. SQLite and both
 * PostgreSQL drivers word it differently; all three mean the unique index on
 * (image_document_id, version) rejected the row.
 */
function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "23505" || err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  const message = String(err.message ?? "");
  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("duplicate key value")
  );
}

export class ImageDocumentVersion extends DBModel {
  static override table = imageDocumentVersions;

  declare id: string;
  declare image_document_id: string;
  declare user_id: string;
  declare name: string | null;
  declare version: number;
  declare save_type: string;
  declare width: number;
  declare height: number;
  declare background_color: string;
  declare document: string;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.name ??= null;
    this.version ??= 1;
    this.save_type ??= "manual";
    this.width ??= 1024;
    this.height ??= 1024;
    this.background_color ??= "#ffffff";
    this.created_at ??= new Date().toISOString();
  }

  /** Versions of a sketch, newest first. */
  static async listForDocument(
    imageDocumentId: string,
    opts: { limit?: number; saveType?: string } = {}
  ): Promise<ImageDocumentVersion[]> {
    const { limit = 100, saveType } = opts;
    const db = getDb();
    const where =
      saveType === undefined
        ? eq(imageDocumentVersions.image_document_id, imageDocumentId)
        : and(
            eq(imageDocumentVersions.image_document_id, imageDocumentId),
            eq(imageDocumentVersions.save_type, saveType)
          );
    const rows = await db
      .select()
      .from(imageDocumentVersions)
      .where(where)
      .orderBy(desc(imageDocumentVersions.version))
      .limit(limit);
    return rows.map(
      (r: Record<string, unknown>) => new ImageDocumentVersion(r)
    );
  }

  /** One version by sketch id + version number. */
  static async findByVersion(
    imageDocumentId: string,
    version: number
  ): Promise<ImageDocumentVersion | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(imageDocumentVersions)
      .where(
        and(
          eq(imageDocumentVersions.image_document_id, imageDocumentId),
          eq(imageDocumentVersions.version, version)
        )
      )
      .limit(1);
    return row
      ? new ImageDocumentVersion(row)
      : null;
  }

  /** The next version number for a sketch (max existing + 1). */
  static async nextVersion(imageDocumentId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ value: max(imageDocumentVersions.version) })
      .from(imageDocumentVersions)
      .where(eq(imageDocumentVersions.image_document_id, imageDocumentId));
    return Number(rows[0]?.value ?? 0) + 1;
  }

  /**
   * Snapshot a sketch as the next version.
   *
   * The version number is read and written in two steps, so two writers can
   * pick the same one. The unique index on (image_document_id, version) is
   * what decides: the loser's insert fails, re-reads the number, and tries
   * once more before giving up.
   */
  static async snapshot(
    doc: ImageDocumentSnapshotSource,
    opts: {
      saveType: ImageDocumentSaveType;
      name?: string | null;
    }
  ): Promise<ImageDocumentVersion> {
    const row = {
      image_document_id: doc.id,
      user_id: doc.user_id,
      name: opts.name ?? null,
      save_type: opts.saveType,
      width: doc.width,
      height: doc.height,
      background_color: doc.background_color,
      document: doc.document,
      created_at: new Date().toISOString()
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const version = await ImageDocumentVersion.nextVersion(doc.id);
      try {
        return await ImageDocumentVersion.create<ImageDocumentVersion>({
          ...row,
          id: createTimeOrderedUuid(),
          version
        });
      } catch (error) {
        if (attempt === 1 || !isUniqueViolation(error)) throw error;
      }
    }

    // Unreachable: the loop either returns or rethrows.
    throw new Error(`Failed to snapshot image document ${doc.id}`);
  }

  /**
   * Drop the oldest autosaves beyond `maxAutosaves`. Manual and restore
   * snapshots are never touched — they are what a user asked to keep.
   */
  static async pruneAutosaves(
    imageDocumentId: string,
    maxAutosaves: number
  ): Promise<void> {
    const db = getDb();
    const rows = await db
      .select({ id: imageDocumentVersions.id })
      .from(imageDocumentVersions)
      .where(
        and(
          eq(imageDocumentVersions.image_document_id, imageDocumentId),
          eq(imageDocumentVersions.save_type, "autosave")
        )
      )
      .orderBy(asc(imageDocumentVersions.version));

    const excess = rows.length - Math.max(0, maxAutosaves);
    if (excess <= 0) return;

    for (const row of rows.slice(0, excess)) {
      await db
        .delete(imageDocumentVersions)
        .where(eq(imageDocumentVersions.id, row.id));
    }
  }

  /**
   * Delete every version of a sketch. Called when the document is deleted:
   * SQLite only enforces the foreign key when `PRAGMA foreign_keys` is on, so
   * the cascade alone cannot be relied on.
   */
  static async deleteForDocument(imageDocumentId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(imageDocumentVersions)
      .where(eq(imageDocumentVersions.image_document_id, imageDocumentId));
  }
}
