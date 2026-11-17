/**
 * Scripts as files in the project folder (PRD T5):
 * `Scripts/<name>.script.json`.
 *
 * ```json
 * {
 *   "format": "nodetool.script",
 *   "version": 1,
 *   "id": "<script id>",
 *   "document": { "cast": [], "sections": [] }
 * }
 * ```
 *
 * The file name is the script's name and the file holds no `name` field.
 * Owner, the linked timeline and storyboard, and timestamps stay in the
 * database. A take names its audio by asset ID, as the stored document does.
 * The sync itself is `document-file-sync.ts`. This module is the script kind:
 * which fields the file carries and how a file's content is checked.
 *
 * Loading this module installs the sync on the `Script` model, so every
 * write of a script row writes the file.
 *
 * Scripts keep no versions, so an import replaces the row without a
 * snapshot, and a file edit a save replaces is not kept.
 */
import { Script, setScriptFileSync } from "@nodetool-ai/models";
import { scriptDocument } from "@nodetool-ai/protocol/api-schemas/scripts.js";
import {
  documentFileSync,
  migrateDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileContent,
  type DocumentFileFailure
} from "./document-file-sync.js";

/** The directory script files are written in. */
export const SCRIPT_FILE_DIRECTORY = "Scripts";
/** The end of every script file name. */
export const SCRIPT_FILE_SUFFIX = ".script.json";
/** The `format` value of a script file. */
export const SCRIPT_FILE_FORMAT = "nodetool.script";

/** The script fields a script file carries. */
export interface ScriptFileFields {
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

/**
 * Check the body of a script file with the schema the script save route
 * checks a document with, and store it in the shape that route stores.
 */
async function parseScriptFile(
  body: Record<string, unknown>
): Promise<DocumentFileContent<ScriptFileFields>> {
  const parsed = scriptDocument.safeParse(body["document"]);
  if (!parsed.success) {
    const lines = ['"document" is not a valid script document'];
    for (const issue of parsed.error.issues) {
      lines.push(`${issue.path.join(".") || "document"}: ${issue.message}`);
    }
    return { ok: false, error: lines.join("\n") };
  }
  return { ok: true, fields: { document: parsed.data } };
}

/** The script kind of {@link DocumentFileAdapter}. */
export const scriptFileAdapter: DocumentFileAdapter<Script, ScriptFileFields> =
  {
    kind: "script",
    directory: SCRIPT_FILE_DIRECTORY,
    suffix: SCRIPT_FILE_SUFFIX,
    format: SCRIPT_FILE_FORMAT,
    untitled: "Untitled script",

    // SAFETY: the model refuses to store a document that is not an object.
    fieldsOf: (row) => ({
      document: JSON.parse(row.document) as Record<string, unknown>
    }),

    body: (fields) => ({ document: fields.document }),

    parse: parseScriptFile,

    list: (userId, projectIds) => Script.listForProjects(userId, projectIds),

    exists: (id) => Script.existsExactly(id),

    // Scripts keep no versions.
    snapshot: async () => undefined,

    update(row, fields, name) {
      const changes: Parameters<typeof Script.updateFieldsIfUnchanged>[2] = {};
      if (fields.document !== undefined) {
        changes.document = JSON.stringify(fields.document);
      }
      if (name !== undefined) changes.name = name;
      return Script.updateFieldsIfUnchanged(row.id, row.updated_at, changes);
    },

    create: ({ id, userId, projectId, name, fields }) =>
      Script.insertNew({
        id,
        user_id: userId,
        project_id: projectId,
        name,
        document: JSON.stringify(fields.document)
      }),

    setFileState: (id, state) => Script.setFileState(id, state)
  };

setScriptFileSync(documentFileSync(scriptFileAdapter));

/**
 * Write a file for every script that has none yet, of every user or of
 * `userId`: the scripts from before project folders. Returns how many files
 * were written.
 */
export function migrateScriptFiles(
  userId?: string,
  onFailure?: (failure: DocumentFileFailure) => void
): Promise<number> {
  return migrateDocumentFiles(
    scriptFileAdapter,
    () => Script.projectsWithUnwrittenFiles(userId),
    onFailure
  );
}
