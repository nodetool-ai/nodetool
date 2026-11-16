/**
 * Documents as files in the project folder (PRD T5, D8).
 *
 * A document of a kind that lives in the folder is a readable JSON file
 * there. The database row is the cache the runtime reads. This module keeps
 * the two in step, in both directions, for every kind through one
 * {@link DocumentFileAdapter}. Workflows (`workflow-file.ts`) and timelines
 * (`timeline-file.ts`) are the kinds. A new kind adds an adapter and nothing
 * here.
 *
 * NodeTool to file: the model calls {@link documentFileSync} after it saved
 * or deleted a row. A save writes the file and records its path and the hash
 * of its content on the row. A rename renames the file, a delete deletes it,
 * and a name another file has gets a numeric suffix.
 *
 * File to NodeTool: {@link reconcileDocumentFiles} compares the files with the
 * rows and applies this table. It runs with the asset reconcile, on the same
 * triggers.
 *
 * | File state | Action |
 * | --- | --- |
 * | Hash equals `file_hash` | None. |
 * | Hash differs and the file validates | Snapshot the row as a version, import the file, announce the change. |
 * | Hash differs and the file fails validation | Keep the row. Record the error in `file_error`. |
 * | File absent | Record "File missing" in `file_error`. |
 * | File renamed or moved, same ID | Point the row at it and rename the document. |
 * | New file with an unknown ID | Create the document in this project. |
 * | New file whose ID belongs to another file | Assign a new ID and rewrite the file. |
 *
 * `file_hash` is the hash of the file as NodeTool last wrote or imported it.
 * A file with that hash was not touched since, so it can be replaced. A file
 * with any other hash holds an edit NodeTool has not seen, and nothing here
 * replaces it without keeping it: a save keeps the file's content as a
 * version before it writes, and leaves a file that fails validation alone.
 *
 * A row can be newer than its file: a write failed, or a host without this
 * sync saved the row. The reconcile sees that the file is untouched and the
 * row holds other content, and writes the file. A row with no `file_path`
 * was never written, and the reconcile writes it too. That is also the
 * migration of documents from before project folders.
 *
 * Edits made to a file between two reconcile passes are imported as one
 * change and leave one version.
 *
 * A file is hashed in full on every scan. Document files are small, and the
 * hash is the only thing that tells an outside edit from NodeTool's own
 * write.
 *
 * A project folder can hold the folder of another project (`NestedFolders`).
 * A document file in there is the other project's document. It is never
 * read, written or deleted from here. A row of this project that names such
 * a path counts as a row whose file is missing, and its next save writes a
 * file of its own.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import {
  DOCUMENT_FILE_MISSING,
  LOOSE_PROJECT_ID,
  Project,
  createTimeOrderedUuid,
  type DocumentFileLocation,
  type DocumentFileRow,
  type DocumentFileSync
} from "@nodetool-ai/models";
import {
  WorkspacePathError,
  getProjectFolderResolver,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  isProjectAssetPathInFlux,
  withProjectFolderLock
} from "@nodetool-ai/asset-services/project-asset";
import {
  ProjectFolderUnavailableError,
  requireProjectFolder
} from "@nodetool-ai/asset-services/project-asset-file";
import {
  COPY_GRACE_MS,
  NestedFolders,
  isAtOrUnder,
  probePath,
  scanChangedPaths,
  scanFolder,
  type ReconcileOptions,
  type ScannedFolder
} from "./project-folder-scan.js";

const log = createLogger("nodetool.project-services.document-file-sync");

/** The version of the file format this module reads and writes. */
export const DOCUMENT_FILE_VERSION = 1;
/** What `file_error` holds for a row whose file is gone. */
export { DOCUMENT_FILE_MISSING };

/** Longest file name stem, in characters, before the collision suffix. */
const MAX_FILE_STEM = 100;
/** Highest collision suffix tried before giving up. */
const MAX_FILE_SUFFIX = 100_000;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
/** An ID a file may carry. Anything else is replaced by a new ID. */
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,127}$/;

/** Whether `id` is an ID a document file may carry. */
export function isDocumentFileId(id: string): boolean {
  return DOCUMENT_ID.test(id);
}

/** A row of a document kind that lives in the project folder. */
export interface DocumentRow extends DocumentFileRow {
  name: string;
  updated_at: string;
  file_error: string | null;
}

/** The file state a row records. */
export type DocumentFileState = Partial<
  Pick<DocumentRow, "file_path" | "file_hash" | "file_error">
>;

/** The user whose project folder holds a document file. */
export interface DocumentFileOwner {
  userId: string;
}

/**
 * Why a version is kept. `before-import`: the row as it was before a file
 * edit was imported. `replaced-file`: the content of a file edit that a save
 * in NodeTool is about to replace.
 */
export type DocumentSnapshotReason = "before-import" | "replaced-file";

/** What an adapter makes of a file's body: fields to store, or a refusal. */
export type DocumentFileContent<Fields> =
  | { ok: true; fields: Fields }
  | { ok: false; error: string };

/**
 * One document kind. `Fields` are the row fields the file carries besides
 * the ID. The name is the file name and is not among them.
 */
