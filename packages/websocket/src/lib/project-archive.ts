/**
 * `.nodetool-project` project files: a whole project in one zip.
 *
 * Layout:
 *   manifest.json                — format, version, project name and kind,
 *                                  row counts, and a sha256 for every file
 *   records.json                 — every project row, table by table
 *                                  (`PROJECT_ARCHIVE_TABLES` in models)
 *   assets/<asset id><ext>       — stored bytes of each non-folder asset
 *   workspaces/<workspace id>/…  — every file in the project's workspaces
 *
 * Export copies rows whole, minus the owner and project columns, and the
 * workspace path, which only means something on the exporting machine.
 *
 * Import always creates a new project. Every row gets a fresh id, and every
 * reference to an exported id is rewritten wherever it appears: id columns,
 * document JSON, `asset://` locators, workspace file paths, and JSON files in
 * workspaces. Resource ids are 32 lowercase hex characters, so a reference is
 * any such token that names an exported row. Bytes are stored first and the
 * rows are inserted in one transaction, so a failed import leaves nothing
 * visible and removes the bytes it stored.
 */
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import nodePath from "node:path";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { z } from "zod";
import {
  getManagedWorkspaceDir,
  managedWorkspaceKey,
  workspaceStorageKind
} from "@nodetool-ai/config";
import {
  Asset,
  createTimeOrderedUuid,
  persistProjectArchive,
  PERSONAL_PROJECT_KIND,
  Project,
  PROJECT_ARCHIVE_TABLE_NAMES,
  PROJECT_ARCHIVE_TABLES,
  projectArchiveColumns,
  projectArchivePrimaryKey,
  readProjectArchiveRecords,
  Workspace,
  type ProjectArchiveRecords,
  type ProjectArchiveRow,
  type ProjectArchiveTableName
} from "@nodetool-ai/models";
import { getAssetFileName } from "@nodetool-ai/protocol";
import type { Workspace as RuntimeWorkspace } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import {
  getAssetStorageKey,
  localAssetPath,
  retrieveAssetBytes
} from "./asset-paths.js";
import { unzipBounded } from "./timeline-bundle.js";
import {
  exportSourceSize,
  MAX_ZIP_ENTRY_BYTES,
  sha256OfSource,
  type ExportSource,
  type ZipStreamWriter
} from "./zip-stream.js";

export const PROJECT_ARCHIVE_FORMAT = "nodetool-project";
export const PROJECT_ARCHIVE_VERSION = 1;
export const PROJECT_ARCHIVE_EXTENSION = ".nodetool-project";

/** Largest project file an import inflates, summed over its entries. */
export const MAX_PROJECT_ARCHIVE_BYTES = 1024 * 1024 * 1024;
/** Most entries a project file may hold. */
export const MAX_PROJECT_ARCHIVE_ENTRIES = 100_000;

const fileEntry = z.object({
  file: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string()
});

const manifestSchema = z.object({
  format: z.literal(PROJECT_ARCHIVE_FORMAT),
  version: z.number().int(),
  nodetool_version: z.string().optional(),
  created_at: z.string(),
  project: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.string(),
    thread_id: z.string().nullable().optional()
  }),
  counts: z.record(z.string(), z.number()),
  assets: z.array(fileEntry.extend({ id: z.string() })),
  workspace_files: z.array(
    fileEntry.extend({ workspace_id: z.string(), path: z.string() })
  ),
  skipped: z.array(
    z.object({ kind: z.string(), id: z.string(), reason: z.string() })
  )
});

export type ProjectArchiveManifest = z.infer<typeof manifestSchema>;

const recordsSchema = z.record(
  z.string(),
  z.array(z.record(z.string(), z.unknown()))
);

/** Columns never written to a file: they name the exporting owner and project. */
const OWNER_COLUMNS = ["user_id", "project_id"] as const;

/**
 * Nullable columns that link to another row. On import each keeps its link
 * only when the file carries the row it names.
 */
