/**
 * The model side of a document kind whose rows are files in their project
 * folder: storyboards, scripts, mini apps and JS scripts. It holds the
 * installed {@link DocumentFileSync} and the queries the sync needs, so each
 * of these models adds thin methods instead of a copy of them. Workflows and
 * timelines keep their own copies.
 *
 * The rules are the timeline's (`timeline-sequence.ts`): every write of a row
 * calls the sync afterwards, the file state is recorded without touching
 * `updated_at`, an ID from a file is inserted only when no row has it, and a
 * move to another project takes the file along.
 */
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  ModelChangeEvent,
  ModelObserver,
  computeEtag,
  type DBModel
} from "./base-model.js";
import { allowLegacyProjectWritesForTests, getPortableDb } from "./db.js";
import { projects } from "./schema/projects.js";
import {
  assertDocumentFileMayLeave,
  type DocumentFileLocation,
  type DocumentFileRow,
  type DocumentFileSync
} from "./document-file-sync.js";

/** A table with the columns a document file needs. */
export type DocumentFileTable = SQLiteTable & {
  id: SQLiteColumn;
  user_id: SQLiteColumn;
  project_id: SQLiteColumn;
  file_path: SQLiteColumn;
  file_hash: SQLiteColumn;
  file_error: SQLiteColumn;
};

/** The file state a row records. */
export type DocumentFileFields = Partial<
  Pick<DocumentFileRow, "file_path" | "file_hash"> & { file_error: string | null }
>;

type Row = DocumentFileRow & DBModel;

/**
 * The etag of a row without the state of its file. Where the file is, its
 * hash and what the last reconcile found wrong with it are records about the
 * file and no content of the document.
 */
export function etagWithoutFileState(row: Record<string, unknown>): string {
  const {
    file_path: _path,
    file_hash: _hash,
    file_error: _error,
    ...content
  } = row;
  return computeEtag(content);
}

export class DocumentFileBinding<R extends Row> {
  sync: DocumentFileSync<R> | null = null;
  /**
   * Per instance: the project whose folder holds the file at `file_path`, as
   * last read from or written to the database. A save that changes
   * `project_id` uses it to remove the file from the folder the row left.
   */
  private readonly projects = new WeakMap<R, string>();

  constructor(
    private readonly table: DocumentFileTable,
    private readonly make: (row: Record<string, unknown>) => R
  ) {}

  remember(row: R): void {
    if (row.file_path) this.projects.set(row, row.project_id);
    else this.projects.delete(row);
  }

  /** The file `row` had in another project, when a save moved it. */
  previousFile(row: R): DocumentFileLocation | null {
    const project = this.projects.get(row);
    return row.file_path && project !== undefined && project !== row.project_id
      ? { project_id: project, file_path: row.file_path }
      : null;
  }

  /**
   * Call before a save is written. Refuses a move whose file holds an edit
   * NodeTool has not seen and that is not valid. Returns the file to remove
   * after the save.
   */
  async beforePersist(row: R): Promise<DocumentFileLocation | null> {
    const previous = this.previousFile(row);
    if (previous && this.sync) {
      await assertDocumentFileMayLeave(this.sync, await this.stored(row.id));
    }
    return previous;
  }

  async saved(
    row: R,
    previous: DocumentFileLocation | null = null
  ): Promise<void> {
    await this.sync?.saved(row, previous);
    this.remember(row);
  }

  async deleted(row: R): Promise<void> {
    await this.sync?.deleted(row);
  }

  private async stored(id: string): Promise<R | null> {
    const [row] = await getPortableDb()
      .select()
      .from(this.table)
      .where(eq(this.table.id, id))
      .limit(1);
    return row ? this.make(row as Record<string, unknown>) : null;
  }

  /** Record the file state without touching `updated_at`. */
  async setFileState(id: string, state: DocumentFileFields): Promise<void> {
    await getPortableDb()
      .update(this.table)
      // SAFETY: the three columns exist on every table of this type.
      .set(state as never)
      .where(eq(this.table.id, id));
  }