export interface DocumentFileAdapter<Row extends DocumentRow, Fields> {
  /** The kind, as logs name it: `workflow`. */
  kind: string;
  /** The directory NodeTool writes new files in: `Workflows`. */
  directory: string;
  /** The end of every file name of this kind: `.workflow.json`. */
  suffix: string;
  /** The `format` value of the file: `nodetool.workflow`. */
  format: string;
  /** File name stem for a document whose name has no usable character. */
  untitled: string;
  /** The fields of `row` the file carries. */
  fieldsOf(row: Row): Fields;
  /**
   * The file's body for `fields`, as the keys after `format`, `version` and
   * `id`, in the order they are written.
   */
  body(fields: Fields): Record<string, unknown>;
  /**
   * Check the body of a file and bring it into the stored shape. `row` is the
   * document the file belongs to, or null for a new file. `owner` is the user
   * whose folder holds the file. The check is the one the kind's update tool
   * runs.
   */
  parse(
    body: Record<string, unknown>,
    row: Row | null,
    owner: DocumentFileOwner
  ): Promise<DocumentFileContent<Fields>>;
  /** The rows whose project is one of `projectIds`. */
  list(userId: string, projectIds: readonly string[]): Promise<Row[]>;
  /** Whether any row, of any user, has exactly this ID. */
  exists(id: string): Promise<boolean>;
  /**
   * Keep the content `row` holds as a version. For `replaced-file` the row
   * is a copy that carries the fields of the file being replaced, so an
   * adapter reads the content from `row` either way. Without a reason it is
   * `before-import`.
   */
  snapshot(row: Row, reason?: DocumentSnapshotReason): Promise<void>;
  /**
   * Store `fields`, and `name` when given, unless the row changed since it
   * was read. Returns the stored row, or null when it had changed.
   */
  update(row: Row, fields: Partial<Fields>, name?: string): Promise<Row | null>;
  /**
   * Create a document from a new file, only when no row has the ID. Null
   * when a row has it, and that row is left exactly as it is: the ID comes
   * from a file, and a row with it can belong to another user or another
   * project. The insert itself must refuse a taken ID. A lookup followed by
   * an upsert does not, since the row can be created in between.
   */
  create(args: {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    fields: Fields;
  }): Promise<Row | null>;
  /** Record the file state without touching `updated_at`. */
  setFileState(id: string, state: DocumentFileState): Promise<void>;
}

/** What one reconcile of a project's document files changed. */
export interface DocumentFilesReport {
  projectId: string;
  /** Document files the reconcile compared. */
  files: number;
  /** Rows whose file has the hash the row records. */
  unchanged: number;
  /** IDs of rows whose content was imported from an edited file. */
  imported: string[];
  /** IDs of rows whose edited file was refused. The row is kept. */
  invalid: string[];
  /** IDs of rows whose file is gone. */
  missing: string[];
  /** IDs of rows pointed at the file their document was renamed or moved to. */
  renamed: string[];
  /** IDs of documents created from new files. */
  created: string[];
  /** IDs given to new files whose own ID belonged to another file. */
  reassigned: string[];
  /** IDs of rows whose file was written from the row. */
  written: string[];
  /** Paths of new files that were refused and belong to no document. */
  rejected: string[];
  /**
   * Paths of new files that are an exact copy of a document's file and wait
   * to be told apart from a move that has not finished.
   */
  deferred: string[];
}

// ── File text ───────────────────────────────────────────────────────────────

function hashOf(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * The text of a document file: pretty-printed, `format`, `version` and `id`
 * first, then the body in the adapter's key order, and a trailing newline.
 * Equal content always gives equal text.
 */
export function documentFileText<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  id: string,
  fields: Fields
): string {
  const file = {
    format: adapter.format,
    version: DOCUMENT_FILE_VERSION,
    id,
    ...adapter.body(fields)
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** A file read as a document: its ID, when it has a usable one, and body. */
type ParsedFile =
  | { ok: true; id: string | null; body: Record<string, unknown> }
  | { ok: false; error: string };

function parseDocumentFile(
  adapter: { format: string },
  text: string
): ParsedFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `The file is not valid JSON: ${reason}` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "The file is not a JSON object" };
  }
  const { format, version, id, ...body } = value as Record<string, unknown>;
  if (format !== adapter.format) {
    return {
      ok: false,
      error: `The file's "format" must be "${adapter.format}"`
    };
  }
  if (version !== DOCUMENT_FILE_VERSION) {
    return {
      ok: false,
      error: `The file's "version" must be ${DOCUMENT_FILE_VERSION}`
    };
  }
  return {
    ok: true,
    id: typeof id === "string" && DOCUMENT_ID.test(id) ? id : null,
    body
  };
}

// ── Paths ───────────────────────────────────────────────────────────────────

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function joinPath(directory: string, fileName: string): string {
  return directory ? `${directory}/${fileName}` : fileName;
}

function hasSuffix(path: string, suffix: string): boolean {
  return path.toLowerCase().endsWith(suffix) && fileNameOf(path).length > suffix.length;
}

/** The document name a file carries: its name without the kind's suffix. */
function nameOfFile(path: string, suffix: string): string {
  return fileNameOf(path).slice(0, -suffix.length);
}

/**
 * The file name stem for a document name, valid on every desktop OS. The
 * name is kept as it is where a file name can carry it, spaces included:
 * `Fox in snow` is `Fox in snow`. Path separators, characters Windows refuses
 * and control characters become spaces. Leading dots (a hidden file) and
 * trailing dots or spaces (refused by Windows) are dropped. A Windows device
 * name gets a suffix.
 */
export function documentFileStem(name: string, untitled: string): string {
  const cleaned = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- control characters are the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = Array.from(cleaned)
    .slice(0, MAX_FILE_STEM)
    .join("")
    .replace(/[. ]+$/, "")
    .trim();
  if (!stem) return untitled;
  return WINDOWS_RESERVED.test(stem) ? `${stem}-file` : stem;
}

// ── Folder ──────────────────────────────────────────────────────────────────

function isLooseProject(projectId: string | null | undefined): boolean {
  return !projectId || projectId === LOOSE_PROJECT_ID;
}

/**
 * The folder the documents of `projectId` have their files in, or null when
 * they have none: no project folders on this host, or a loose document of a
 * user who has no Personal project yet. Personal is never created here, since
 * saving a document must not make a project. Throws
 * {@link ProjectFolderUnavailableError} when the project has a folder that
 * cannot be reached.
 */
async function documentFolder(
  userId: string,
  projectId: string | null | undefined
): Promise<{ projectId: string; workspace: Workspace } | null> {
  if (!getProjectFolderResolver()) return null;
  let id = projectId;
  if (isLooseProject(projectId)) {
    const personal = await Project.findOwned(userId, `personal:${userId}`);
    if (!personal) return null;
    id = personal.id;
  }
  return requireProjectFolder(id, userId);
}