const OPTIONAL_REFERENCES: Partial<Record<ProjectArchiveTableName, Record<string, ProjectArchiveTableName | null>>> = {
  assets: { job_id: null, workflow_id: "workflows", sketch_document_id: "image_documents", timeline_id: "timeline_sequences" },
  workflows: { workspace_id: "workspaces" },
  storyboards: { timeline_id: "timeline_sequences" },
  scripts: { timeline_id: "timeline_sequences", storyboard_id: "storyboards" },
  timeline_sequences: { workflow_id: "workflows" },
  image_documents: { workflow_id: "workflows", thumbnail_asset_id: "assets" },
  threads: { workflow_id: "workflows" },
  messages: { workflow_id: "workflows" },
  game_draft_changes: { thread_id: "threads", message_id: "messages" }
};

/** Opens a workspace row for reading or writing its files. */
export type OpenWorkspace = (row: Workspace) => RuntimeWorkspace | null;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface WriteProjectArchiveOptions {
  readonly userId: string;
  readonly projectId: string;
  readonly storage: StorageAdapter;
  readonly openWorkspace: OpenWorkspace;
  readonly nodetoolVersion?: string;
  /** Aggregate decompressed limit, shared with the importer. */
  readonly maxBytes?: number;
}

function assetEntryName(asset: Asset): string {
  return `assets/${getAssetFileName(asset.id, asset.content_type)}`;
}

/** An asset's bytes as a local file when there is one, else read whole. */
async function assetSource(
  storage: StorageAdapter,
  asset: Asset
): Promise<ExportSource | null> {
  const path = await localAssetPath(
    storage,
    asset.user_id,
    asset.id,
    asset.content_type
  );
  if (path) {
    const { stat } = await import("node:fs/promises");
    try {
      return { path, size: (await stat(path)).size };
    } catch {
      return null;
    }
  }
  return retrieveAssetBytes(
    storage,
    asset.user_id,
    asset.id,
    asset.content_type
  );
}

function stripOwner(row: ProjectArchiveRow): ProjectArchiveRow {
  const copy = { ...row };
  for (const key of OWNER_COLUMNS) delete copy[key];
  return copy;
}

/**
 * Write a project to `writer`. The caller has checked that `userId` owns the
 * project. Returns the manifest that was written.
 */
