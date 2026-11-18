/**
 * The state of the file a document has in its project folder, as
 * the project's document list shows it (PRD T5, T8).
 *
 * The reconcile in `@nodetool-ai/project-services` records what it found on
 * the row: `file_path`, and in `file_error` either the reason an edited file
 * was refused or {@link DOCUMENT_FILE_MISSING}. This module reads those
 * columns back for a list of documents, and finds the document a file in the
 * folder belongs to.
 */
import { and, eq, inArray } from "drizzle-orm";

import { getPortableDb } from "./db.js";
import { storyboards } from "./schema/storyboards.js";
import { scripts } from "./schema/scripts.js";
import { applications } from "./schema/applications.js";
import { jsScripts } from "./schema/js-scripts.js";
import { imageDocuments } from "./schema/image-documents.js";
import { timelineSequences } from "./schema/timeline-sequences.js";
import { workflows } from "./schema/workflows.js";

/** What `file_error` holds for a row whose file is gone. */
export const DOCUMENT_FILE_MISSING = "File missing";

/** A document kind that is a file in its project folder. */

/**
 * The file of one document. `ok`: the file matches the document. `invalid`:
 * the file was edited and refused, and `error` says why. The document keeps
 * its last valid content. `missing`: the file is gone.
 */
export interface ProjectDocumentFile {
  path: string;
  state: "ok" | "invalid" | "missing";
  error: string | null;
}

/** The file columns of a row. */
export interface DocumentFileColumns {
  file_path: string | null;
  file_error: string | null;
}

/** The file state of a row, or null when the row has no file yet. */
export function documentFileOf(
  row: DocumentFileColumns
): ProjectDocumentFile | null {
  if (!row.file_path) return null;
  if (row.file_error === null) {
    return { path: row.file_path, state: "ok", error: null };
  }
  if (row.file_error === DOCUMENT_FILE_MISSING) {
    return { path: row.file_path, state: "missing", error: row.file_error };
  }
  return { path: row.file_path, state: "invalid", error: row.file_error };
}

const TABLES = {
  workflow: workflows,
  timeline: timelineSequences,
  storyboard: storyboards,
  script: scripts,
  application: applications,
  jsscript: jsScripts,
  sketch: imageDocuments
} as const;

/** A document kind that is a file in its project folder. */
export type FileDocumentType = keyof typeof TABLES;

const FILE_DOCUMENT_TYPES = Object.keys(TABLES) as FileDocumentType[];

/** Most ids one query names, below the SQLite bound on parameters. */
const IDS_PER_QUERY = 500;

/**
 * The file state of each of `ids` that `userId` owns, by id. A row without a
 * file is absent from the map.
 */
export async function listDocumentFiles(
  type: FileDocumentType,
  userId: string,
  ids: readonly string[]
): Promise<Map<string, ProjectDocumentFile>> {
  const table = TABLES[type];
  const files = new Map<string, ProjectDocumentFile>();
  for (let start = 0; start < ids.length; start += IDS_PER_QUERY) {
    const rows = await getPortableDb()
      .select({
        id: table.id,
        file_path: table.file_path,
        file_error: table.file_error
      })
      .from(table)
      .where(
        and(
          eq(table.user_id, userId),
          inArray(table.id, ids.slice(start, start + IDS_PER_QUERY))
        )
      );
    for (const row of rows) {
      const file = documentFileOf(row);
      if (file) files.set(row.id, file);
    }
  }
  return files;
}

/** The document a file in a project folder belongs to. */
export interface DocumentOfFile {
  type: FileDocumentType;
  id: string;
  name: string;
  updated_at: string;
  file: ProjectDocumentFile;
}

/**
 * The document of `userId` whose file is `path`, among the rows
 * of `projectIds`, or null. `path` is relative to the project folder, as the
 * row records it.
 */
export async function findDocumentByFile(
  userId: string,
  projectIds: readonly string[],
  path: string
): Promise<DocumentOfFile | null> {
  if (projectIds.length === 0) return null;
  for (const type of FILE_DOCUMENT_TYPES) {
    const table = TABLES[type];
    const [row] = await getPortableDb()
      .select({
        id: table.id,
        name: table.name,
        updated_at: table.updated_at,
        file_path: table.file_path,
        file_error: table.file_error
      })
      .from(table)
      .where(
        and(
          eq(table.user_id, userId),
          inArray(table.project_id, [...projectIds]),
          eq(table.file_path, path)
        )
      )
      .limit(1);
    const file = row ? documentFileOf(row) : null;
    if (row && file) {
      return {
        type,
        id: row.id,
        name: row.name,
        updated_at: row.updated_at,
        file
      };
    }
  }
  return null;
}