/** The project ids whose rows have their files in the folder of `projectId`. */
function projectIdsOfFolder(projectId: string, userId: string): string[] {
  return projectId === `personal:${userId}`
    ? [projectId, LOOSE_PROJECT_ID]
    : [projectId];
}

async function readText(
  workspace: Workspace,
  path: string
): Promise<string | null> {
  try {
    // A file in the folder of another project is that project's document.
    if (await new NestedFolders(workspace).holds(path)) return null;
    return await workspace.readText(path);
  } catch (error) {
    // A path the folder refuses holds no file this module can use.
    if (error instanceof WorkspacePathError) return null;
    throw error;
  }
}

/** The lower-cased names in `directory`. Empty when it does not exist. */
async function namesIn(
  workspace: Workspace,
  directory: string
): Promise<Set<string>> {
  try {
    const entries = await workspace.list(directory);
    return new Set(entries.map((entry) => entry.name.toLowerCase()));
  } catch {
    return new Set();
  }
}

// ── File state ──────────────────────────────────────────────────────────────

/** A document whose file state changed: its file became invalid, went missing, or is fine again. */
export interface DocumentFileStateChange {
  /** The adapter's kind: `workflow` or `timeline`. */
  kind: string;
  id: string;
  userId: string;
  /** The project whose folder holds the file. */
  projectId: string;
  filePath: string | null;
  fileError: string | null;
}

export type DocumentFileStateListener = (change: DocumentFileStateChange) => void;

const fileStateListeners = new Set<DocumentFileStateListener>();

/**
 * Call `listener` whenever the `file_error` a document records changes. The
 * file state is no content of the document and changes no `updated_at` or
 * etag, so no model change announces it. A host tells its clients from here,
 * so that a document shows its file error within seconds of the edit.
 * Returns a function that removes the listener.
 */
export function onDocumentFileStateChange(
  listener: DocumentFileStateListener
): () => void {
  fileStateListeners.add(listener);
  return () => fileStateListeners.delete(listener);
}

/**
 * Record `state` on the row and in the database, and tell the listeners when
 * `file_error` changed. Recording a `file_error` the row already has writes
 * nothing.
 */
async function recordFileState<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  row: Row,
  projectId: string,
  state: DocumentFileState
): Promise<void> {
  const before = row.file_error;
  const errorChanged =
    state.file_error !== undefined && state.file_error !== before;
  const onlyError = Object.keys(state).every((key) => key === "file_error");
  if (onlyError && !errorChanged) return;
  await adapter.setFileState(row.id, state);
  Object.assign(row, state);
  if (!errorChanged) return;
  const change: DocumentFileStateChange = {
    kind: adapter.kind,
    id: row.id,
    userId: row.user_id,
    projectId,
    filePath: row.file_path,
    fileError: row.file_error
  };
  for (const listener of fileStateListeners) {
    try {
      listener(change);
    } catch (error) {
      log.warn("A document file state listener failed", {
        id: row.id,
        error: describe(error)
      });
    }
  }
}

// ── NodeTool to file ────────────────────────────────────────────────────────

/**
 * Set while a reconcile stores what it read from a file. The model's save
 * hook then writes nothing: the reconcile holds the folder lock and records
 * the file state itself.
 */
const reconciling = new AsyncLocalStorage<true>();

/**
 * Write the file of `row` and record its path and hash on the row. Call it
 * under the folder lock.
 *
 * The file keeps its path while the document keeps its name. A new document
 * and a renamed one get `<name><suffix>` in the file's directory, or
 * `<name>-2<suffix>` and so on when that name is taken. The new file is
 * created with `Workspace.writeNew`, which never replaces a file, and the old
 * one is deleted after it. A file with the content to be written is left
 * untouched, so saving without a change leaves it byte-identical.
 *
 * The file on disk is compared with `file_hash` first. A file with another
 * hash holds an edit NodeTool has not seen. When it is valid, its content is
 * kept as a version and the file is then written. When it is not, the file
 * is left as it is, its error is recorded, and `"kept"` is returned: the row
 * is saved and the user's file is not lost.
 *
 * `Workspace.write` replaces a file through a temporary file and a rename in
 * a local folder, and with one object write in a storage-backed one, so a
 * reader never sees half a file.
 */
async function writeDocumentFile<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  workspace: Workspace,
  projectId: string,
  row: Row
): Promise<"written" | "kept"> {
  const text = documentFileText(adapter, row.id, adapter.fieldsOf(row));
  const stem = documentFileStem(row.name, adapter.untitled);
  let path = row.file_path;
  // A path in the folder of another project is not this document's file. The
  // row forgets it and gets a file in this folder, as a new document does.
  if (path && (await new NestedFolders(workspace).holds(path))) path = null;
  let current = path ? await readText(workspace, path) : null;
  if (path && current !== null) {
    const parsed = parseDocumentFile(adapter, current);
    // Another document's file is at the row's path. It is left alone.
    if (parsed.ok && parsed.id !== null && parsed.id !== row.id) {
      path = null;
      current = null;
    } else if (current !== text && hashOf(current) !== row.file_hash) {
      // The file was edited since NodeTool last wrote or imported it.
      const refusal = await keepUnseenEdit(adapter, row, parsed, text);
      if (refusal !== null) {
        await recordFileState(adapter, row, projectId, { file_error: refusal });
        return "kept";
      }
    }
  }

  let target: string | null = null;
  if (path && nameOfFile(path, adapter.suffix) === stem) {
    target = path;
  } else {
    const directory = path ? directoryOf(path) : adapter.directory;
    const taken = await namesIn(workspace, directory);
    const recorded = new Set<string>();
    const rows = await adapter.list(
      row.user_id,
      projectIdsOfFolder(projectId, row.user_id)
    );
    for (const other of rows) {
      if (other.id !== row.id && other.file_path) {
        recorded.add(other.file_path.toLowerCase());
      }
    }
    for (let n = 1; n <= MAX_FILE_SUFFIX && target === null; n++) {
      const fileName = `${n === 1 ? stem : `${stem}-${n}`}${adapter.suffix}`;
      const candidate = workspace.key(joinPath(directory, fileName));
      // The file already has the best name that is free.
      if (path && candidate.toLowerCase() === path.toLowerCase()) {
        target = path;
      } else if (
        !taken.has(fileName.toLowerCase()) &&
        // A name a row records for a file that is gone stays that row's.
        !recorded.has(candidate.toLowerCase()) &&
        (await workspace.writeNew(candidate, text, "application/json"))
      ) {
        target = candidate;
        if (path && current !== null) await workspace.delete(path);
        current = text;
      }
    }
    if (target === null) {
      throw new Error(`No free file name for "${stem}${adapter.suffix}"`);
    }
  }
  if (current !== text) {
    await workspace.write(target, text, "application/json");
  }
  await recordFileState(adapter, row, projectId, {
    file_path: target,
    file_hash: hashOf(text),
    file_error: null
  });
  return "written";
}