export async function writeProjectArchive(
  options: WriteProjectArchiveOptions,
  writer: ZipStreamWriter
): Promise<ProjectArchiveManifest> {
  const { userId, storage } = options;
  const project = await Project.findOwned(userId, options.projectId);
  if (!project) throw new Error("Project not found");
  const records = await readProjectArchiveRecords(userId, project.id);
  let totalBytes = 0;
  let totalEntries = 0;
  let directoryBytes = 22;
  // Leave room for the multipart upload framing under the HTTP body limit.
  const uploadLimit = MAX_PROJECT_ARCHIVE_BYTES - 64 * 1024;
  const addEntry: ZipStreamWriter["add"] = async (name, source, entryOptions) => {
    totalBytes += exportSourceSize(source);
    totalEntries += 1;
    directoryBytes += 46 + Buffer.byteLength(name);
    if (totalEntries > MAX_PROJECT_ARCHIVE_ENTRIES) {
      throw new ProjectArchiveError("Project exceeds the importable archive entry limit");
    }
    if (totalBytes > (options.maxBytes ?? MAX_PROJECT_ARCHIVE_BYTES)) {
      throw new ProjectArchiveError("Project exceeds the importable archive size limit");
    }
    await writer.add(name, source, entryOptions);
    if (writer.bytesWritten + directoryBytes > uploadLimit) {
      throw new ProjectArchiveError("Project exceeds the importable upload size limit");
    }
  };

  const manifest: ProjectArchiveManifest = {
    format: PROJECT_ARCHIVE_FORMAT,
    version: PROJECT_ARCHIVE_VERSION,
    created_at: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      kind: project.kind,
      thread_id: project.thread_id
    },
    counts: {},
    assets: [],
    workspace_files: [],
    skipped: []
  };
  if (options.nodetoolVersion) {
    manifest.nodetool_version = options.nodetoolVersion;
  }

  // A game keeps its source in a workspace. A game made before workspaces
  // were filed under projects may point outside this one, so that workspace
  // travels too, limited to the game's own folder.
  const gameRoots = new Map<string, string[]>();
  for (const game of records.games) {
    const id = String(game["workspace_id"]);
    gameRoots.set(id, [
      ...(gameRoots.get(id) ?? []),
      String(game["source_root"])
    ]);
  }
  const workspaceRows = records.workspaces.map((row) => new Workspace(row));
  const projectWorkspaceIds = new Set(workspaceRows.map((row) => row.id));
  for (const id of gameRoots.keys()) {
    if (projectWorkspaceIds.has(id)) continue;
    const row = await Workspace.find(userId, id);
    if (!row) {
      manifest.skipped.push({
        kind: "workspace",
        id,
        reason: "A game's workspace no longer exists"
      });
      continue;
    }
    workspaceRows.push(row);
    records.workspaces.push({
      id: row.id,
      name: row.name,
      is_default: false,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  for (const row of records.assets) {
    const asset = new Asset(row);
    if (asset.content_type === "folder") continue;
    const source = await assetSource(storage, asset);
    if (!source) {
      manifest.skipped.push({
        kind: "asset",
        id: asset.id,
        reason: "No stored media"
      });
      continue;
    }
    const size = exportSourceSize(source);
    if (size > MAX_ZIP_ENTRY_BYTES) {
      manifest.skipped.push({
        kind: "asset",
        id: asset.id,
        reason: "Larger than 4 GiB"
      });
      continue;
    }
    const file = assetEntryName(asset);
    manifest.assets.push({
      id: asset.id,
      file,
      bytes: size,
      sha256: await sha256OfSource(source)
    });
    await addEntry(file, source);
  }

  for (const row of workspaceRows) {
    const workspace = options.openWorkspace(row);
    if (!workspace) {
      manifest.skipped.push({
        kind: "workspace",
        id: row.id,
        reason: "Workspace storage is unavailable"
      });
      continue;
    }
    const roots = projectWorkspaceIds.has(row.id)
      ? [""]
      : (gameRoots.get(row.id) ?? []);
    for (const root of roots) {
      let entries;
      try {
        entries = await workspace.list(root, { recursive: true });
      } catch (error) {
        manifest.skipped.push({
          kind: "workspace",
          id: row.id,
          reason: `Listing failed: ${error instanceof Error ? error.message : String(error)}`
        });
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const bytes = await workspace.read(entry.path);
        if (!bytes) continue;
        if (bytes.byteLength > MAX_ZIP_ENTRY_BYTES) {
          manifest.skipped.push({
            kind: "workspace_file",
            id: `${row.id}/${entry.path}`,
            reason: "Larger than 4 GiB"
          });
          continue;
        }
        const file = `workspaces/${row.id}/${entry.path}`;
        manifest.workspace_files.push({
          workspace_id: row.id,
          path: entry.path,
          file,
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex")
        });
        await addEntry(file, bytes);
      }
    }
  }

  const assetIds = new Set(records.assets.map((row) => String(row["id"])));
  const written = {} as ProjectArchiveRecords;
  for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
    written[name] = records[name].map((row) => {
      const copy = stripOwner(row);
      if (name === "workspaces") delete copy["path"];
      // A root-level asset's parent is the owner's id.
      if (name === "assets" && !assetIds.has(String(copy["parent_id"]))) {
        copy["parent_id"] = null;
      }
      return copy;
    });
    manifest.counts[name] = written[name].length;
  }
  await addEntry("records.json", strToU8(JSON.stringify(written)), {
    compress: true
  });
  await addEntry(
    "manifest.json",
    strToU8(JSON.stringify(manifest, null, 2)),
    { compress: true }
  );
  return manifest;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const RESOURCE_ID_TOKEN = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g;

/** Rewrites every exported id inside a value to its imported id. */
class IdRemapper {
  constructor(private readonly ids: ReadonlyMap<string, string>) {}

  string(value: string): string {
    const exact = this.ids.get(value);
    if (exact) return exact;
    return value.replace(RESOURCE_ID_TOKEN, (token) => this.ids.get(token) ?? token);
  }

  value(value: unknown): unknown {
    if (typeof value === "string") return this.string(value);
    if (Array.isArray(value)) return value.map((item) => this.value(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          this.string(key),
          this.value(child)
        ])
      );
    }
    return value;
  }
}

