import { eq, desc, and } from "drizzle-orm";
import {
  assertValidJsScriptDocument,
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  createTimeOrderedUuid,
  nextUpdatedAtAfter
} from "./base-model.js";
import { getPortableDb } from "./db.js";
import { jsScripts } from "./schema/js-scripts.js";
import { JsScriptVersion } from "./js-script-version.js";
import { removeDocumentSharing } from "./document-sharing.js";
import {
  DocumentFileBinding,
  etagWithoutFileState,
  type DocumentFileFields
} from "./document-file-binding.js";
import type {
  DocumentFileLocation,
  DocumentFileSync
} from "./document-file-sync.js";

export interface JsScriptResponse {
  id: string;
  projectId: string;
  name: string;
  document: JsScriptDocument;
  createdAt: string;
  updatedAt: string;
}

export class JsScriptConflictError extends Error {
  constructor(id: string) {
    super(`JS script ${id} was modified concurrently`);
    this.name = "JsScriptConflictError";
  }
}

export class JsScript extends DBModel {
  static override table = jsScripts;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare name: string;
  declare document: string;
  /** The JS script's file, relative to its project's folder. */
  declare file_path: string | null;
  /**
   * SHA-256 of the file as NodeTool last wrote or imported it. A file with
   * another hash holds an edit NodeTool has not seen.
   */
  declare file_hash: string | null;
  /** What the last reconcile found wrong with the file, or null. */
  declare file_error: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.project_id ??= "default";
    this.name ??= "Untitled script";
    this.document ??= JSON.stringify(emptyJsScriptDocument());
    this.created_at ??= now;
    this.file_path ??= null;
    this.file_hash ??= null;
    this.file_error ??= null;
    this.updated_at ??= now;
    jsScriptFiles.remember(this);
  }

  override async delete(): Promise<void> {
    await super.delete();
    await jsScriptFiles.deleted(this);
  }

  /** The etag of the JS script, without the state of its file. */
  override getEtag(): string {
    return etagWithoutFileState(this.toRow());
  }

  /** Every create and save of a JS script row writes its file afterwards. */
  protected override async persist(event: ModelChangeEvent): Promise<this> {
    const previous = await jsScriptFiles.beforePersist(this);
    await super.persist(event);
    await this.syncFile(previous);
    return this;
  }

  /**
   * Write the file of this row, which a caller just wrote without `save()`.
   * `previous` is the file the row had in the project it left, if it moved.
   */
  async syncFile(previous: DocumentFileLocation | null = null): Promise<void> {
    await jsScriptFiles.saved(this, previous);
  }

  /** Record the file state without touching `updated_at`. */
  static setFileState(id: string, state: DocumentFileFields): Promise<void> {
    return jsScriptFiles.setFileState(id, state);
  }

  /** Whether a JS script of any user has exactly this ID. */
  static existsExactly(id: string): Promise<boolean> {
    return jsScriptFiles.existsExactly(id);
  }

  /** The JS scripts whose files belong in the folder of `projectIds`. */
  static listForProjects(
    userId: string,
    projectIds: readonly string[]
  ): Promise<JsScript[]> {
    return jsScriptFiles.listForProjects(userId, projectIds);
  }

  /** The projects that hold a JS script whose file was never written. */
  static projectsWithUnwrittenFiles(
    userId?: string
  ): Promise<Array<{ user_id: string; project_id: string; count: number }>> {
    return jsScriptFiles.projectsWithUnwrittenFiles(userId);
  }

  /**
   * Insert a JS script only when no row has its ID. Returns null when a row
   * with that ID exists, which is left exactly as it is, whoever owns it.
   */
  static async insertNew(data: Record<string, unknown>): Promise<JsScript | null> {
    const row = new JsScript(data);
    row.beforeSave();
    return jsScriptFiles.insertNew(row);
  }

  /**
   * Point a JS script the caller owns at `projectId` and take its file along.
   * Returns false when the caller owns no such JS script.
   */
  static moveToProject(
    userId: string,
    id: string,
    projectId: string
  ): Promise<boolean> {
    return jsScriptFiles.moveToProject(userId, id, projectId);
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    assertValidJsScriptDocument(JSON.parse(this.document) as unknown);
  }

  toDocument(): JsScriptDocument {
    return JSON.parse(this.document) as JsScriptDocument;
  }

  toResponse(): JsScriptResponse {
    return {
      id: this.id,
      projectId: this.project_id,
      name: this.name,
      document: this.toDocument(),
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  /**
   * Delete a JS script the caller owns, and everything that hung off it.
   *
   * The ownership test lives here rather than in each caller because there are
   * two of them — the tRPC route and the sandbox's `delete_js_script`
   * capability — and a delete is not a place for two copies of one rule.
   * Missing and not-yours are the same answer, so a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    const row = await JsScript.findById(id);
    if (!row || row.user_id !== userId) return false;
    await row.delete();
    await removeDocumentSharing("jsscript", row.id);
    // Belt-and-braces with the FK cascade: version rows outliving their
    // document would be unreachable garbage.
    await JsScriptVersion.deleteForScript(row.id);
    return true;
  }

  static async findById(id: string): Promise<JsScript | null> {
    return JsScript.get<JsScript>(id);
  }

  static async listByUser(userId: string, limit = 50): Promise<JsScript[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(jsScripts)
      .where(eq(jsScripts.user_id, userId))
      .orderBy(desc(jsScripts.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new JsScript(r));
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<JsScript[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(jsScripts)
      .where(
        and(eq(jsScripts.project_id, projectId), eq(jsScripts.user_id, userId))
      )
      .orderBy(desc(jsScripts.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new JsScript(r));
  }

  /**
   * Atomic compare-and-swap save. Applies only when the row's `updated_at`
   * still equals `expectedUpdatedAt`; returns null on conflict so the caller
   * reports it instead of clobbering a concurrent write.
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: Partial<{
      name: string;
      document: string;
    }>,
    meta?: ModelChangeMeta
  ): Promise<JsScript | null> {
    if (fields.document !== undefined) {
      assertValidJsScriptDocument(JSON.parse(fields.document) as unknown);
    }
    const db = getPortableDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(jsScripts)
      .set({ ...fields, updated_at: now })
      .where(
        and(eq(jsScripts.id, id), eq(jsScripts.updated_at, expectedUpdatedAt))
      )
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new JsScript(row);
    await updated.syncFile();
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }
}

const jsScriptFiles = new DocumentFileBinding<JsScript>(
  jsScripts,
  (row) => new JsScript(row)
);

/**
 * Install what writes a JS script's file in its project folder after the row
 * is saved, and deletes it after the row is deleted. See
 * {@link DocumentFileSync}.
 */
export function setJsScriptFileSync(
  sync: DocumentFileSync<JsScript> | null
): void {
  jsScriptFiles.sync = sync;
}