/**
 * Keep the content of a file edit that is about to be replaced by `text`,
 * the file text of `row`. Returns null when the file may be replaced: its
 * content is the row's, or it was kept as a version. Returns the reason the
 * file was refused when it is not valid, and the file must then stay.
 */
async function keepUnseenEdit<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  row: Row,
  parsed: ParsedFile,
  text: string
): Promise<string | null> {
  if (!parsed.ok) return parsed.error;
  const content = await adapter.parse(parsed.body, row, {
    userId: row.user_id
  });
  if (!content.ok) return content.error;
  // The same content in another layout is no edit to keep.
  if (documentFileText(adapter, row.id, content.fields) === text) return null;
  // A copy of the row that carries the file's fields, for the adapter to
  // read the content from.
  const edited: Row = Object.assign(
    Object.create(Object.getPrototypeOf(row) as object) as Row,
    row,
    content.fields
  );
  await adapter.snapshot(edited, "replaced-file");
  return null;
}

/** Delete the file at `path` when it is the file of document `id`. */
async function deleteDocumentFile(
  adapter: { format: string },
  workspace: Workspace,
  path: string,
  id: string
): Promise<void> {
  const text = await readText(workspace, path);
  if (text === null) return;
  const parsed = parseDocumentFile(adapter, text);
  // Another document's file took the path. It is not this document's to delete.
  if (parsed.ok && parsed.id !== null && parsed.id !== id) return;
  await workspace.delete(path);
}

/**
 * The edit NodeTool has not seen in the file `row` has at `path`, when the
 * file is `row`'s own and was changed since it had the hash `fileHash`. Null
 * when there is no file, the file is another document's, or it is untouched.
 */
async function unseenEditAt<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  workspace: Workspace,
  row: Row,
  path: string,
  fileHash: string | null
): Promise<{ parsed: ParsedFile; text: string } | null> {
  const current = await readText(workspace, path);
  if (current === null) return null;
  const parsed = parseDocumentFile(adapter, current);
  if (parsed.ok && parsed.id !== null && parsed.id !== row.id) return null;
  const text = documentFileText(adapter, row.id, adapter.fieldsOf(row));
  if (current === text || hashOf(current) === fileHash) return null;
  return { parsed, text };
}

/**
 * Why `row` cannot leave the project whose folder is `workspace`: its file
 * there holds an edit NodeTool has not seen and the edit is not valid. A move
 * deletes the file, and an edit that cannot be read can be kept in no
 * version. Null when the row may leave. Nothing is written but `file_error`.
 */
async function refusalToLeave<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  workspace: Workspace,
  row: Row,
  path: string
): Promise<string | null> {
  const edit = await unseenEditAt(adapter, workspace, row, path, row.file_hash);
  if (edit === null) return null;
  let reason: string;
  if (!edit.parsed.ok) {
    reason = edit.parsed.error;
  } else {
    const content = await adapter.parse(edit.parsed.body, row, {
      userId: row.user_id
    });
    if (content.ok) return null;
    reason = content.error;
  }
  if (row.file_error !== reason) {
    await adapter.setFileState(row.id, { file_error: reason });
    row.file_error = reason;
  }
  return (
    `Cannot move ${adapter.kind} "${row.name}" to another project: its file ` +
    `${path} was edited and is not valid. ${reason}\n` +
    "Fix the file or restore it, then move it again."
  );
}

/**
 * Delete the file `row` had at `path` in the project it left, where the row
 * recorded the hash `fileHash` for it. An edit NodeTool has not seen is kept
 * as a version first. A file whose edit is not valid is left in place: no
 * version can keep it, and deleting it would lose it.
 */
