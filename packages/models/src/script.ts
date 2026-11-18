import { eq, desc, and } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  createTimeOrderedUuid,
  nextUpdatedAtAfter
} from "./base-model.js";
import { getPortableDb } from "./db.js";
import { scripts } from "./schema/scripts.js";
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
import { changingAccess } from "./access-epoch.js";

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
  directionSnapshot?: string;
  speedSnapshot?: number | null;
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
  /** How long the line is meant to take, in ms (a subtitle cue's own timing). */
  targetDurationMs?: number;
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
  entityId?: string | null;
}

/**
 * The persisted script payload: text is the source of truth, audio is derived.
 * Everything the editor carries except identity/timestamps (columns).
 */
/**
 * Where a script sits in the guided setup, and the answers each step wrote
 * (PRD § 9.5). Absent on a script written before the flow existed, which is
 * what makes such a script open as the editor.
 */
export interface ScriptSetup {
  stage: "idea" | "format" | "review" | "voices" | "done";
  brief: string;
  format?: string;
  length_seconds?: number;
  pace?: "slow" | "normal" | "fast";
  language?: string;
}

export interface ScriptDocument {
  cast: ScriptSpeaker[];
  sections: ScriptSection[];
  setup?: ScriptSetup;
  /** Script this one was filled from. Absent on a script written directly. */
  templateId?: string | null;
}

export interface ScriptResponse {
  id: string;
  projectId: string;
  name: string;
  document: ScriptDocument;
  timelineId?: string;
  storyboardId?: string;
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
  declare storyboard_id: string | null;
  /** The script's file, relative to its project's folder. */
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
    this.document ??= JSON.stringify(emptyScriptDocument());
    this.timeline_id ??= null;
    this.storyboard_id ??= null;
    this.created_at ??= now;
    this.file_path ??= null;
    this.file_hash ??= null;
    this.file_error ??= null;
    this.updated_at ??= now;
    scriptFiles.remember(this);
  }

  override async delete(): Promise<void> {
    await super.delete();
    await scriptFiles.deleted(this);
  }

  /** The etag of the script, without the state of its file. */
  override getEtag(): string {
    return etagWithoutFileState(this.toRow());
  }

  /** Every create and save of a script row writes its file afterwards. */
  protected override async persist(event: ModelChangeEvent): Promise<this> {
    const previous = await scriptFiles.beforePersist(this);
    await super.persist(event);
    await this.syncFile(previous);
    return this;
  }

  /**
   * Write the file of this row, which a caller just wrote without `save()`.
   * `previous` is the file the row had in the project it left, if it moved.
   */
  async syncFile(previous: DocumentFileLocation | null = null): Promise<void> {
    await scriptFiles.saved(this, previous);
  }

  /** Record the file state without touching `updated_at`. */
  static setFileState(id: string, state: DocumentFileFields): Promise<void> {
    return scriptFiles.setFileState(id, state);
  }

  /** Whether a script of any user has exactly this ID. */
  static existsExactly(id: string): Promise<boolean> {
    return scriptFiles.existsExactly(id);
  }

  /** The scripts whose files belong in the folder of `projectIds`. */
  static listForProjects(
    userId: string,
    projectIds: readonly string[]
  ): Promise<Script[]> {
    return scriptFiles.listForProjects(userId, projectIds);
  }

  /** The projects that hold a script whose file was never written. */
  static projectsWithUnwrittenFiles(
    userId?: string
  ): Promise<Array<{ user_id: string; project_id: string; count: number }>> {
    return scriptFiles.projectsWithUnwrittenFiles(userId);
  }

  /**
   * Insert a script only when no row has its ID. Returns null when a row
   * with that ID exists, which is left exactly as it is, whoever owns it.
   */
  static async insertNew(data: Record<string, unknown>): Promise<Script | null> {
    const row = new Script(data);
    row.beforeSave();
    return scriptFiles.insertNew(row);
  }

  /**
   * Point a script the caller owns at `projectId` and take its file along.
   * Returns false when the caller owns no such script.
   */
  static moveToProject(
    userId: string,
    id: string,
    projectId: string
  ): Promise<boolean> {
    return scriptFiles.moveToProject(userId, id, projectId);
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
      storyboardId: this.storyboard_id ?? undefined,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  /**
   * Delete a script the caller owns, and everything that hung off it.
   *
   * The ownership test lives here rather than in each caller because there are
   * two of them — the tRPC route and the sandbox's `delete_script`
   * capability — and a delete is not a place for two copies of one rule.
   * Missing and not-yours are the same answer, so a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    return changingAccess([{ kind: "script", id }], async () => {
      const row = await Script.findById(id);
      if (!row || row.user_id !== userId) return false;
      await row.delete();
      await removeDocumentSharing("script", row.id);
      return true;
    });
  }

  static async findById(id: string): Promise<Script | null> {
    return Script.get<Script>(id);
  }

  static async listByUser(userId: string, limit = 50): Promise<Script[]> {
    const db = getPortableDb();
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
    const db = getPortableDb();
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
      storyboard_id: string | null;
    }>,
    meta?: ModelChangeMeta
  ): Promise<Script | null> {
    if (fields.document !== undefined) {
      assertValidDocument(JSON.parse(fields.document) as ScriptDocument);
    }
    const db = getPortableDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(scripts)
      .set({ ...fields, updated_at: now })
      .where(and(eq(scripts.id, id), eq(scripts.updated_at, expectedUpdatedAt)))
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new Script(row);
    await updated.syncFile();
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }
}

const scriptFiles = new DocumentFileBinding<Script>(
  scripts,
  (row) => new Script(row)
);

/**
 * Install what writes a script's file in its project folder after the row
 * is saved, and deletes it after the row is deleted. See
 * {@link DocumentFileSync}.
 */
export function setScriptFileSync(
  sync: DocumentFileSync<Script> | null
): void {
  scriptFiles.sync = sync;
}
