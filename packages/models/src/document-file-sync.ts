/**
 * The hook that keeps a document's file in its project folder in step with
 * its row (PRD T5).
 *
 * A project workflow is a JSON file in the project's folder, and the row is
 * the cache the runtime reads. Every write of the row goes through the model,
 * so the model is where the file is written, renamed and deleted. Project
 * folders are reached through `@nodetool-ai/project-services`, which depends
 * on this package, so it installs its sync here when it loads. A host that
 * never loads it writes no files.
 */

/** Where a document's file was before a save moved the row. */
export interface DocumentFileLocation {
  project_id: string;
  file_path: string;
}

/** The row fields a document file sync reads and writes. */
export interface DocumentFileRow {
  id: string;
  user_id: string;
  project_id: string;
  file_path: string | null;
  file_hash: string | null;
}

/**
 * What a model calls after it wrote or deleted a row. Neither method throws:
 * a folder that cannot be reached must not fail the save of the row. A sync
 * never replaces a file that was edited since it last wrote or read it
 * without keeping that edit.
 */
export interface DocumentFileSync<Row extends DocumentFileRow> {
  /**
   * The row was created or saved. Write its file and record `file_path` and
   * `file_hash` on the row. `previous` is the file the row had in another
   * project before this save, which is removed.
   */
  saved(row: Row, previous: DocumentFileLocation | null): Promise<void>;
  /** The row was deleted. Delete its file. */
  deleted(row: Row): Promise<void>;
  /**
   * Delete the row with `remove`, then its file, both while the folder of
   * `row` is locked. A reconcile that ran between the two would find a file
   * with no row and import it again as a new document. `remove` returns the
   * deleted row, or null when there was none. The file delete does not throw.
   */
  deleting(row: Row, remove: () => Promise<Row | null>): Promise<Row | null>;
  /**
   * The row is about to move to another project. `row` is the stored row, in
   * the project it leaves. Its file there is deleted once the row has moved,
   * so a file that holds an edit NodeTool has not seen and that is not valid
   * would be lost with no version to keep it. Returns what to tell the user
   * when the move must be refused for that reason, and null otherwise. A
   * valid edit does not refuse the move: `saved` keeps it as a version.
   */
  leaving(row: Row): Promise<string | null>;
}

/**
 * Delete a row and its file through `sync`, see
 * {@link DocumentFileSync.deleting}. With no sync installed, only the row goes.
 */
export function deleteWithFile<Row extends DocumentFileRow>(
  sync: DocumentFileSync<Row> | null | undefined,
  row: Row,
  remove: () => Promise<Row | null>
): Promise<Row | null> {
  return sync ? sync.deleting(row, remove) : remove();
}

/** A document could not change project because of the state of its file. */
export class DocumentFileMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentFileMoveError";
  }
}

/**
 * Ask `sync` whether the stored `row` may leave its project, and throw
 * {@link DocumentFileMoveError} when it may not. Call it before the change of
 * project is written.
 */
export async function assertDocumentFileMayLeave<Row extends DocumentFileRow>(
  sync: DocumentFileSync<Row> | null,
  row: Row | null | undefined
): Promise<void> {
  if (!sync || !row?.file_path) return;
  const refusal = await sync.leaving(row);
  if (refusal !== null) throw new DocumentFileMoveError(refusal);
}