async function deleteFileLeftBehind<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  workspace: Workspace,
  row: Row,
  path: string,
  fileHash: string | null
): Promise<void> {
  const edit = await unseenEditAt(adapter, workspace, row, path, fileHash);
  if (edit !== null) {
    const refusal = await keepUnseenEdit(adapter, row, edit.parsed, edit.text);
    if (refusal !== null) {
      log.warn(`Left the edited file of a moved ${adapter.kind} in place`, {
        id: row.id,
        path,
        error: refusal
      });
      return;
    }
  }
  await deleteDocumentFile(adapter, workspace, path, row.id);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The sync a model installs for a document kind. Neither method throws. A
 * file that could not be written is written by the next reconcile, which
 * finds the row newer than its untouched file.
 */
export function documentFileSync<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>
): DocumentFileSync<Row> {
  const remove = async (
    userId: string,
    location: DocumentFileLocation,
    id: string
  ): Promise<void> => {
    try {
      const folder = await documentFolder(userId, location.project_id);
      if (!folder) return;
      await withProjectFolderLock(userId, folder.projectId, () =>
        deleteDocumentFile(adapter, folder.workspace, location.file_path, id)
      );
    } catch (error) {
      log.warn(`Could not delete the file of a ${adapter.kind}`, {
        id,
        error: describe(error)
      });
    }
  };

  const removeLeftBehind = async (
    row: Row,
    previous: DocumentFileLocation,
    fileHash: string | null
  ): Promise<void> => {
    try {
      const folder = await documentFolder(row.user_id, previous.project_id);
      if (!folder) return;
      await withProjectFolderLock(row.user_id, folder.projectId, () =>
        deleteFileLeftBehind(
          adapter,
          folder.workspace,
          row,
          previous.file_path,
          fileHash
        )
      );
    } catch (error) {
      log.warn(`Could not delete the file of a moved ${adapter.kind}`, {
        id: row.id,
        error: describe(error)
      });
    }
  };

  return {
    async leaving(row) {
      const path = row.file_path;
      if (reconciling.getStore() || !path) return null;
      try {
        const folder = await documentFolder(row.user_id, row.project_id);
        if (!folder) return null;
        return await withProjectFolderLock(row.user_id, folder.projectId, () =>
          refusalToLeave(adapter, folder.workspace, row, path)
        );
      } catch (error) {
        // A folder that cannot be reached holds no file to compare, and its
        // file cannot be deleted either.
        log.debug(`Could not look at the file of a ${adapter.kind} before a move`, {
          id: row.id,
          error: describe(error)
        });
        return null;
      }
    },

    async saved(row, previous) {
      if (reconciling.getStore()) return;
      try {
        if (previous) {
          // The document changed project. Its path is relative to the folder
          // it left, so the row forgets it before the file there is deleted.
          // A file left behind would be found there as a new document. An
          // edit to that file NodeTool has not seen is kept as a version.
          const previousHash = row.file_hash;
          const cleared = { file_path: null, file_hash: null, file_error: null };
          await adapter.setFileState(row.id, cleared);
          Object.assign(row, cleared);
          await removeLeftBehind(row, previous, previousHash);
        }
        const folder = await documentFolder(row.user_id, row.project_id);
        if (folder) {
          await withProjectFolderLock(row.user_id, folder.projectId, () =>
            writeDocumentFile(adapter, folder.workspace, folder.projectId, row)
          );
          return;
        }
      } catch (error) {
        const level =
          error instanceof ProjectFolderUnavailableError ? "debug" : "warn";
        log[level](`Could not write the file of a ${adapter.kind}`, {
          id: row.id,
          error: describe(error)
        });
      }
      // The row is now newer than its file, if it has one. `file_hash` still
      // names the file as last synced, and the reconcile writes the file once
      // it finds the file untouched and the row changed.
    },

    async deleted(row) {
      if (reconciling.getStore() || !row.file_path) return;
      await remove(
        row.user_id,
        { project_id: row.project_id, file_path: row.file_path },
        row.id
      );
    }
  };
}

/** Why a restore wrote no file. The message is for the user. */
export class DocumentFileRestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentFileRestoreError";
  }
}

/**
 * Write the file of `row` again from the row, and return the file state it
 * records. This is Restore on a document whose file is missing. The file has
 * the text NodeTool writes for the row, so a document that did not change
 * since its file was last written gets a byte-identical file back.
 *
 * The rules of a save hold: a file that is now at the path and holds an edit
 * NodeTool has not seen is kept as a version before it is replaced, and an
 * invalid one is not replaced at all. Throws
 * {@link DocumentFileRestoreError} then, and when the document has no folder
 * to write to. Throws `ProjectFolderUnavailableError` when its folder cannot
 * be reached.
 */
export async function restoreDocumentFile<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  row: Row
): Promise<DocumentFileState> {
  const folder = await documentFolder(row.user_id, row.project_id);
  if (!folder) {
    throw new DocumentFileRestoreError(
      `This ${adapter.kind} has no project folder to write its file to`
    );
  }
  const outcome = await withProjectFolderLock(
    row.user_id,
    folder.projectId,
    () => writeDocumentFile(adapter, folder.workspace, folder.projectId, row)
  );
  if (outcome === "kept") {
    throw new DocumentFileRestoreError(
      `The file at ${row.file_path ?? "its path"} was edited and is not valid, so it was kept: ${row.file_error ?? ""}`
    );
  }
  return {
    file_path: row.file_path,
    file_hash: row.file_hash,
    file_error: row.file_error
  };
}

// ── File to NodeTool ────────────────────────────────────────────────────────

/** One document file the scan found. */
interface DocumentFile {
  path: string;
  text: string;
  hash: string;
}

async function readDocumentFile(
  workspace: Workspace,
  path: string
): Promise<DocumentFile | null> {
  const text = await readText(workspace, path);
  return text === null ? null : { path, text, hash: hashOf(text) };
}

/** Per project: when each waiting copy (`path`, NUL, hash) was first seen. */
const waitingCopies = new Map<string, Map<string, number>>();

function waitingKey(path: string, hash: string): string {
  return `${path}\u0000${hash}`;
}

export interface DocumentReconcileOptions extends ReconcileOptions {
  /**
   * What a reconcile of the same folder found a moment ago. The document
   * files are then taken from it and the folder is not listed again. A row
   * whose file is not in it is looked at once more before it counts as
   * missing, since NodeTool may have written the file since.
   */
  scanned?: ScannedFolder;
  /**
   * Called when a file waits to be told apart from a move, so that the
   * caller can reconcile again once the wait is over. The triggers of the
   * asset index pass it. Without it the file is looked at by the next
   * reconcile, whenever that runs.
   */
  onDeferred?: () => void;
}

/**
 * The files of any kind in `adapters` the reconcile looks at, and the changed
 * paths that hold no file. With `scanned` nothing is listed. Without it and
 * without `paths` the whole folder is listed once.
 */
async function documentFilesInScope(
  workspace: Workspace,
  suffixes: readonly string[],
  { paths, scanned }: DocumentReconcileOptions,
  waiting: readonly string[]
): Promise<{ files: string[]; places: ReadonlySet<string> | null }> {
  const isDocument = (path: string): boolean =>
    suffixes.some((suffix) => hasSuffix(path, suffix));
  if (scanned) {
    const files = new Set([...scanned.files.keys()].filter(isDocument));
    // A copy waiting to be told apart from a move is looked at every time.
    for (const path of waiting) files.add(path);
    return { files: [...files], places: scanned.places };
  }
  if (!paths) {
    const all = await scanFolder(workspace);
    return { files: [...all.keys()].filter(isDocument), places: null };
  }
  const changed = await scanChangedPaths(workspace, [...paths, ...waiting]);
  return {
    files: [...changed.files.keys()].filter(isDocument),
    places: changed.places
  };
}

