/**
 * TextDocumentVersion model: whole-Markdown copies of a document (a text
 * asset), document editor PRD R11.
 *
 * `save_type` names the cause. `cause_id` ties a version to the agent turn or
 * workflow job that took it, so several writes in one turn or one run keep
 * one version: the state before the first of them.
 */

import { createHash } from "node:crypto";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { textDocumentVersions } from "./schema/text-document-versions.js";

export type TextDocumentSaveType =
  | "agent_turn"
  | "workflow_run"
  | "manual"
  | "autosave"
  | "restore";

export const TEXT_DOCUMENT_SAVE_TYPES: readonly TextDocumentSaveType[] = [
  "agent_turn",
  "workflow_run",
  "manual",
  "autosave",
  "restore"
];

/** Hex SHA-256 of the Markdown, so equal copies are recognised. */
export function textDocumentContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** See JsScriptVersion: the unique (asset_id, version) index decides races. */
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

export class TextDocumentVersion extends DBModel {
  static override table = textDocumentVersions;

  declare id: string;
  declare asset_id: string;
  declare user_id: string;
  declare name: string | null;
  declare version: number;
  declare save_type: string;
  declare cause_id: string | null;
  declare content: string;
  declare content_hash: string;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.name ??= null;
    this.version ??= 1;
    this.save_type ??= "manual";
    this.cause_id ??= null;
    this.created_at ??= new Date().toISOString();
  }

  /** Versions of a document, newest first. */
  static async listForAsset(
    assetId: string,
    opts: { limit?: number } = {}
  ): Promise<TextDocumentVersion[]> {
    const rows = await getPortableDb()
      .select()
      .from(textDocumentVersions)
      .where(eq(textDocumentVersions.asset_id, assetId))
      .orderBy(desc(textDocumentVersions.version))
      .limit(opts.limit ?? 100);
    return rows.map((row: Record<string, unknown>) => new TextDocumentVersion(row));
  }

  /** One version by document id and version number. */
  static async findByVersion(
    assetId: string,
    version: number
  ): Promise<TextDocumentVersion | null> {
    const [row] = await getPortableDb()
      .select()
      .from(textDocumentVersions)
      .where(
        and(
          eq(textDocumentVersions.asset_id, assetId),
          eq(textDocumentVersions.version, version)
        )
      )
      .limit(1);
    return row ? new TextDocumentVersion(row) : null;
  }

  /** The version a cause already took of a document, if any. */
  static async findByCause(
    assetId: string,
    causeId: string
  ): Promise<TextDocumentVersion | null> {
    const [row] = await getPortableDb()
      .select()
      .from(textDocumentVersions)
      .where(
        and(
          eq(textDocumentVersions.asset_id, assetId),
          eq(textDocumentVersions.cause_id, causeId)
        )
      )
      .orderBy(asc(textDocumentVersions.version))
      .limit(1);
    return row ? new TextDocumentVersion(row) : null;
  }

  static async nextVersion(assetId: string): Promise<number> {
    const rows = await getPortableDb()
      .select({ value: max(textDocumentVersions.version) })
      .from(textDocumentVersions)
      .where(eq(textDocumentVersions.asset_id, assetId));
    return Number(rows[0]?.value ?? 0) + 1;
  }

  /**
   * Record `content` as the next version of the document. With a `causeId`
   * that already took a version, that version is returned instead: one
   * version per agent turn or workflow run.
   */
  static async snapshot(input: {
    assetId: string;
    userId: string;
    content: string;
    saveType: TextDocumentSaveType;
    causeId?: string | null;
    name?: string | null;
  }): Promise<TextDocumentVersion> {
    if (input.causeId) {
      const taken = await TextDocumentVersion.findByCause(input.assetId, input.causeId);
      if (taken) return taken;
    }
    const row = {
      asset_id: input.assetId,
      user_id: input.userId,
      name: input.name ?? null,
      save_type: input.saveType,
      cause_id: input.causeId ?? null,
      content: input.content,
      content_hash: textDocumentContentHash(input.content),
      created_at: new Date().toISOString()
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const version = await TextDocumentVersion.nextVersion(input.assetId);
      try {
        return await TextDocumentVersion.create<TextDocumentVersion>({
          ...row,
          id: createTimeOrderedUuid(),
          version
        });
      } catch (error) {
        if (attempt === 1 || !isUniqueViolation(error)) throw error;
      }
    }
    throw new Error(`Failed to snapshot document ${input.assetId}`);
  }

  /**
   * Keep the newest `keep` interval checkpoints and drop the rest (PRD Q6).
   * Versions of any other cause are what a person or a turn asked to keep.
   */
  static async pruneAutosaves(assetId: string, keep: number): Promise<void> {
    const db = getPortableDb();
    const rows = await db
      .select({ id: textDocumentVersions.id })
      .from(textDocumentVersions)
      .where(
        and(
          eq(textDocumentVersions.asset_id, assetId),
          eq(textDocumentVersions.save_type, "autosave")
        )
      )
      .orderBy(asc(textDocumentVersions.version));
    const excess = rows.length - Math.max(0, keep);
    for (const row of rows.slice(0, Math.max(0, excess))) {
      await db.delete(textDocumentVersions).where(eq(textDocumentVersions.id, row.id));
    }
  }

  /** Update the label of one stored version, returning the updated row or null when absent. */
  static async renameVersion(
    assetId: string,
    version: number,
    name: string | null
  ): Promise<TextDocumentVersion | null> {
    const existing = await TextDocumentVersion.findByVersion(assetId, version);
    if (!existing) return null;
    await getPortableDb()
      .update(textDocumentVersions)
      .set({ name })
      .where(
        and(
          eq(textDocumentVersions.asset_id, assetId),
          eq(textDocumentVersions.version, version)
        )
      );
    existing.name = name;
    return existing;
  }

  /** Delete one stored version. Returns true when a row existed and was deleted. */
  static async deleteVersion(
    assetId: string,
    version: number
  ): Promise<boolean> {
    const existing = await TextDocumentVersion.findByVersion(assetId, version);
    if (!existing) return false;
    await getPortableDb()
      .delete(textDocumentVersions)
      .where(
        and(
          eq(textDocumentVersions.asset_id, assetId),
          eq(textDocumentVersions.version, version)
        )
      );
    return true;
  }

  /** Delete every version of a document. */
  static async deleteForAsset(assetId: string): Promise<void> {
    await getPortableDb()
      .delete(textDocumentVersions)
      .where(eq(textDocumentVersions.asset_id, assetId));
  }
}
