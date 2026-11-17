/**
 * Mini apps as files in the project folder (PRD T5):
 * `Apps/<name>.app.json`.
 *
 * ```json
 * {
 *   "format": "nodetool.app",
 *   "version": 1,
 *   "id": "<application id>",
 *   "description": "",
 *   "document": { "schemaVersion": 3, "ui": {}, "operations": [], ... }
 * }
 * ```
 *
 * The file name is the app's name and the file holds no `name` field. Owner,
 * published versions, deployments and timestamps stay in the database. The
 * sync itself is `document-file-sync.ts`. This module is the app kind: which
 * fields the file carries and how a file's content is checked.
 *
 * Loading this module installs the sync on the `Application` model, so every
 * write of an application row writes the file.
 *
 * The versions of an app are its published releases, which pin workflows
 * and are what a published app serves. An edit is no release, so an import
 * replaces the row without a snapshot, and a file edit a save replaces is
 * not kept.
 */
import { parseApplicationDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  isApplicationId,
  setApplicationFileSync
} from "@nodetool-ai/models";
import {
  documentFileSync,
  migrateDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileContent,
  type DocumentFileFailure
} from "./document-file-sync.js";

/** The directory app files are written in. */
export const APP_FILE_DIRECTORY = "Apps";
/** The end of every app file name. */
export const APP_FILE_SUFFIX = ".app.json";
/** The `format` value of an app file. */
export const APP_FILE_FORMAT = "nodetool.app";

/** The application fields an app file carries. */
export interface AppFileFields {
  description: string;
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

/**
 * Check the body of an app file. The document is parsed as `create_app`
 * parses the document it is given, and stored in the shape that tool stores.
 */
async function parseAppFile(
  body: Record<string, unknown>
): Promise<DocumentFileContent<AppFileFields>> {
  const description = body["description"] ?? "";
  if (typeof description !== "string") {
    return { ok: false, error: '"description" must be a string' };
  }
  const document = parseApplicationDocument(body["document"]);
  if (!document) {
    return {
      ok: false,
      error: '"document" is not a valid application document'
    };
  }
  return {
    ok: true,
    fields: {
      description,
      // SAFETY: an application document is a plain JSON object.
      document: document as unknown as Record<string, unknown>
    }
  };
}

/** The app kind of {@link DocumentFileAdapter}. */
export const appFileAdapter: DocumentFileAdapter<Application, AppFileFields> = {
  kind: "application",
  directory: APP_FILE_DIRECTORY,
  suffix: APP_FILE_SUFFIX,
  format: APP_FILE_FORMAT,
  untitled: "Untitled app",

  // SAFETY: the model refuses to store a document that does not parse.
  fieldsOf: (row) => ({
    description: row.description,
    document: JSON.parse(row.document) as Record<string, unknown>
  }),

  body: (fields) => ({
    description: fields.description,
    document: fields.document
  }),

  parse: parseAppFile,

  list: (userId, projectIds) =>
    Application.listForProjects(userId, projectIds),

  // An ID an application cannot have counts as taken, so a new file with it
  // gets a new ID.
  exists: async (id) =>
    !isApplicationId(id) || (await Application.existsExactly(id)),

  // An edit is no release. See the module comment.
  snapshot: async () => undefined,

  update(row, fields, name) {
    const changes: Parameters<typeof Application.updateFieldsIfUnchanged>[2] =
      {};
    if (fields.description !== undefined) {
      changes.description = fields.description;
    }
    if (fields.document !== undefined) {
      changes.document = JSON.stringify(fields.document);
    }
    if (name !== undefined) changes.name = name;
    return Application.updateFieldsIfUnchanged(row.id, row.updated_at, changes);
  },

  create: ({ id, userId, projectId, name, fields }) =>
    Application.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      description: fields.description,
      document: JSON.stringify(fields.document)
    }),

  setFileState: (id, state) => Application.setFileState(id, state)
};

setApplicationFileSync(documentFileSync(appFileAdapter));

/**
 * Write a file for every app that has none yet, of every user or of
 * `userId`: the apps from before project folders. Returns how many files
 * were written.
 */
export function migrateAppFiles(
  userId?: string,
  onFailure?: (failure: DocumentFileFailure) => void
): Promise<number> {
  return migrateDocumentFiles(
    appFileAdapter,
    () => Application.projectsWithUnwrittenFiles(userId),
    onFailure
  );
}
