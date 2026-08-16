/**
 * JsScriptVersion model — immutable snapshots of a JS script document.
 *
 * Manual saves, autosaves and the pre-restore snapshot are told apart by
 * `save_type`; only autosaves are ever pruned.
 */

import { eq, and, desc, asc, max } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { jsScriptVersions } from "./schema/js-script-versions.js";
import type { JsScript } from "./js-script.js";

export type JsScriptSaveType = "manual" | "autosave" | "restore";

/**
 * The fields {@link JsScriptVersion.snapshot} copies off a script, so a caller
 * holding only a row can pass it without faking a model instance.
 */
export type JsScriptSnapshotSource = Pick<
  JsScript,
  "id" | "user_id" | "document"
>;

/**
 * Whether an insert lost the race for a version number. SQLite and both
 * PostgreSQL drivers word it differently; all three mean the unique index on
 * (js_script_id, version) rejected the row.
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

export class JsScriptVersion extends DBModel {
  static override table = jsScriptVersions;

  declare id: string;
  declare js_script_id: string;
  declare user_id: string;
  declare name: string | null;
  declare version: number;
  declare save_type: string;
  declare document: string;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.name ??= null;
    this.version ??= 1;
    this.save_type ??= "manual";
    this.created_at ??= new Date().toISOString();
  }

  /** Versions of a script, newest first. */
  static async listForScript(
    jsScriptId: string,
    opts: { limit?: number; saveType?: string } = {}
  ): Promise<JsScriptVersion[]> {
    const { limit = 100, saveType } = opts;
    const db = getDb();
    const where =
      saveType === undefined
        ? eq(jsScriptVersions.js_script_id, jsScriptId)
        : and(
            eq(jsScriptVersions.js_script_id, jsScriptId),
            eq(jsScriptVersions.save_type, saveType)
          );
    const rows = await db
      .select()
      .from(jsScriptVersions)
      .where(where)
      .orderBy(desc(jsScriptVersions.version))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new JsScriptVersion(r));
  }

  /** One version by script id + version number. */
  static async findByVersion(
    jsScriptId: string,
    version: number
  ): Promise<JsScriptVersion | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jsScriptVersions)
      .where(
        and(
          eq(jsScriptVersions.js_script_id, jsScriptId),
          eq(jsScriptVersions.version, version)
        )
      )
      .limit(1);
    return row ? new JsScriptVersion(row) : null;
  }

  /** The next version number for a script (max existing + 1). */
  static async nextVersion(jsScriptId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ value: max(jsScriptVersions.version) })
      .from(jsScriptVersions)
      .where(eq(jsScriptVersions.js_script_id, jsScriptId));
    return Number(rows[0]?.value ?? 0) + 1;
  }

  /**
   * Snapshot a script as the next version.
   *
   * The version number is read and written in two steps, so two writers can
   * pick the same one. The unique index on (js_script_id, version) is what
   * decides: the loser's insert fails, re-reads the number, and tries once
   * more before giving up.
   */
  static async snapshot(
    script: JsScriptSnapshotSource,
    opts: {
      saveType: JsScriptSaveType;
      name?: string | null;
    }
  ): Promise<JsScriptVersion> {
    const row = {
      js_script_id: script.id,
      user_id: script.user_id,
      name: opts.name ?? null,
      save_type: opts.saveType,
      document: script.document,
      created_at: new Date().toISOString()
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const version = await JsScriptVersion.nextVersion(script.id);
      try {
        return await JsScriptVersion.create<JsScriptVersion>({
          ...row,
          id: createTimeOrderedUuid(),
          version
        });
      } catch (error) {
        if (attempt === 1 || !isUniqueViolation(error)) throw error;
      }
    }

    // Unreachable: the loop either returns or rethrows.
    throw new Error(`Failed to snapshot js script ${script.id}`);
  }

  /**
   * Drop the oldest autosaves beyond `maxAutosaves`. Manual and restore
   * snapshots are never touched — they are what a user asked to keep.
   */
  static async pruneAutosaves(
    jsScriptId: string,
    maxAutosaves: number
  ): Promise<void> {
    const db = getDb();
    const rows = await db
      .select({ id: jsScriptVersions.id })
      .from(jsScriptVersions)
      .where(
        and(
          eq(jsScriptVersions.js_script_id, jsScriptId),
          eq(jsScriptVersions.save_type, "autosave")
        )
      )
      .orderBy(asc(jsScriptVersions.version));

    const excess = rows.length - Math.max(0, maxAutosaves);
    if (excess <= 0) return;

    for (const row of rows.slice(0, excess)) {
      await db
        .delete(jsScriptVersions)
        .where(eq(jsScriptVersions.id, row.id));
    }
  }

  /**
   * Delete every version of a script. Called when the document is deleted:
   * SQLite only enforces the foreign key when `PRAGMA foreign_keys` is on, so
   * the cascade alone cannot be relied on.
   */
  static async deleteForScript(jsScriptId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(jsScriptVersions)
      .where(eq(jsScriptVersions.js_script_id, jsScriptId));
  }
}
