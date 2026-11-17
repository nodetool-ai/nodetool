import { eq, desc, and, sql, inArray, isNull, count, max, type SQL } from "drizzle-orm";
import type {
  TimelineSequence as TimelineSequenceDoc,
  TimelineTrack,
  TimelineClip,
  TimelineMarker,
  TimelineTempo,
  TimelineMasterChannel,
  TimelineSetup,
  TimelineSource,
  TranscriptLine,
  MediaTrack
} from "@nodetool-ai/timeline";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  computeEtag,
  createTimeOrderedUuid,
  nextUpdatedAtAfter
} from "./base-model.js";
import { allowLegacyProjectWritesForTests, getPortableDb } from "./db.js";
import { projects } from "./schema/projects.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { TimelineSequenceVersion } from "./timeline-sequence-version.js";
import { timelineSequenceVersions } from "./schema/timeline-sequence-versions.js";
import { saveKeepingRevision, type KeepRevision } from "./kept-revision.js";
import { removeDocumentSharing } from "./document-sharing.js";
import {
  assertDocumentFileMayLeave,
  type DocumentFileLocation,
  type DocumentFileSync
} from "./document-file-sync.js";
import {
  documentRefTables,
  insertDependents,
  readDependents,
  registerDeletedDocumentKind,
  retainDeletedDocument,
  documentRetentionDays,
  type DependentTable
} from "./deleted-document.js";
import { documentCollaborators, documentShares } from "./schema/document-sharing.js";
import { DocumentRefs } from "./document-refs.js";
import { changingAccess } from "./access-epoch.js";

export class TimelineSequenceConflictError extends Error {
  constructor(id: string) {
    super(`Timeline sequence ${id} was modified concurrently`);
    this.name = "TimelineSequenceConflictError";
  }
}

let timelineFileSync: DocumentFileSync<TimelineSequence> | null = null;

/**
 * Per timeline instance: the project whose folder holds the file at
 * `file_path`, as last read from or written to the database. A save that
 * changes `project_id` uses it to remove the file from the folder the
 * timeline left.
 */
const fileProjects = new WeakMap<TimelineSequence, string>();

/**
 * Install what writes a timeline's file in its project folder after the row
 * is saved, and deletes it after the row is deleted. See
 * {@link DocumentFileSync}.
 */
export function setTimelineFileSync(
  sync: DocumentFileSync<TimelineSequence> | null
): void {
  timelineFileSync = sync;
}

export interface TimelineSequenceMutationResult<T> {
  sequence: TimelineSequence;
  result: T;
}

function validateTimelineDocument(doc: TimelineDocument): void {
  if (doc.workingColorSpaceVersion !== undefined &&
      (!Number.isInteger(doc.workingColorSpaceVersion) || doc.workingColorSpaceVersion <= 0)) {
    throw new Error("workingColorSpaceVersion must be a positive integer");
  }
  if (
    !Array.isArray(doc.tracks) ||
    !Array.isArray(doc.clips) ||
    !Array.isArray(doc.markers)
  ) {
    throw new Error("document must contain tracks, clips, and markers arrays");
  }
}

/**
 * The end of the last clip — what the sequence's stored `duration_ms` means.
 *
 * This lives in the model rather than at a call site because `duration_ms` is a
 * cache of the document: every write of one must refresh the other, and a
 * capability that forgot to (`edit_timeline` did) leaves a sequence reporting
 * 0 ms forever while its own document says otherwise.
 */
export function timelineDocumentDurationMs(doc: TimelineDocument): number {
  if (!Array.isArray(doc.clips)) return 0;
  return doc.clips.reduce((end, clip) => {
    const start = Number(clip?.startMs) || 0;
    const length = Number(clip?.durationMs) || 0;
    return Math.max(end, start + length);
  }, 0);
}

