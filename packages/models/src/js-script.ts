import { eq, desc, and } from "drizzle-orm";
import {
  assertValidJsScriptDocument,
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { jsScripts } from "./schema/js-scripts.js";

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

function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

export class JsScript extends DBModel {
  static override table = jsScripts;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare name: string;
  declare document: string;
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
    this.updated_at ??= now;
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

  static async findById(id: string): Promise<JsScript | null> {
    return JsScript.get<JsScript>(id);
  }

  static async listByUser(userId: string, limit = 50): Promise<JsScript[]> {
    const db = getDb();
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
    const db = getDb();
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
    }>
  ): Promise<JsScript | null> {
    if (fields.document !== undefined) {
      assertValidJsScriptDocument(JSON.parse(fields.document) as unknown);
    }
    const db = getDb();
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
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }
}