  /** Whether a row of any user has exactly this ID. */
  async existsExactly(id: string): Promise<boolean> {
    const rows = await getPortableDb()
      .select({ id: this.table.id })
      .from(this.table)
      .where(eq(this.table.id, id))
      .limit(1);
    return rows.length > 0;
  }

  /** The rows whose files belong in the folder of `projectIds`. */
  async listForProjects(
    userId: string,
    projectIds: readonly string[]
  ): Promise<R[]> {
    if (projectIds.length === 0) return [];
    const rows = await getPortableDb()
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.user_id, userId),
          inArray(this.table.project_id, [...projectIds])
        )
      );
    return rows.map((row) => this.make(row as Record<string, unknown>));
  }

  /**
   * The projects that hold a row whose file was never written, each with its
   * owner and how many such rows it holds, for every user or for `userId`.
   */
  async projectsWithUnwrittenFiles(
    userId?: string
  ): Promise<Array<{ user_id: string; project_id: string; count: number }>> {
    const rows = await getPortableDb()
      .select({
        user_id: this.table.user_id,
        project_id: this.table.project_id,
        count: count()
      })
      .from(this.table)
      .where(
        and(
          isNull(this.table.file_path),
          userId === undefined ? undefined : eq(this.table.user_id, userId)
        )
      )
      .groupBy(this.table.user_id, this.table.project_id);
    return rows as Array<{ user_id: string; project_id: string; count: number }>;
  }

  /**
   * Insert `row` only when no row has its ID. Returns the created row, or
   * null when a row with that ID exists, which is left exactly as it is.
   * `row.beforeSave()` must have run. The project rule of every save
   * applies, the file sync runs and the creation is announced.
   */
  async insertNew(row: R): Promise<R | null> {
    const db = getPortableDb();
    if (row.project_id !== "default" && !allowLegacyProjectWritesForTests()) {
      const [project] = await db
        .select({ deletedAt: projects.deleted_at })
        .from(projects)
        .where(
          and(eq(projects.id, row.project_id), eq(projects.user_id, row.user_id))
        )
        .limit(1);
      if (!project) throw new Error("Project not found");
      if (project.deletedAt) throw new Error("Project has been deleted");
    }
    const rows = await db
      .insert(this.table)
      // SAFETY: `toRow` holds the table's columns, which the constructor filled.
      .values(row.toRow() as never)
      .onConflictDoNothing()
      .returning();
    const inserted = rows[0];
    if (!inserted) return null;
    const created = this.make(inserted as Record<string, unknown>);
    await this.saved(created, null);
    ModelObserver.notify(created, ModelChangeEvent.CREATED);
    return created;
  }

  /**
   * Point a row the caller owns at `projectId` and take its file along.
   * Content and `updated_at` stay as they are. Returns false when the caller
   * owns no such row. Throws `DocumentFileMoveError` and moves nothing when
   * the file holds an edit NodeTool has not seen and that is not valid.
   */
  async moveToProject(
    userId: string,
    id: string,
    projectId: string
  ): Promise<boolean> {
    const db = getPortableDb();
    const owned = and(eq(this.table.id, id), eq(this.table.user_id, userId));
    const [before] = await db.select().from(this.table).where(owned).limit(1);
    if (!before) return false;
    const stored = this.make(before as Record<string, unknown>);
    const moves = stored.project_id !== projectId;
    if (moves) await assertDocumentFileMayLeave(this.sync, stored);
    const rows = await db
      .update(this.table)
      .set({
        project_id: projectId,
        // A host with no file sync cannot take the file along. The path and
        // the hash name a file of the folder the row left, so the row forgets
        // them and the reconcile of its new folder writes a file.
        ...(!this.sync &&
          moves && { file_path: null, file_hash: null, file_error: null })
      } as never)
      .where(owned)
      .returning();
    const row = rows[0];
    if (!row) return false;
    await this.saved(
      this.make(row as Record<string, unknown>),
      stored.file_path && moves
        ? { project_id: stored.project_id, file_path: stored.file_path }
        : null
    );
    return true;
  }
}