export interface ImportProjectArchiveOptions {
  readonly userId: string;
  /** The new project's name. Defaults to the name in the file. */
  readonly name?: string | undefined;
  readonly storage: StorageAdapter;
  readonly openWorkspace: OpenWorkspace;
  /** Where a new workspace keeps its files. Defaults to a managed folder. */
  readonly workspacePath?: (userId: string, workspaceId: string) => Promise<string>;
  /**
   * Stores one asset's bytes. Defaults to writing them under the asset's
   * storage key in `storage`; the server also renders a thumbnail.
   */
  readonly storeAssetBytes?: (args: {
    userId: string;
    assetId: string;
    contentType: string;
    bytes: Uint8Array;
  }) => Promise<void>;
  /** Removes every object created by the asset hook, including thumbnails. */
  readonly removeAssetBytes?: (userId: string, assetId: string, contentType: string) => Promise<void>;
  readonly maxBytes?: number;
}

export interface ImportProjectArchiveResult {
  readonly project: Project;
  readonly counts: Record<string, number>;
  /** Files the manifest lists that the archive does not carry. */
  readonly missing: string[];
  /** Files whose bytes do not match the manifest checksum. */
  readonly checksumMismatches: string[];
  /** What the exporting install could not include, from the manifest. */
  readonly skipped: ProjectArchiveManifest["skipped"];
}

export class ProjectArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectArchiveError";
  }
}

/** A managed folder for an imported workspace, the shape `isManaged` accepts. */
export async function managedImportWorkspacePath(
  userId: string,
  workspaceId: string
): Promise<string> {
  const segment = createHash("sha256").update(workspaceId).digest("hex");
  if (workspaceStorageKind() === "cloud") {
    return `${managedWorkspaceKey(userId)}/projects/${segment}`;
  }
  const dir = nodePath.join(getManagedWorkspaceDir(userId), "projects", segment);
  return dir;
}

