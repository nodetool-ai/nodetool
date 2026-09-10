import { eq, desc, and, sql } from "drizzle-orm";
import { boardEntityIdsWithShots } from "@nodetool-ai/protocol";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb, getDbType } from "./db.js";
import { storyboards } from "./schema/storyboards.js";

/**
 * The persisted storyboard payload: everything the web board carries except
 * identity/timestamps (columns) and transient UI state (active shot).
 */
export interface StoryboardDocument {
  screenplay: Screenplay | null;
  shots: Shot[];
  brief: string;
  style: string;
  /** Library entity (asset) ids applied to the board's shot prompts. */
  entityIds: string[];
  aspectRatio: string;
  /** Where the board sits in guided setup. Rows written before it read "done". */
  setupStage: StoryboardSetupStage;
  /** Genre lives on the board, not the screenplay: it is picked before one exists. */
  genre: string;
  /** Model selections; loosely typed — validated by the router schemas. */
  directorModel: Record<string, unknown> | null;
  imageModel: Record<string, unknown> | null;
  videoModel: Record<string, unknown> | null;
  /** Board this one was recast from. Absent on a board authored directly. */
  templateId?: string | null;
  /** Canonical substitution mapping, so a re-run finds the copy it made. */
  recastKey?: string | null;
}

export interface StoryboardResponse {
  id: string;
  projectId: string;
  name: string;
  document: StoryboardDocument;
  timelineId?: string;
  createdAt: string;
  updatedAt: string;
}

export class StoryboardConflictError extends Error {
  constructor(id: string) {
    super(`Storyboard ${id} was modified concurrently`);
    this.name = "StoryboardConflictError";
  }
}

export const emptyStoryboardDocument = (): StoryboardDocument => ({
  screenplay: null,
  shots: [],
  brief: "",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null
});

function assertValidDocument(doc: StoryboardDocument): void {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.shots)) {
    throw new Error("storyboard document must contain a shots array");
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

export class Storyboard extends DBModel {
  static override table = storyboards;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare name: string;
  declare document: string;
  declare timeline_id: string | null;
  declare created_at: string;
  declare revision: number;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.project_id ??= "default";
    this.name ??= "Untitled storyboard";
    this.document ??= JSON.stringify(emptyStoryboardDocument());
    this.timeline_id ??= null;
    this.created_at ??= now;
    this.revision ??= 0;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    // Resource refs carry this; every write must move it forward.
    this.revision = (this.revision ?? 0) + 1;
    assertValidDocument(JSON.parse(this.document) as StoryboardDocument);
  }

  toDocument(): StoryboardDocument {
    const doc = JSON.parse(this.document) as StoryboardDocument;
    // Rows persisted before these fields existed lack them.
    doc.entityIds ??= [];
    doc.setupStage ??= "done";
    doc.genre ??= "";
    // A shot can name an entity the board was never cast with — agents write
    // shots one at a time and forget the board. Reconcile on read so the cast
    // holds everything the shots reference.
    doc.entityIds = [...boardEntityIdsWithShots(doc.entityIds, doc.shots ?? [])];
    return doc;
  }

  toResponse(): StoryboardResponse {
    return {
      id: this.id,
      projectId: this.project_id,
      name: this.name,
      document: this.toDocument(),
      timelineId: this.timeline_id ?? undefined,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  /**
   * Delete a storyboard the caller owns, and everything that hung off it.
   *
   * The ownership test lives here rather than in each caller because there are
   * two of them — the tRPC route and the sandbox's `delete_storyboard`
   * capability — and a delete is not a place for two copies of one rule.
   * Missing and not-yours are the same answer, so a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    const row = await Storyboard.findById(id);
    if (!row || row.user_id !== userId) return false;
    await row.delete();
    return true;
  }

  static async findById(id: string): Promise<Storyboard | null> {
    return Storyboard.get<Storyboard>(id);
  }

  static async listByUser(userId: string, limit = 50): Promise<Storyboard[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(storyboards)
      .where(eq(storyboards.user_id, userId))
      .orderBy(desc(storyboards.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Storyboard(r));
  }

  /**
   * The board this owner already derived from `templateId` for `recastKey`.
   *
   * `RecastStoryboard` reuses its previous copy rather than deriving — and
   * re-rendering — a second one, and it used to find that copy by scanning
   * {@link listByProject}, which answers with a window of the most recently
   * updated rows. A catalog batch larger than the window lost sight of its own
   * copies and paid for them again every pass, so the two identity fields are
   * asked of the database instead.
   *
   * They live inside the `document` JSON rather than in columns of their own,
   * so the predicate is written per dialect: SQLite reads them with
   * `json_extract`, PostgreSQL with `->>` over the same text column.
   */
  static async findRecast(args: {
    userId: string;
    projectId?: string;
    templateId: string;
    recastKey: string;
  }): Promise<Storyboard | null> {
    const db = getDb();
    const postgres = getDbType() === "postgres";
    const templateId = postgres
      ? sql`(${storyboards.document}::json ->> 'templateId')`
      : sql`json_extract(${storyboards.document}, '$.templateId')`;
    const recastKey = postgres
      ? sql`(${storyboards.document}::json ->> 'recastKey')`
      : sql`json_extract(${storyboards.document}, '$.recastKey')`;
    const rows = await db
      .select()
      .from(storyboards)
      .where(
        and(
          eq(storyboards.user_id, args.userId),
          args.projectId
            ? eq(storyboards.project_id, args.projectId)
            : undefined,
          eq(templateId, args.templateId),
          eq(recastKey, args.recastKey)
        )
      )
      .orderBy(desc(storyboards.updated_at))
      .limit(1);
    const row = rows[0];
    return row ? new Storyboard(row as Record<string, unknown>) : null;
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<Storyboard[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(storyboards)
      .where(
        and(
          eq(storyboards.project_id, projectId),
          eq(storyboards.user_id, userId)
        )
      )
      .orderBy(desc(storyboards.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Storyboard(r));
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
      timeline_id: string | null;
    }>,
    meta?: ModelChangeMeta
  ): Promise<Storyboard | null> {
    if (fields.document !== undefined) {
      assertValidDocument(JSON.parse(fields.document) as StoryboardDocument);
    }
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(storyboards)
      .set({ ...fields, revision: sql`${storyboards.revision} + 1`, updated_at: now })
      .where(
        and(
          eq(storyboards.id, id),
          eq(storyboards.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new Storyboard(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }
}