export interface TimelineDocument {
  workingColorSpaceVersion?: number;
  /** Show timecode as drop-frame at 29.97, 59.94 and 119.88 fps. Display only. */
  dropFrame?: boolean;
  tracks: TimelineTrack[];
  trackFolders?: TimelineSequenceDoc["trackFolders"];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  storyboardMaterializations?: TimelineSequenceDoc["storyboardMaterializations"];
  /** Studio transcript lines. Optional for documents written before Studio. */
  transcript?: TranscriptLine[];
  /** Whether the script lane + transcript panel are shown. Unset on legacy. */
  scriptEnabled?: boolean;
  /** Document tempo for midi clips. Unset until the first midi track. */
  tempo?: TimelineTempo;
  /** The master channel. Unset means 0 dB with no effects. */
  master?: TimelineMasterChannel;
  camera2d?: TimelineSequenceDoc["camera2d"];
  /** Guided video-flow state (PRD § 8.5). Unset outside the flow. */
  setup?: TimelineSetup;
  /** Sequence this one was retargeted from. Unset on a sequence built directly. */
  templateId?: string | null;
  /**
   * The authoring code this timeline was baked from, and the scene hashes the
   * last bake recorded. Unset on a sequence nobody authored with code.
   */
  source?: TimelineSource | null;
  /** Subject/object tracks (P0 AI Video, Phase 2). Unset on a document with none. */
  mediaTracks?: MediaTrack[];
}