function parseJsonEntry<T>(
  entries: Record<string, Uint8Array>,
  name: string,
  schema: z.ZodType<T>
): T {
  const bytes = entries[name];
  if (!bytes) throw new ProjectArchiveError(`Project file has no ${name}`);
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(bytes));
  } catch {
    throw new ProjectArchiveError(`${name} is not valid JSON`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ProjectArchiveError(`${name} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Reads a project file's manifest without importing it. */
export function readProjectArchiveManifest(
  zipBytes: Uint8Array
): ProjectArchiveManifest {
  const entries = unzipSync(zipBytes, {
    filter: (file) => file.name === "manifest.json"
  });
  return parseJsonEntry(entries, "manifest.json", manifestSchema);
}

/** Import a project file as a new project owned by `userId`. */
export async function importProjectArchive(
  zipBytes: Uint8Array,
  options: ImportProjectArchiveOptions
): Promise<ImportProjectArchiveResult> {
  const { userId, storage } = options;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipBounded(zipBytes, {
      maxBytes: options.maxBytes ?? MAX_PROJECT_ARCHIVE_BYTES,
      maxEntries: MAX_PROJECT_ARCHIVE_ENTRIES
    });
  } catch (error) {
    throw new ProjectArchiveError(
      error instanceof Error ? error.message : String(error)
    );
  }
  const manifest = parseJsonEntry(entries, "manifest.json", manifestSchema);
  if (manifest.version > PROJECT_ARCHIVE_VERSION) {
    throw new ProjectArchiveError(
      `Project file version ${manifest.version} is newer than this install reads (${PROJECT_ARCHIVE_VERSION})`
    );
  }
  const rawRecords = parseJsonEntry(entries, "records.json", recordsSchema);
  const records = {} as ProjectArchiveRecords;
  for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
    records[name] = rawRecords[name] ?? [];
  }

  // Fresh ids for the project and every row.
  const ids = new Map<string, string>();
  const newProjectId = createTimeOrderedUuid();
  ids.set(manifest.project.id, newProjectId);
  for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
    const key = projectArchivePrimaryKey(name);
    for (const row of records[name]) {
      const id = row[key];
      if (typeof id !== "string" || id === "") {
        throw new ProjectArchiveError(`A ${name} row has no ${key}`);
      }
      if (ids.has(id)) {
        throw new ProjectArchiveError(`Duplicate id ${id} in ${name}`);
      }
      ids.set(id, createTimeOrderedUuid());
    }
  }
  const tableIds = new Map(PROJECT_ARCHIVE_TABLE_NAMES.map((name) => [
    name, new Set(records[name].map((row) => row[projectArchivePrimaryKey(name)]))
  ]));
  for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
    const spec = PROJECT_ARCHIVE_TABLES[name];
    if (!("parent" in spec)) continue;
    const parentIds = tableIds.get(spec.parent.name);
    for (const row of records[name]) {
      if (!parentIds?.has(row[spec.parent.column])) {
        throw new ProjectArchiveError(`${name}.${spec.parent.column} must name a row in ${spec.parent.name}`);
      }
    }
  }
  for (const row of records.games) {
    if (!tableIds.get("workspaces")?.has(row["workspace_id"])) {
      throw new ProjectArchiveError("games.workspace_id must name an archived workspace");
    }
  }
  const remap = new IdRemapper(ids);

  const workspacePath =
    options.workspacePath ?? managedImportWorkspacePath;
  const imported = {} as ProjectArchiveRecords;
  for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
    const columns = new Set(projectArchiveColumns(name));
    const optionalRefs = OPTIONAL_REFERENCES[name] ?? {};
    imported[name] = records[name].map((source) => {
      const row = remap.value(source) as ProjectArchiveRow;
      if (columns.has("user_id")) row["user_id"] = userId;
      if (columns.has("project_id")) row["project_id"] = newProjectId;
      // A link to something the file does not carry would name a row on the
      // exporting install, so it is dropped rather than left dangling.
      for (const [ref, table] of Object.entries(optionalRefs)) {
        if (source[ref] != null && (!table || !tableIds.get(table)?.has(source[ref]))) row[ref] = null;
      }
      return row;
    });
  }
  for (const [index, row] of imported.assets.entries()) {
    // A root-level asset's parent is its owner's id, which differs here.
    if (!tableIds.get("assets")?.has(records.assets[index]!["parent_id"])) {
      row["parent_id"] = userId;
    }
    // An external path names a file on the exporting machine. Kept, it would
    // let a file point an asset at any path on this one.
    row["external_path"] = null;
  }
  // An import never publishes anything.
  for (const row of imported.workflows) row["access"] = "private";

  const missing: string[] = [];
  const checksumMismatches: string[] = [];
  const storedAssets: Array<{ assetId: string; contentType: string }> = [];
  const createdWorkspaces: RuntimeWorkspace[] = [];
  try {
    const workspaces = new Map<string, RuntimeWorkspace>();
    for (const [index, row] of imported.workspaces.entries()) {
      row["path"] = await workspacePath(userId, String(row["id"]));
      row["is_default"] = false;
      const opened = options.openWorkspace(new Workspace(row));
      if (!opened) {
        if (workspaceStorageKind() !== "cloud") await rm(String(row["path"]), { recursive: true, force: true });
        throw new ProjectArchiveError("Workspace storage is unavailable");
      }
      createdWorkspaces.push(opened);
      workspaces.set(String(records.workspaces[index]!["id"]), opened);
    }
    // Asset bytes.
    const assetRows = new Map(
      imported.assets.map((row, index) => [
        String(records.assets[index]!["id"]),
        row
      ])
    );
    for (const entry of manifest.assets) {
      const row = assetRows.get(entry.id);
      if (!row) continue;
      const bytes = entries[entry.file];
      if (!bytes) {
        missing.push(entry.file);
        continue;
      }
      if (sha256(bytes) !== entry.sha256) checksumMismatches.push(entry.file);
      const assetId = String(row["id"]);
      const contentType = String(row["content_type"]);
      row["size"] = bytes.byteLength;
      storedAssets.push({ assetId, contentType });
      if (options.storeAssetBytes) {
        await options.storeAssetBytes({ userId, assetId, contentType, bytes });
      } else {
        await storage.store(
          getAssetStorageKey(userId, assetId, contentType),
          bytes,
          contentType
        );
      }

    }

    // Versioned game drafts name a digest of their contents. Rehash after
    // rewriting IDs, then update both the filenames and history references.
    const draftVersions = new Map<string, string>();
    const draftPaths = new Map<string, string>();
    for (const entry of manifest.workspace_files) {
      const match = /\/drafts\/([a-f0-9]{64}(?:\.[A-Za-z0-9_-]+\.[a-f0-9]{32})?)\.json$/.exec(entry.path);
      const bytes = entries[entry.file];
      if (!match || !bytes) continue;
      const previous = match[1];
      const rewritten = remapJsonText(bytes, remap);
      const next = sha256(rewritten) + remap.string(previous.slice(64));
      draftVersions.set(previous, next);
      draftPaths.set(entry.path, remap.string(entry.path.slice(0, -previous.length - 5)) + next + ".json");
    }
    for (const [index, row] of imported.games.entries()) {
      const original = records.games[index];
      const previous = original?.["draft_version_id"];
      if (typeof previous === "string" && draftVersions.has(previous)) row["draft_version_id"] = draftVersions.get(previous);
    }
    for (const [index, row] of imported.game_draft_changes.entries()) {
      const previous = records.game_draft_changes[index]?.["before_digest"];
      if (typeof previous === "string" && draftVersions.has(previous)) row["before_digest"] = draftVersions.get(previous);
    }
    for (const entry of manifest.workspace_files) {
      const workspace = workspaces.get(entry.workspace_id);
      if (!workspace) continue;
      const bytes = entries[entry.file];
      if (!bytes) {
        missing.push(entry.file);
        continue;
      }
      if (sha256(bytes) !== entry.sha256) checksumMismatches.push(entry.file);
      const path = draftPaths.get(entry.path) ?? remap.string(entry.path);
      // Game sources and drafts are JSON that names their own ids.
      const data = path.endsWith(".json")
        ? remapJsonText(bytes, remap)
        : bytes;
      await workspace.write(path, data);
    }

    const project = new Project({
      id: newProjectId,
      user_id: userId,
      name: options.name?.trim() || manifest.project.name,
      // Every account has exactly one Personal project, so its copy is an
      // ordinary named project.
      kind:
        manifest.project.kind === PERSONAL_PROJECT_KIND
          ? ""
          : manifest.project.kind,
      thread_id: null
    });
    const threadId = manifest.project.thread_id;
    project.thread_id = typeof threadId === "string" && tableIds.get("threads")?.has(threadId) ? remap.string(threadId) : null;
    project.beforeSave();
    await persistProjectArchive({
      project: {
        id: project.id,
        user_id: project.user_id,
        name: project.name,
        kind: project.kind,
        archived_at: null,
        deleted_at: null,
        thread_id: project.thread_id,
        created_at: project.created_at,
        updated_at: project.updated_at
      },
      records: imported
    });

    const counts: Record<string, number> = {};
    for (const name of PROJECT_ARCHIVE_TABLE_NAMES) {
      counts[name] = imported[name].length;
    }
    return {
      project,
      counts,
      missing,
      checksumMismatches,
      skipped: manifest.skipped
    };
  } catch (error) {
    await Promise.allSettled([
      ...storedAssets.map(({ assetId, contentType }) => options.removeAssetBytes
        ? options.removeAssetBytes(userId, assetId, contentType)
        : storage.delete(storage.uriForKey(getAssetStorageKey(userId, assetId, contentType)))),
      ...createdWorkspaces.map(async (workspace) => {
        try {
          await workspace.deleteAll("");
        } finally {
          if (workspace.localDir) await rm(workspace.localDir, { recursive: true, force: true });
        }
      })
    ]);
    throw error;
  }
}

/** A JSON file's text with exported ids rewritten; other bytes unchanged. */
function remapJsonText(bytes: Uint8Array, remap: IdRemapper): Uint8Array {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes;
  }
  return strToU8(remap.string(text));
}

