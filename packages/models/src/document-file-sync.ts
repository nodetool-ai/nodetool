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
 * a folder that cannot be reached must not fail the save of the row.
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
}
