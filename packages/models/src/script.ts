import { eq, desc, and } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { scripts } from "./schema/scripts.js";

/** One word of a take with clip-local timing (mirrors timeline CaptionWord). */
export interface ScriptCaptionWord {
  word: string;
  startMs: number;
  endMs: number;
}

/** Provider/model/voice selection a speaker or line is voiced with. */
export interface VoiceBinding {
  provider: string;
  model: string;
  voice: string;
  settings?: Record<string, unknown>;
}

/** A voiced audio version of a line — the clipVersion idea, relocated. */
export interface ScriptTake {
  id: string;
  assetId: string;
  durationMs: number;
  words: ScriptCaptionWord[];
  textSnapshot: string;
  voiceSnapshot: VoiceBinding | null;
  createdAt: string;
  favorite?: boolean;
  costCredits?: number;
}

export interface ScriptLine {
  id: string;
  speakerId?: string | null;
  text: string;
  direction?: string;
  pauseAfterMs?: number;
  voiceOverride?: VoiceBinding | null;
  takes: ScriptTake[];
  currentTakeId?: string | null;
}

export interface ScriptSection {
  id: string;
  title?: string;
  lines: ScriptLine[];
}

export interface ScriptSpeaker {
  id: string;
  name: string;
  color?: string;
  voice?: VoiceBinding | null;
}

/**
 * The persisted script payload: text is the source of truth, audio is derived.
 * Everything the editor carries except identity/timestamps (columns).
 */
export interface ScriptDocument {
  cast: ScriptSpeaker[];
  sections: ScriptSection[];
}

export interface ScriptResponse {
  id: string;
  projectId: string;
  name: string;
  document: ScriptDocument;
  timelineId?: string;
  createdAt: string;
  updatedAt: string;
}

export class ScriptConflictError extends Error {
  constructor(id: string) {
    super(`Script ${id} was modified concurrently`);
    this.name = "ScriptConflictError";
  }
}

export const emptyScriptDocument = (): ScriptDocument => ({
  cast: [],
  sections: []
});

function assertValidDocument(doc: ScriptDocument): void {
  if (
    !doc ||
    typeof doc !== "object" ||
    !Array.isArray(doc.sections) ||
    !Array.isArray(doc.cast)
  ) {
    throw new Error("script document must contain cast and sections arrays");
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

/** Total lines across sections — the cheap list summary. */
export function countScriptLines(doc: ScriptDocument): number {
  return doc.sections.reduce((sum, section) => sum + section.lines.length, 0);
}

export class Script extends DBModel {
  static override table = scripts;

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
    this.name ??= "Untitled script";
    this.document ??= JSON.stringify(emptyScriptDocument());
    this.timeline_id ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    assertValidDocument(JSON.parse(this.document) as ScriptDocument);
  }

  toDocument(): ScriptDocument {
    const doc = JSON.parse(this.document) as ScriptDocument;
    doc.cast ??= [];
    doc.sections ??= [];
    return doc;
  }

  toResponse(): ScriptResponse {
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

  static async findById(id: string): Promise<Script | null> {
    return Script.get<Script>(id);
  }

  static async listByUser(userId: string, limit = 50): Promise<Script[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(scripts)
      .where(eq(scripts.user_id, userId))
      .orderBy(desc(scripts.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Script(r));
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<Script[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(scripts)
      .where(
        and(eq(scripts.project_id, projectId), eq(scripts.user_id, userId))
      )
      .orderBy(desc(scripts.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Script(r));
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
  ): Promise<Script | null> {
    if (fields.document !== undefined) {
      assertValidDocument(JSON.parse(fields.document) as ScriptDocument);
    }
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(scripts)
      .set({ ...fields, updated_at: now })
      .where(and(eq(scripts.id, id), eq(scripts.updated_at, expectedUpdatedAt)))
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const updated = new Script(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }
}
