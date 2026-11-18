/**
 * Storyboards as files in the project folder (PRD T5):
 * `Storyboards/<name>.storyboard.json`.
 *
 * ```json
 * {
 *   "format": "nodetool.storyboard",
 *   "version": 1,
 *   "id": "<storyboard id>",
 *   "document": { "screenplay": null, "shots": [], "brief": "", ... }
 * }
 * ```
 *
 * The file name is the storyboard's name and the file holds no `name` field.
 * Owner, the linked timeline, `revision` and timestamps stay in the database.
 * The sync itself is `document-file-sync.ts`. This module is the storyboard
 * kind: which fields the file carries and how a file's content is checked.
 *
 * Loading this module installs the sync on the `Storyboard` model, so every
 * write of a storyboard row writes the file.
 *
 * Storyboards keep no versions, so an import replaces the row without a
 * snapshot, and a file edit a save replaces is not kept.
 */
import { Storyboard, setStoryboardFileSync } from "@nodetool-ai/models";
import { storyboardDocument } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import {
  documentFileSync,
  migrateDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileContent,
  type DocumentFileFailure
} from "./document-file-sync.js";

/** The directory storyboard files are written in. */
export const STORYBOARD_FILE_DIRECTORY = "Storyboards";
/** The end of every storyboard file name. */
export const STORYBOARD_FILE_SUFFIX = ".storyboard.json";
/** The `format` value of a storyboard file. */
export const STORYBOARD_FILE_FORMAT = "nodetool.storyboard";

/** The storyboard fields a storyboard file carries. */
export interface StoryboardFileFields {
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

/**
 * Check the body of a storyboard file with the schema the storyboard save
 * route checks a document with, and store it in the shape that route stores.
 */
async function parseStoryboardFile(
  body: Record<string, unknown>
): Promise<DocumentFileContent<StoryboardFileFields>> {
  const parsed = storyboardDocument.safeParse(body["document"]);
  if (!parsed.success) {
    const lines = ['"document" is not a valid storyboard document'];
    for (const issue of parsed.error.issues) {
      lines.push(`${issue.path.join(".") || "document"}: ${issue.message}`);
    }
    return { ok: false, error: lines.join("\n") };
  }
  return { ok: true, fields: { document: parsed.data } };
}

/** The storyboard kind of {@link DocumentFileAdapter}. */
export const storyboardFileAdapter: DocumentFileAdapter<
  Storyboard,
  StoryboardFileFields
> = {
  kind: "storyboard",
  directory: STORYBOARD_FILE_DIRECTORY,
  suffix: STORYBOARD_FILE_SUFFIX,
  format: STORYBOARD_FILE_FORMAT,
  untitled: "Untitled storyboard",

  // SAFETY: the model refuses to store a document that is not an object.
  fieldsOf: (row) => ({
    document: JSON.parse(row.document) as Record<string, unknown>
  }),

  body: (fields) => ({ document: fields.document }),

  parse: parseStoryboardFile,

  list: (userId, projectIds) => Storyboard.listForProjects(userId, projectIds),

  exists: (id) => Storyboard.existsExactly(id),

  // Storyboards keep no versions.
  snapshot: async () => undefined,

  update(row, fields, name) {
    const changes: Parameters<typeof Storyboard.updateFieldsIfUnchanged>[2] =
      {};
    if (fields.document !== undefined) {
      changes.document = JSON.stringify(fields.document);
    }
    if (name !== undefined) changes.name = name;
    return Storyboard.updateFieldsIfUnchanged(row.id, row.updated_at, changes);
  },

  create: ({ id, userId, projectId, name, fields }) =>
    Storyboard.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      document: JSON.stringify(fields.document)
    }),

  setFileState: (id, state) => Storyboard.setFileState(id, state)
};

setStoryboardFileSync(documentFileSync(storyboardFileAdapter));

/**
 * Write a file for every storyboard that has none yet, of every user or of
 * `userId`: the storyboards from before project folders. Returns how many
 * files were written.
 */
export function migrateStoryboardFiles(
  userId?: string,
  onFailure?: (failure: DocumentFileFailure) => void
): Promise<number> {
  return migrateDocumentFiles(
    storyboardFileAdapter,
    () => Storyboard.projectsWithUnwrittenFiles(userId),
    onFailure
  );
}