export class TimelineSequence extends DBModel {
  static override table = timelineSequences;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare workflow_id: string | null;
  declare name: string;
  declare fps: number;
  declare width: number;
  declare height: number;
  declare duration_ms: number;
  declare document: string;
  declare created_at: string;
  declare revision: number;
  /** The timeline's file, relative to its project's folder. */
  declare file_path: string | null;
  /**
   * SHA-256 of the file as NodeTool last wrote or imported it. A file with
   * another hash holds an edit NodeTool has not seen. Null until the row is
   * first synced with a file. A host with no file sync leaves it as it is,
   * and the reconcile then finds the row newer than its untouched file.
   */
  declare file_hash: string | null;
  /** What the last reconcile found wrong with the file, or null. */
  declare file_error: string | null;
  /**
   * The editing instance that wrote the stored revision, or null when that
   * save carried none. A save from another instance first keeps the stored
   * revision as a version.
   */
  declare last_writer_instance: string | null;
  /** The document schema version the stored revision was written in. */
  declare schema_version: number;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.workflow_id ??= null;
    this.fps ??= 30;
    this.width ??= 1920;
    this.height ??= 1080;
    this.duration_ms ??= 0;
    this.document ??= JSON.stringify({ tracks: [], clips: [], markers: [] });
    this.created_at ??= now;
    this.revision ??= 0;
    this.file_path ??= null;
    this.file_hash ??= null;
    this.file_error ??= null;
    this.last_writer_instance ??= null;
    this.schema_version ??= 1;
    this.rememberFileProject();
    this.updated_at ??= now;
  }

  /**
   * The etag of the timeline, without the state of its file. Where the file
   * is, its hash and what the last reconcile found wrong with it are records
   * about the file and no content of the timeline. Recording them must not
   * read as a change of the timeline to a client that holds its etag.
   * The writer instance and schema version describe the save, and stay out
   * of the etag for the same reason.
   */
  override getEtag(): string {
    const {
      file_path: _path,
      file_hash: _hash,
      file_error: _error,
      last_writer_instance: _writer,
      schema_version: _schema,
      ...content
    } = this.toRow();
    return computeEtag(content);
  }

  /** Every create and save of a timeline row writes its file afterwards. */
  protected override async persist(event: ModelChangeEvent): Promise<this> {
    const previous = this.previousFile();
    if (previous && timelineFileSync) {
      // The save moves the timeline to another project. The stored row is
      // asked first, because its file in the folder it leaves is deleted.
      const [stored] = await getPortableDb()
        .select()
        .from(timelineSequences)
        .where(eq(timelineSequences.id, this.id))
        .limit(1);
      await assertDocumentFileMayLeave(
        timelineFileSync,
        stored ? new TimelineSequence(stored) : null
      );
    }
    await super.persist(event);
    await this.syncFile(previous);
    return this;
  }

  override async delete(): Promise<void> {
    await super.delete();
    await timelineFileSync?.deleted(this);
  }

  /** The file this row had in another project, when a save moved the row. */
  private previousFile(): DocumentFileLocation | null {
    const project = fileProjects.get(this);
    return this.file_path && project !== undefined && project !== this.project_id
      ? { project_id: project, file_path: this.file_path }
      : null;
  }

  /**
   * Write the file of this row, which a caller just wrote without `save()`.
   * `previous` is the file the row had in the project it left, if it moved.
   */
  async syncFile(previous: DocumentFileLocation | null = null): Promise<void> {
    await timelineFileSync?.saved(this, previous);
    this.rememberFileProject();
  }

  private rememberFileProject(): void {
    if (this.file_path) fileProjects.set(this, this.project_id);
    else fileProjects.delete(this);
  }

  /**
   * Record the file the row was last synced with. `updated_at` and `revision`
   * stay as they are, because the file is not content: raising them would
   * refuse the next save of an editor that has the timeline open. No change
   * is announced for the same reason.
   */
  static async setFileState(
    id: string,
    state: Partial<
      Pick<TimelineSequence, "file_path" | "file_hash" | "file_error">
    >
  ): Promise<void> {
    await getPortableDb()
      .update(timelineSequences)
      .set(state)
      .where(eq(timelineSequences.id, id));
  }

  /**
   * Whether a timeline of any user has exactly this ID. `findById` also
   * answers for a 12-character prefix.
   */
  static async existsExactly(id: string): Promise<boolean> {
    const rows = await getPortableDb()
      .select({ id: timelineSequences.id })
      .from(timelineSequences)
      .where(eq(timelineSequences.id, id))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Insert a timeline only when no row has its ID. Returns the created
   * timeline, or null when a row with that ID exists. That row is left
   * exactly as it is, whoever owns it.
   *
   * `create()` writes with an upsert, which replaces a row that has the ID.
   * A caller that takes the ID from outside, as the reconcile takes it from a
   * file, uses this instead: a lookup followed by `create()` would overwrite
   * a row created between the two, which can be another user's.
   *
   * It applies the project rule of every save: the project must be the
   * owner's and not deleted. The file sync runs and the creation is
   * announced, as for `create()`.
   */
  static async insertNew(
    data: Record<string, unknown>
  ): Promise<TimelineSequence | null> {
    const timeline = new TimelineSequence(data);
    timeline.beforeSave();
    const db = getPortableDb();
    if (timeline.project_id !== "default" && !allowLegacyProjectWritesForTests()) {
      const [project] = await db
        .select({ deletedAt: projects.deleted_at })
        .from(projects)
        .where(
          and(
            eq(projects.id, timeline.project_id),
            eq(projects.user_id, timeline.user_id)
          )
        )
        .limit(1);
      if (!project) throw new Error("Project not found");
      if (project.deletedAt) throw new Error("Project has been deleted");
    }
    const rows = await db
      .insert(timelineSequences)
      // SAFETY: `toRow` holds the table's columns, which the constructor
      // filled. The dynamic base model cannot express the insert shape.
      .values(timeline.toRow() as typeof timelineSequences.$inferInsert)
      .onConflictDoNothing()
      .returning();
    const row = rows[0];
    if (!row) return null;
    const created = new TimelineSequence(row);
    await created.syncFile(null);
    ModelObserver.notify(created, ModelChangeEvent.CREATED);
    return created;
  }

  /** The timelines whose files belong in the folder of `projectIds`. */
  static async listForProjects(
    userId: string,
    projectIds: readonly string[]
  ): Promise<TimelineSequence[]> {
    if (projectIds.length === 0) return [];
    const rows = await getPortableDb()
      .select()
      .from(timelineSequences)
      .where(
        and(
          eq(timelineSequences.user_id, userId),
          inArray(timelineSequences.project_id, [...projectIds])
        )
      );
    return rows.map((row) => new TimelineSequence(row));
  }

  /**
   * The projects that hold a timeline whose file was never written, each
   * with its owner and how many such documents it holds, for every user or
   * for `userId`. A timeline from before project folders is one of them.
   */
  static async projectsWithUnwrittenFiles(userId?: string): Promise<
    Array<{ user_id: string; project_id: string; count: number }>
  > {
    return getPortableDb()
      .select({
        user_id: timelineSequences.user_id,
        project_id: timelineSequences.project_id,
        count: count()
      })
      .from(timelineSequences)
      .where(
        and(
          isNull(timelineSequences.file_path),
          userId === undefined ? undefined : eq(timelineSequences.user_id, userId)
        )
      )
      .groupBy(timelineSequences.user_id, timelineSequences.project_id);
  }

  /**
   * Point a timeline the caller owns at `projectId` and take its file along:
   * the file is removed from the folder the timeline left and written in the
   * folder it is now in. Content, `revision` and `updated_at` stay as they
   * are. Returns false when the caller owns no such timeline. Throws
   * `DocumentFileMoveError` and moves nothing when the file holds an edit
   * NodeTool has not seen and that is not valid.
   */
  static async moveToProject(
    userId: string,
    id: string,
    projectId: string
  ): Promise<boolean> {
    return changingAccess([{ kind: "timeline", id }], async () => {
      const db = getPortableDb();
      const [before] = await db
        .select()
        .from(timelineSequences)
        .where(
          and(eq(timelineSequences.id, id), eq(timelineSequences.user_id, userId))
        )
        .limit(1);
      if (!before) return false;
      const moves = before.project_id !== projectId;
      if (moves) {
        await assertDocumentFileMayLeave(
          timelineFileSync,
          new TimelineSequence(before)
        );
      }
      const rows = await db
        .update(timelineSequences)
        .set({
          project_id: projectId,
          // A host with no file sync cannot take the file along. The path and
          // the hash name a file of the folder the timeline left, so the row
          // forgets them and the reconcile of its new folder writes a file.
          ...(!timelineFileSync &&
            moves && { file_path: null, file_hash: null, file_error: null })
        })
        .where(
          and(eq(timelineSequences.id, id), eq(timelineSequences.user_id, userId))
        )
        .returning();
      const row = rows[0];
      if (!row) return false;
      const moved = new TimelineSequence(row);
      await moved.syncFile(
        before.file_path && moves
          ? { project_id: before.project_id, file_path: before.file_path }
          : null
      );
      return true;
    });
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    // Resource refs carry this; every write must move it forward.
    this.revision = (this.revision ?? 0) + 1;
    const doc = JSON.parse(this.document);
    validateTimelineDocument(doc);
  }

  toDocument(): TimelineDocument {
    const doc = JSON.parse(this.document) as TimelineDocument;
    validateTimelineDocument(doc);
    return doc;
  }

  fromDocument(doc: TimelineDocument): void {
    validateTimelineDocument(doc);
    this.document = JSON.stringify(doc);
  }

  toTimelineSequence(): TimelineSequenceDoc {
    const doc = this.toDocument();
    const sequence: TimelineSequenceDoc = {
      id: this.id,
      projectId: this.project_id,
      workflowId: this.workflow_id ?? undefined,
      name: this.name,
      fps: this.fps,
      width: this.width,
      height: this.height,
      durationMs: this.duration_ms,
      dropFrame: doc.dropFrame,
      tracks: doc.tracks,
      trackFolders: doc.trackFolders,
      clips: doc.clips,
      markers: doc.markers,
      storyboardMaterializations: doc.storyboardMaterializations,
      transcript: doc.transcript ?? [],
      scriptEnabled: doc.scriptEnabled,
      tempo: doc.tempo,
      master: doc.master,
      camera2d: doc.camera2d,
      setup: doc.setup,
      templateId: doc.templateId,
      source: doc.source,
      mediaTracks: doc.mediaTracks,
      createdAt: this.created_at,
      updatedAt: this.updated_at,
      schemaVersion: this.schema_version
    };
    // An absent version stays absent, so a read never adds the field.
    if (doc.workingColorSpaceVersion !== undefined) {
      sequence.workingColorSpaceVersion = doc.workingColorSpaceVersion;
    }
    return sequence;
  }

  static fromTimelineSequence(
    userId: string,
    seq: TimelineSequenceDoc
  ): TimelineSequence {
    const doc: TimelineDocument = {
      workingColorSpaceVersion: seq.workingColorSpaceVersion,
      dropFrame: seq.dropFrame,
      tracks: seq.tracks,
      trackFolders: seq.trackFolders,
      clips: seq.clips,
      markers: seq.markers,
      storyboardMaterializations: seq.storyboardMaterializations,
      transcript: seq.transcript ?? [],
      scriptEnabled: seq.scriptEnabled,
      tempo: seq.tempo,
      master: seq.master,
      camera2d: seq.camera2d,
      setup: seq.setup,
      templateId: seq.templateId,
      source: seq.source,
      mediaTracks: seq.mediaTracks
    };
    validateTimelineDocument(doc);
    return new TimelineSequence({
      id: seq.id,
      user_id: userId,
      project_id: seq.projectId,
      workflow_id: seq.workflowId ?? null,
      name: seq.name,
      fps: seq.fps,
      width: seq.width,
      height: seq.height,
      duration_ms: seq.durationMs,
      document: JSON.stringify(doc),
      created_at: seq.createdAt,
      updated_at: seq.updatedAt
    });
  }

  /**
   * Delete a timeline sequence the caller owns, and everything that hung off it.
   *
   * The ownership test lives here rather than in each caller because there are
   * two of them — the tRPC route and the sandbox's `delete_timeline`
   * capability — and a delete is not a place for two copies of one rule.
   * Missing and not-yours are the same answer, so a caller cannot probe ids.
   */
  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    return changingAccess([{ kind: "timeline", id }], async () => {
      const row = await TimelineSequence.findById(id);
      if (!row || row.user_id !== userId) return false;
      // Kept first, so a failure before the delete never loses the timeline.
      if (documentRetentionDays() !== null) {
        await retainDeletedDocument({
          kind: "timeline",
          documentId: row.id,
          userId,
          projectId: row.project_id,
          name: row.name,
          payload: { row: row.toRow(), dependents: await readDependents(timelineDependents(row.id)) }
        });
      }
      await row.delete();
      await removeDocumentSharing("timeline", row.id);
      await DocumentRefs.removeForDocument("timeline", row.id);
      // Belt-and-braces with the FK cascade: version rows outliving their
      // document would be unreachable garbage.
      await TimelineSequenceVersion.deleteForTimeline(row.id);
      return true;
    });
  }

  static async findById(id: string): Promise<TimelineSequence | null> {
    return TimelineSequence.get<TimelineSequence>(id);
  }

  static async listByUser(
    userId: string,
    limit = 50
  ): Promise<TimelineSequence[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(timelineSequences)
      .where(eq(timelineSequences.user_id, userId))
      .orderBy(desc(timelineSequences.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new TimelineSequence(r));
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<TimelineSequence[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(timelineSequences)
      .where(
        and(
          eq(timelineSequences.user_id, userId),
          eq(timelineSequences.project_id, projectId)
        )
      )
      .orderBy(desc(timelineSequences.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new TimelineSequence(r));
  }

  /**
   * Validate and update the `document` field then persist.
   * Throws a `SyntaxError` if `documentJson` is not valid JSON.
   */
  static async update(
    id: string,
    fields: Partial<{
      name: string;
      fps: number;
      width: number;
      height: number;
      duration_ms: number;
      workflow_id: string | null;
      document: string;
    }>
  ): Promise<TimelineSequence | null> {
    const seq = await TimelineSequence.get<TimelineSequence>(id);
    if (!seq) return null;

    if (fields.document !== undefined) {
      // Validate JSON before writing.
      JSON.parse(fields.document);
    }

    Object.assign(seq, fields);
    await seq.save();
    return seq;
  }

  /**
   * Atomic compare-and-swap on the `document` field. Writes only when the row's
   * `updated_at` still equals `expectedUpdatedAt`, so a concurrent write landing
   * in between makes this a no-op (returns null) instead of clobbering it.
   */
  static async updateDocumentIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    doc: TimelineDocument,
    meta?: ModelChangeMeta
  ): Promise<TimelineSequence | null> {
    validateTimelineDocument(doc);
    const db = getPortableDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(timelineSequences)
      .set({
        document: JSON.stringify(doc),
        duration_ms: timelineDocumentDurationMs(doc),
        revision: sql`${timelineSequences.revision} + 1`,
        updated_at: now
      })
      .where(
        and(
          eq(timelineSequences.id, id),
          eq(timelineSequences.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) return null;

    const updated = new TimelineSequence(row);
    await updated.syncFile();
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }

  /**
   * Atomic compare-and-swap for a client-driven save that may touch scalar
   * fields and/or the document in one write. Applies only when the row's
   * `updated_at` still equals `expectedUpdatedAt`; returns null on conflict so
   * the caller can report "modified since last load" instead of clobbering.
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: Partial<{
      name: string;
      fps: number;
      width: number;
      height: number;
      duration_ms: number;
      workflow_id: string | null;
      document: string;
      last_writer_instance: string | null;
      schema_version: number;
    }>,
    meta?: ModelChangeMeta,
    keep?: KeepRevision
  ): Promise<TimelineSequence | null> {
    const write: typeof fields = { ...fields };
    if (fields.document !== undefined) {
      const doc = JSON.parse(fields.document) as TimelineDocument;
      validateTimelineDocument(doc);
      // A document write without a duration is a stale duration. A caller that
      // states one (a version restore, which carries the duration recorded with
      // the snapshot) keeps it.
      write.duration_ms ??= timelineDocumentDurationMs(doc);
    }
    const db = getPortableDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const unchanged = and(
      eq(timelineSequences.id, id),
      eq(timelineSequences.updated_at, expectedUpdatedAt)
    );
    const set = {
      ...write,
      revision: sql`${timelineSequences.revision} + 1`,
      updated_at: now
    };
    let row: typeof timelineSequences.$inferSelect | null | undefined;
    if (keep) {
      // The replaced revision becomes a version in the same transaction as
      // the compare-and-set, so a lost race or a crash writes neither.
      row = await saveKeepingRevision<
        typeof timelineSequences.$inferSelect,
        typeof timelineSequences.$inferSelect
      >({
        stored: (tx) =>
          tx.select().from(timelineSequences).where(unchanged).limit(1),
        highestVersion: (tx) =>
          tx
            .select({ value: max(timelineSequenceVersions.version) })
            .from(timelineSequenceVersions)
            .where(eq(timelineSequenceVersions.timeline_id, id)),
        keep: (tx, stored, version) =>
          tx.insert(timelineSequenceVersions).values({
            id: createTimeOrderedUuid(),
            timeline_id: id,
            user_id: stored.user_id,
            name: keep.name,
            save_type: keep.saveType,
            version,
            fps: stored.fps,
            width: stored.width,
            height: stored.height,
            duration_ms: stored.duration_ms,
            document: stored.document,
            created_at: new Date().toISOString()
          }),
        write: (tx) =>
          tx.update(timelineSequences).set(set).where(unchanged).returning()
      });
    } else {
      [row] = await db
        .update(timelineSequences)
        .set(set)
        .where(unchanged)
        .returning();
    }
    if (!row) return null;

    const updated = new TimelineSequence(row);
    await updated.syncFile();
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }

  /**
   * Load → mutate → CAS-write the document, retrying on concurrent conflicts.
   * The mutator receives a fresh document snapshot on every attempt, so callers
   * never operate on a stale read. Throws `TimelineSequenceConflictError` if all
   * retries lose the race.
   */
  static async mutateDocument<T>(
    id: string,
    mutator: (
      doc: TimelineDocument,
      sequence: TimelineSequence
    ) => T | Promise<T>,
    maxRetries = 5,
    meta?: ModelChangeMeta
  ): Promise<TimelineSequenceMutationResult<T> | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const seq = await TimelineSequence.get<TimelineSequence>(id);
      if (!seq) return null;

      const doc = seq.toDocument();
      const result = await mutator(doc, seq);
      const updated = await TimelineSequence.updateDocumentIfUnchanged(
        id,
        seq.updated_at,
        doc,
        meta
      );
      if (updated) {
        return { sequence: updated, result };
      }
    }

    throw new TimelineSequenceConflictError(id);
  }

  /** Touch `updated_at` without changing any other field. */
  async touchUpdatedAt(): Promise<void> {
    this.updated_at = new Date().toISOString();
    await this.save();
  }
}

/** The rows kept with a deleted timeline and put back on restore. */
function timelineDependents(id: string): DependentTable[] {
  return [
    {
      name: "timeline_sequence_versions",
      table: timelineSequenceVersions,
      where: eq(timelineSequenceVersions.timeline_id, id)
    },
    {
      name: "document_collaborators",
      table: documentCollaborators,
      where: and(eq(documentCollaborators.document_type, "timeline"), eq(documentCollaborators.document_id, id)) as SQL
    },
    {
      name: "document_shares",
      table: documentShares,
      where: and(eq(documentShares.document_type, "timeline"), eq(documentShares.document_id, id)) as SQL
    },
    ...documentRefTables("timeline", id)
  ];
}

registerDeletedDocumentKind("timeline", {
  async restore(payload) {
    const id = String(payload.row["id"]);
    if (await TimelineSequence.findById(id)) {
      throw new Error("A timeline with this id exists");
    }
    // Through the model, so the timeline's file is written again.
    await TimelineSequence.create<TimelineSequence>(payload.row);
    await insertDependents(timelineDependents(id), payload.dependents);
  }
});
