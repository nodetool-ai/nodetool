/**
 * JS scripts as files in the project folder (PRD T5):
 * `JsScripts/<name>.jsscript.json`.
 *
 * ```json
 * {
 *   "format": "nodetool.jsscript",
 *   "version": 1,
 *   "id": "<js script id>",
 *   "document": { "schemaVersion": 1, "description": "", "code": "", ... }
 * }
 * ```
 *
 * The code stays inside the JSON document, as the row stores it, so a file
 * round-trips without loss. The file name is the script's name and the file
 * holds no `name` field. Owner and timestamps stay in the database. The sync
 * itself is `document-file-sync.ts`. This module is the JS script kind: which
 * fields the file carries and how a file's content is checked.
 *
 * Loading this module installs the sync on the `JsScript` model, so every
 * write of a JS script row writes the file. An import keeps the script as it
 * was as a version, as the version tools do.
 */
import {
  JsScript,
  JsScriptVersion,
  Secret,
  setJsScriptFileSync
} from "@nodetool-ai/models";
import {
  documentFileSync,
  migrateDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileContent,
  type DocumentFileFailure,
  type DocumentFileOwner
} from "./document-file-sync.js";

/** The directory JS script files are written in. */
export const JS_SCRIPT_FILE_DIRECTORY = "JsScripts";
/** The end of every JS script file name. */
export const JS_SCRIPT_FILE_SUFFIX = ".jsscript.json";
/** The `format` value of a JS script file. */
export const JS_SCRIPT_FILE_FORMAT = "nodetool.jsscript";
/** The name of the version that keeps a script as it was before an import. */
export const JS_SCRIPT_FILE_EDIT_VERSION_NAME = "Before file edit";
/** The name of the version that keeps a file edit a save in NodeTool replaced. */
export const JS_SCRIPT_FILE_REPLACED_VERSION_NAME =
  "File edit replaced by a save";

/** The JS script fields a JS script file carries. */
export interface JsScriptFileFields {
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check the body of a JS script file with the validation `save_js_script`
 * runs, against the owner's secret names, and refuse it on the errors that
 * tool refuses a document on. The document is stored as that tool stores it.
 */
async function parseJsScriptFile(
  body: Record<string, unknown>,
  _row: JsScript | null,
  owner: DocumentFileOwner
): Promise<DocumentFileContent<JsScriptFileFields>> {
  const document = body["document"];
  if (!isRecord(document)) {
    return { ok: false, error: '"document" must be an object' };
  }
  // Loaded on the first import of a file, so that loading this module does
  // not load the code analysis.
  const { validateJsScriptDoc } = await import(
    "@nodetool-ai/execution/js-script-debug"
  );
  const [secrets] = await Secret.listForUser(owner.userId, 500);
  const validation = await validateJsScriptDoc(document, {
    sandboxModuleCatalog: null,
    knownSecrets: secrets.map((secret) => secret.key)
  });
  if (!validation.ok) {
    return {
      ok: false,
      error: [
        "The document has validation errors",
        ...validation.errors.map((issue) => issue.message)
      ].join("\n")
    };
  }
  return { ok: true, fields: { document } };
}

/** The JS script kind of {@link DocumentFileAdapter}. */
export const jsScriptFileAdapter: DocumentFileAdapter<
  JsScript,
  JsScriptFileFields
> = {
  kind: "jsscript",
  directory: JS_SCRIPT_FILE_DIRECTORY,
  suffix: JS_SCRIPT_FILE_SUFFIX,
  format: JS_SCRIPT_FILE_FORMAT,
  untitled: "Untitled script",

  // SAFETY: the model refuses to store a document that is not an object.
  fieldsOf: (row) => ({
    document: JSON.parse(row.document) as Record<string, unknown>
  }),

  body: (fields) => ({ document: fields.document }),

  parse: parseJsScriptFile,

  list: (userId, projectIds) => JsScript.listForProjects(userId, projectIds),

  exists: (id) => JsScript.existsExactly(id),

  async snapshot(row, reason = "before-import") {
    // For a replaced file the row is a copy that carries the file's fields,
    // so its document is the object the file holds and not the stored text.
    const document: unknown = row.document;
    await JsScriptVersion.snapshot(
      {
        id: row.id,
        user_id: row.user_id,
        document:
          typeof document === "string" ? document : JSON.stringify(document)
      },
      {
        saveType: "manual",
        name:
          reason === "replaced-file"
            ? JS_SCRIPT_FILE_REPLACED_VERSION_NAME
            : JS_SCRIPT_FILE_EDIT_VERSION_NAME
      }
    );
  },

  update(row, fields, name) {
    const changes: Parameters<typeof JsScript.updateFieldsIfUnchanged>[2] = {};
    if (fields.document !== undefined) {
      changes.document = JSON.stringify(fields.document);
    }
    if (name !== undefined) changes.name = name;
    return JsScript.updateFieldsIfUnchanged(row.id, row.updated_at, changes);
  },

  create: ({ id, userId, projectId, name, fields }) =>
    JsScript.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      document: JSON.stringify(fields.document)
    }),

  setFileState: (id, state) => JsScript.setFileState(id, state)
};

setJsScriptFileSync(documentFileSync(jsScriptFileAdapter));

/**
 * Write a file for every JS script that has none yet, of every user or of
 * `userId`: the scripts from before project folders. Returns how many files
 * were written.
 */
export function migrateJsScriptFiles(
  userId?: string,
  onFailure?: (failure: DocumentFileFailure) => void
): Promise<number> {
  return migrateDocumentFiles(
    jsScriptFileAdapter,
    () => JsScript.projectsWithUnwrittenFiles(userId),
    onFailure
  );
}
