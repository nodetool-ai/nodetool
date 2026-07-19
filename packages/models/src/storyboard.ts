import { eq, desc, and } from "drizzle-orm";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
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
  /** Model selections; loosely typed — validated by the router schemas. */
  directorModel: Record<string, unknown> | null;
  imageModel: Record<string, unknown> | null;
  videoModel: Record<string, unknown> | null;
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
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    assertValidDocument(JSON.parse(this.document) as StoryboardDocument);
  }

  toDocument(): StoryboardDocument {
    const doc = JSON.parse(this.document) as StoryboardDocument;
    // Rows persisted before entities existed lack the field.
    doc.entityIds ??= [];
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
    }>
  ): Promise<Storyboard | null> {
    if (fields.document !== undefined) {
      assertValidDocument(JSON.parse(fields.document) as StoryboardDocument);
    }
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(storyboards)
      .set({ ...fields, updated_at: now })
      .where(
        and(
          eq(storyboards.id, id),
          eq(storyboards.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const updated = new Storyboard(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }
}