/** State one reconcile of one kind shares between its steps. */
interface KindReconcile<Row extends DocumentRow, Fields> {
  adapter: DocumentFileAdapter<Row, Fields>;
  workspace: Workspace;
  projectId: string;
  userId: string;
  report: DocumentFilesReport;
  onDeferred?: () => void;
}

/**
 * Store what a file holds on its row, and return the stored row. Null when
 * the file was refused, or the row changed since it was read and the next
 * reconcile tries again.
 *
 * The file's hash is recorded as it is on disk. The file is not rewritten,
 * so an editor that has it open sees no change it did not make. `rewrite`
 * asks for the canonical text instead, which carries the row's ID.
 */
async function importFile<Row extends DocumentRow, Fields>(
  run: KindReconcile<Row, Fields>,
  row: Row,
  file: DocumentFile,
  body: Record<string, unknown>,
  options: { rename?: string; rewrite?: boolean } = {}
): Promise<Row | null> {
  const { adapter, report } = run;
  const content = await adapter.parse(body, row, { userId: run.userId });
  if (!content.ok) {
    await recordInvalid(run, row, content.error);
    return null;
  }
  const next = documentFileText(adapter, row.id, content.fields);
  const changed = next !== documentFileText(adapter, row.id, adapter.fieldsOf(row));
  let stored: Row | null = row;
  if (changed || options.rename !== undefined) {
    if (changed) await adapter.snapshot(row);
    stored = await adapter.update(
      row,
      changed ? content.fields : {},
      options.rename
    );
    if (!stored) return null;
    if (changed) report.imported.push(row.id);
  }
  let hash = file.hash;
  if (options.rewrite && next !== file.text) {
    await run.workspace.write(file.path, next, "application/json");
    hash = hashOf(next);
  }
  const state = { file_path: file.path, file_hash: hash, file_error: null };
  await recordFileState(adapter, row, run.projectId, state);
  Object.assign(stored, state);
  return stored;
}

async function recordInvalid<Row extends DocumentRow, Fields>(
  run: KindReconcile<Row, Fields>,
  row: Row,
  error: string
): Promise<void> {
  run.report.invalid.push(row.id);
  await recordFileState(run.adapter, row, run.projectId, { file_error: error });
}

/**
 * Whether `row` holds other content than its untouched file, or a name the
 * file does not carry, so that the file is to be written from the row.
 *
 * A file NodeTool wrote has the row's text, which is compared first. A file
 * that was imported keeps the layout it was written in, so its content is
 * compared in the stored shape. A file name that differs from the row's
 * name only by a collision suffix or by case is the name the row was given.
 */
async function rowIsNewer<Row extends DocumentRow, Fields>(
  adapter: DocumentFileAdapter<Row, Fields>,
  row: Row,
  file: DocumentFile
): Promise<boolean> {
  const text = documentFileText(adapter, row.id, adapter.fieldsOf(row));
  if (file.text !== text) {
    const parsed = parseDocumentFile(adapter, file.text);
    if (!parsed.ok) return false;
    const content = await adapter.parse(parsed.body, row, {
      userId: row.user_id
    });
    if (!content.ok) return false;
    if (documentFileText(adapter, row.id, content.fields) !== text) return true;
  }
  const stem = documentFileStem(row.name, adapter.untitled).toLowerCase();
  const name = nameOfFile(file.path, adapter.suffix).toLowerCase();
  if (name === stem) return false;
  const suffix = name.startsWith(`${stem}-`) ? name.slice(stem.length + 1) : "";
  return !/^\d+$/.test(suffix);
}

/**
 * Files whose path differs from a row's path in case only.
 *
 * macOS and Windows folders ignore case. A file renamed there from
 * `Foo.workflow.json` to `foo.workflow.json` is listed under its new name
 * and still read under the old one. Matched by exact path, the row would
 * keep its path and the listed file would look like a copy of it.
 */
class RecasedFiles {
  private readonly byLowerPath = new Map<string, string[]>();
  private readonly rowPaths = new Set<string>();
  private readonly listings = new Map<string, Promise<Set<string> | null>>();

  constructor(
    private readonly workspace: Workspace,
    private readonly files: ReadonlyMap<string, DocumentFile>,
    rows: readonly DocumentRow[],
    private readonly places: ReadonlySet<string> | null
  ) {
    for (const path of files.keys()) {
      const key = path.toLowerCase();
      const bucket = this.byLowerPath.get(key);
      if (bucket) bucket.push(path);
      else this.byLowerPath.set(key, [path]);
    }
    for (const row of rows) if (row.file_path) this.rowPaths.add(row.file_path);
  }

  /**
   * The one file that has the path of a row in another case, when no file
   * is listed under the row's own path. Null otherwise: on a folder that
   * keeps case apart, both can be files of their own.
   */
  async fileOf(path: string): Promise<string | null> {
    const variants = (this.byLowerPath.get(path.toLowerCase()) ?? []).filter(
      (other) => other !== path && !this.rowPaths.has(other)
    );
    const [variant] = variants;
    if (variant === undefined || variants.length > 1) return null;
    return (await this.isListed(path)) ? null : variant;
  }

  /** Whether the folder lists a file under exactly this path. */
  private async isListed(path: string): Promise<boolean> {
    // A whole scan lists every file, so the files are the listing.
    if (this.places === null) return this.files.has(path);
    const directory = directoryOf(path);
    let listing = this.listings.get(directory);
    if (!listing) {
      listing = this.workspace.list(directory).then(
        (entries) => new Set(entries.map((entry) => entry.path)),
        () => null
      );
      this.listings.set(directory, listing);
    }
    const names = await listing;
    // A directory that cannot be listed gives no reason to move the row.
    return names === null || names.has(path);
  }
}

/** A new ID no document has. */
function newDocumentId(): string {
  return createTimeOrderedUuid();
}

async function reconcileKind<Row extends DocumentRow, Fields>(
  run: KindReconcile<Row, Fields>,
  files: Map<string, DocumentFile>,
  places: ReadonlySet<string> | null
): Promise<void> {
  const { adapter, workspace, projectId, userId, report } = run;
  const rows = await adapter.list(userId, projectIdsOfFolder(projectId, userId));
  const inFlux = (path: string): boolean =>
    isProjectAssetPathInFlux(userId, projectId, path);
  /** Paths of files that are a row's own file. */
  const owned = new Set<string>();
  /** Rows whose file is not where the row says, by ID. */
  const missing = new Map<string, Row>();
  /** Rows whose file is where the row says, by ID. */
  const present = new Map<string, Row>();
  const recased = new RecasedFiles(workspace, files, rows, places);
  const nested = new NestedFolders(workspace);

  // Rows that have a file.
  for (const row of rows) {
    const path = row.file_path;
    if (!path) continue;
    if (inFlux(path)) continue;
    // The path is in the folder of another project. The file there is that
    // project's document, so this row has lost its file wherever the changed
    // paths are.
    if (await nested.holds(path)) {
      missing.set(row.id, row);
      continue;
    }

    // A file renamed in case only. A folder that ignores case still answers
    // to the row's path, so the file must be matched before it can be taken
    // for a copy of itself.
    const variant = await recased.fileOf(path);
    const variantFile = variant === null ? undefined : files.get(variant);
    if (variant !== null && variantFile) {
      const parsed = parseDocumentFile(adapter, variantFile.text);
      if (parsed.ok && parsed.id === row.id && !owned.has(variant)) {
        // The row's path is no file of its own on that folder.
        files.delete(path);
        owned.add(variant);
        present.set(row.id, row);
        const name = nameOfFile(variant, adapter.suffix);
        const stored = await importFile(run, row, variantFile, parsed.body, {
          rename:
            documentFileStem(row.name, adapter.untitled) === name
              ? undefined
              : name
        });
        if (stored) {
          present.set(stored.id, stored);
          report.renamed.push(stored.id);
        }
        continue;
      }
    }

    let file = files.get(path);
    if (!file) {
      // Outside the changed paths: the file is taken to be where it was. A
      // row whose file is already missing counts too. A changed path that
      // carries its ID has the row's path looked at again, finds it gone,
      // and gives the file to the row instead of making a second document.
      const inScope = places === null || isAtOrUnder(path, places);
      if (!inScope) {
        present.set(row.id, row);
        continue;
      }
      // The file may have been written after the folder was listed.
      file = (await readDocumentFile(workspace, path)) ?? undefined;
      if (!file) {
        missing.set(row.id, row);
        continue;
      }
      files.set(path, file);
    }
    // Two rows for one file is an integrity error. The first keeps the file.
    if (owned.has(path)) continue;
    owned.add(path);
    present.set(row.id, row);
    if (file.hash === row.file_hash) {
      // The file is as NodeTool last wrote or imported it. The row may hold
      // other content since, or another name, and the file is then written.
      if (await rowIsNewer(adapter, row, file)) {
        const outcome = await writeDocumentFile(adapter, workspace, projectId, row);
        if (outcome === "written") {
          if (row.file_path !== path) owned.add(row.file_path ?? path);
          report.written.push(row.id);
          continue;
        }
      }
      report.unchanged++;
      await recordFileState(adapter, row, projectId, { file_error: null });
      continue;
    }
    // Any other hash is an edit NodeTool has not seen, also for a row that
    // was never synced with this folder (`file_hash` is null).
    const parsed = parseDocumentFile(adapter, file.text);
    if (!parsed.ok) {
      await recordInvalid(run, row, parsed.error);
      continue;
    }
    // A changed ID in a known file is restored: the file is rewritten.
    await importFile(run, row, file, parsed.body, {
      rewrite: parsed.id !== row.id
    });
  }

  // Files that are no row's own file.
  const projectKey = `${userId}\u0000${projectId}\u0000${adapter.kind}`;
  const waitingSince = waitingCopies.get(projectKey);
  const stillWaiting = new Map<string, number>();
  const unowned = [...files.values()]
    .filter((file) => !owned.has(file.path) && !inFlux(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const file of unowned) {
    const parsed = parseDocumentFile(adapter, file.text);
    if (!parsed.ok) {
      report.rejected.push(file.path);
      continue;
    }
    const name = nameOfFile(file.path, adapter.suffix);

    // The file of a row whose own file is gone: a rename or a move.
    const moved = parsed.id === null ? undefined : missing.get(parsed.id);
    if (moved) {
      missing.delete(moved.id);
      const renamed =
        documentFileStem(moved.name, adapter.untitled) === name ? undefined : name;
      const stored = await importFile(run, moved, file, parsed.body, {
        rename: renamed
      });
      if (stored) {
        owned.add(file.path);
        present.set(stored.id, stored);
        report.renamed.push(stored.id);
      }
      continue;
    }

    let id = parsed.id;
    const original = id === null ? undefined : present.get(id);
    const originalPath = original?.file_path;
    if (original && originalPath) {
      // The file carries the ID of a document whose file was there. That file
      // is looked at again: when it has gone since, this one is where the
      // document moved to.
      if ((await probePath(workspace, originalPath)) === null) {
        const renamed =
          documentFileStem(original.name, adapter.untitled) === name
            ? undefined
            : name;
        const stored = await importFile(run, original, file, parsed.body, {
          rename: renamed
        });
        if (stored) {
          owned.delete(originalPath);
          owned.add(file.path);
          present.set(stored.id, stored);
          report.renamed.push(stored.id);
        }
        continue;
      }
      // An exact copy of a document's file. A move that is a copy followed
      // by a delete looks like this until the delete lands, so the copy
      // waits before it becomes a document of its own.
      if (original.file_hash === file.hash) {
        const key = waitingKey(file.path, file.hash);
        const since = waitingSince?.get(key) ?? Date.now();
        if (Date.now() - since < COPY_GRACE_MS) {
          stillWaiting.set(key, since);
          report.deferred.push(file.path);
          continue;
        }
      }
    }

    // A new document. An ID another file or another row has is replaced.
    const taken = id !== null && (present.has(id) || (await adapter.exists(id)));
    let reassigned = id === null || taken;
    if (reassigned) id = newDocumentId();
    const content = await adapter.parse(parsed.body, null, { userId });
    if (!content.ok || id === null) {
      report.rejected.push(file.path);
      continue;
    }
    let text = reassigned
      ? documentFileText(adapter, id, content.fields)
      : file.text;
    if (reassigned) await workspace.write(file.path, text, "application/json");
    let created = await adapter.create({
      id,
      userId,
      projectId,
      name,
      fields: content.fields
    });
    if (!created) {
      // A row with this ID was created since it was looked up, by another
      // user or in another project. The create left that row alone, and the
      // file gets an ID of its own, as for an ID that was known to be taken.
      id = newDocumentId();
      reassigned = true;
      text = documentFileText(adapter, id, content.fields);
      await workspace.write(file.path, text, "application/json");
      created = await adapter.create({
        id,
        userId,
        projectId,
        name,
        fields: content.fields
      });
    }
    if (!created) {
      report.rejected.push(file.path);
      continue;
    }
    const state = { file_path: file.path, file_hash: hashOf(text), file_error: null };
    await adapter.setFileState(created.id, state);
    Object.assign(created, state);
    owned.add(file.path);
    present.set(created.id, created);
    (reassigned ? report.reassigned : report.created).push(created.id);
  }
  if (stillWaiting.size > 0) {
    waitingCopies.set(projectKey, stillWaiting);
    run.onDeferred?.();
  } else {
    waitingCopies.delete(projectKey);
  }

  // Rows whose file is gone and was not found elsewhere.
  for (const row of missing.values()) {
    // Never synced with this folder: there is no file of it to miss.
    if (row.file_hash === null) {
      await writeDocumentFile(adapter, workspace, projectId, row);
      report.written.push(row.id);
      continue;
    }
    report.missing.push(row.id);
    await recordFileState(adapter, row, projectId, {
      file_error: DOCUMENT_FILE_MISSING
    });
  }

  // Rows that never had a file: the migration of documents from before
  // project folders, and documents a host without this sync created.
  for (const row of rows) {
    if (row.file_path) continue;
    await writeDocumentFile(adapter, workspace, projectId, row);
    report.written.push(row.id);
  }
}

/** A list of document file adapters of any row and field types. */
export type DocumentFileAdapters = ReadonlyArray<
  // The engine reads rows and fields through the adapter only, so each
  // adapter keeps its own types and the list erases them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  DocumentFileAdapter<any, any>
>;

/**
 * Compare the document files in the folder of `projectId` with the rows of
 * every kind in `adapters` and apply the table at the top of this module. A
 * missing or loose project id names Personal.
 *
 * With `paths` only those paths are looked at, and a row whose file is not at
 * or below one of them is not marked missing. With `scanned` the files a
 * reconcile of the asset index just found are compared and nothing is listed.
 * Files waiting to be told apart from a move are looked at every time.
 *
 * Throws `ProjectFolderUnavailableError` when the folder cannot be reached,
 * and rethrows a listing failure. In both cases no row is changed.
 */
export async function reconcileDocumentFiles(
  adapters: DocumentFileAdapters,
  projectId: string | null | undefined,
  userId: string,
  options: DocumentReconcileOptions = {}
): Promise<DocumentFilesReport> {
  const folder = await requireProjectFolder(projectId, userId);
  // The asset reconcile's folder, with what it learned about nested folders.
  const workspace = options.scanned?.workspace ?? folder.workspace;
  const project = folder.projectId;
  return withProjectFolderLock(userId, project, () =>
    reconciling.run(true, async () => {
      const report: DocumentFilesReport = {
        projectId: project,
        files: 0,
        unchanged: 0,
        imported: [],
        invalid: [],
        missing: [],
        renamed: [],
        created: [],
        reassigned: [],
        written: [],
        rejected: [],
        deferred: []
      };
      const waiting: string[] = [];
      for (const adapter of adapters) {
        const key = `${userId}\u0000${project}\u0000${adapter.kind}`;
        for (const copy of waitingCopies.get(key)?.keys() ?? []) {
          waiting.push(copy.slice(0, copy.indexOf("\u0000")));
        }
      }
      const scope = await documentFilesInScope(
        workspace,
        adapters.map((adapter) => adapter.suffix),
        options,
        waiting
      );
      for (const adapter of adapters) {
        const files = new Map<string, DocumentFile>();
        for (const path of scope.files) {
          if (!hasSuffix(path, adapter.suffix)) continue;
          const file = await readDocumentFile(workspace, path);
          if (file) files.set(path, file);
        }
        report.files += files.size;
        await reconcileKind(
          {
            adapter,
            workspace,
            projectId: project,
            userId,
            report,
            onDeferred: options.onDeferred
          },
          files,
          scope.places
        );
      }
      return report;
    })
  );
}

/**
 * Write the file of every row of `projectId` that has none, and return how
 * many were written. Nothing else is compared. A second call writes nothing.
 */
export async function writeMissingDocumentFiles(
  adapters: DocumentFileAdapters,
  projectId: string | null | undefined,
  userId: string
): Promise<number> {
  const folder = await documentFolder(userId, projectId);
  if (!folder) return 0;
  const { workspace } = folder;
  return withProjectFolderLock(userId, folder.projectId, async () => {
    let written = 0;
    for (const adapter of adapters) {
      const rows = await adapter.list(
        userId,
        projectIdsOfFolder(folder.projectId, userId)
      );
      for (const row of rows) {
        // A row that has a path is compared with its file by the reconcile.
        if (row.file_path) continue;
        await writeDocumentFile(adapter, workspace, folder.projectId, row);
        written++;
      }
    }
    return written;
  });
}
