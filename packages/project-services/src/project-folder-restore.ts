/**
 * Take over a project folder that another install wrote (PRD T1, T3, US12).
 *
 * A folder carries its assets in `.nodetool/assets.json` and its workflows
 * and timelines as files. Opening it on another machine restores them:
 *
 * | Folder | Result |
 * | --- | --- |
 * | Its project is unknown on this install | Asset rows get the IDs and paths the manifest records. Workflows and timelines keep the IDs in their files. |
 * | It is a copy of a project on this install | Every asset, workflow and timeline gets a new ID, and the references in the workflow and timeline files are rewritten. |
 * | An ID it carries belongs to another row on this install | That one ID is replaced, and the references to it are rewritten. |
 *
 * The work has two steps. {@link restoreProjectFolder} runs before the folder
 * is the project's folder, so no reconcile can see the folder first and give
 * its files new IDs. It creates the asset rows and rewrites the files.
 * {@link finishProjectFolderRestore} runs once the project has the folder. It
 * reconciles the index, which marks an asset whose file is absent as offline
 * and creates the workflows and timelines from their files, and writes the
 * manifest again.
 *
 * Everything in the folder is untrusted input. An asset row is inserted and
 * never updated, so an ID that is taken cannot change the row that has it. A
 * manifest path is checked by the folder's `Workspace`, which refuses a path
 * that leaves the folder or enters `.nodetool/`. A fingerprint the manifest
 * records is compared with the file and never stored for a file that is
 * there. No file is deleted or moved. The only files written are workflow
 * and timeline files whose IDs changed.
 */
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { Asset, createTimeOrderedUuid } from "@nodetool-ai/models";
import { isFullResourceId } from "@nodetool-ai/protocol";
import type { Workspace } from "@nodetool-ai/runtime";
import { partialContentHashOfWorkspaceFile } from "@nodetool-ai/asset-services/project-asset-file";
import { isDocumentFileId } from "./document-file-sync.js";
import { remapResourceIds } from "./id-remap.js";
import {
  contentTypeOfFile,
  reconcileInBackground,
  scanFolder
} from "./project-index.js";
import {
  readAssetManifest,
  writeProjectAssetManifest,
  type AssetManifestEntry
} from "./project-manifest.js";
import { timelineFileAdapter } from "./timeline-file.js";
import { workflowFileAdapter } from "./workflow-file.js";

const log = createLogger("nodetool.project-services.project-folder-restore");

/** The document kinds that are files in the folder, as the restore reads them. */
const DOCUMENT_KINDS = [workflowFileAdapter, timelineFileAdapter].map(
  ({ kind, suffix, format, exists }) => ({ kind, suffix, format, exists })
);
type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Attempts at a free ID for one row before the restore gives up on it. */
const MAX_ID_ATTEMPTS = 3;

export interface RestoreProjectFolderArgs {
  userId: string;
  /** The project the folder belongs to from now on. Its row exists. */
  projectId: string;
  /** The folder. */
  workspace: Workspace;
  /** The folder's reserved directory, where the manifest is. */
  nodetoolDir: Workspace;
  /**
   * The project ID the folder carries when the folder is a copy of a project
   * on this install. Every ID in the folder is then replaced. Null keeps the
   * IDs that are free.
   */
  copyOf: string | null;
}

/** What {@link restoreProjectFolder} did. */
export interface ProjectFolderRestoreReport {
  /** IDs of the asset rows created from the manifest. */
  assets: string[];
  /** The new ID of every ID that was replaced, by the ID the folder carried. */
  replaced: Map<string, string>;
  /** Paths of the workflow and timeline files that were rewritten. */
  rewritten: string[];
  /** Manifest entries that were left out: a refused path, or a repeated ID or path. */
  skipped: number;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** What a restored row records about its file. */
interface RestoredFile {
  path: string;
  size: number | null;
  /** The fingerprint as a row keeps it, or null for the reconcile to take. */
  metadata: Record<string, string | number> | null;
  contentHash: string | null;
}

/**
 * What the row of `entry` records about its file, or null when the folder
 * refuses the path. A path is refused when it leaves the folder, enters
 * `.nodetool/`, names a directory, or reaches its file through a link that
 * leaves the folder. It is also refused when it is not written the way the
 * folder keys a path, as an absolute path is. NodeTool writes every manifest
 * path in that form, so any other form was not written by NodeTool.
 *
 * A fingerprint is never taken from the manifest for a file that is there.
 * The file is measured, and the full hash the manifest records is kept only
 * when the file has the size and partial hash the manifest records. Any
 * other file is left for the reconcile, which reads it as a changed file. A
 * file that is absent keeps the recorded fingerprint, which is what the
 * reconcile matches a moved file by.
 */
async function restoredFileOf(
  workspace: Workspace,
  entry: AssetManifestEntry
): Promise<RestoredFile | null> {
  const path = entry.path;
  try {
    if (workspace.key(path) !== path) return null;
    // `stat` follows the path on disk and refuses one that leaves the folder.
    const info = await workspace.stat(path);
    if (info?.isDirectory) return null;
    if (!info) {
      const { size, mtime, partial_hash: hash } = entry;
      const recorded = size !== null && mtime !== null && hash !== null;
      return {
        path,
        size,
        metadata: recorded
          ? { workspace_size: size, workspace_mtime: mtime, workspace_hash: hash }
          : null,
        contentHash: null
      };
    }
    const unmeasured = { path, size: info.size, metadata: null, contentHash: null };
    if (entry.partial_hash === null || entry.size !== info.size) return unmeasured;
    const hash = await partialContentHashOfWorkspaceFile(workspace, path);
    if (hash !== entry.partial_hash) return unmeasured;
    return {
      path,
      size: info.size,
      metadata: {
        workspace_size: info.size,
        workspace_mtime: info.modifiedAt,
        workspace_hash: hash
      },
      contentHash: entry.content_hash ?? null
    };
  } catch {
    return null;
  }
}

/**
 * Create the asset rows the manifest lists. A row keeps the manifest's ID
 * unless the folder is a copy or the ID is taken, and `replaced` then gets
 * the new ID.
 */
async function restoreAssets(
  args: RestoreProjectFolderArgs,
  report: ProjectFolderRestoreReport
): Promise<void> {
  const { userId, projectId, workspace, nodetoolDir } = args;
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const entry of await readAssetManifest(nodetoolDir)) {
    // A repeated ID or path is left out before its file is read.
    const file =
      ids.has(entry.id) || paths.has(entry.path)
        ? null
        : await restoredFileOf(workspace, entry);
    if (file === null) {
      report.skipped++;
      continue;
    }
    ids.add(entry.id);
    paths.add(file.path);

    let created: Asset | null = null;
    let id = args.copyOf === null ? entry.id : createTimeOrderedUuid();
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !created; attempt++) {
      created = await Asset.insertNew({
        id,
        user_id: userId,
        project_id: projectId,
        // The user's home folder, where an asset with no folder of its own lists.
        parent_id: userId,
        name: fileName(file.path),
        content_type: contentTypeOfFile(file.path),
        workspace_path: file.path,
        size: file.size,
        metadata: file.metadata,
        content_hash: file.contentHash
      });
      // The ID belongs to another row, which is left as it is.
      if (!created) id = createTimeOrderedUuid();
    }
    if (!created) {
      report.skipped++;
      continue;
    }
    report.assets.push(created.id);
    if (created.id !== entry.id) report.replaced.set(entry.id, created.id);
  }
}

/** A document file as JSON: an object, with whatever keys it has. */
const documentFile = z.looseObject({});
/** The `id` of a document file, when it is a string. */
const documentFileId = z.string();

/** One workflow or timeline file in the folder. */
interface FolderDocument {
  path: string;
  kind: DocumentKind;
  /** The file as JSON, with its keys in the order the file has them. */
  content: z.infer<typeof documentFile>;
  /** The ID the file carries, when it has a usable one. */
  id: string | null;
}

/** The workflow and timeline files in the folder that read as such, by path. */
async function documentsIn(workspace: Workspace): Promise<FolderDocument[]> {
  const documents: FolderDocument[] = [];
  const files = [...(await scanFolder(workspace)).keys()].sort();
  for (const path of files) {
    const kind = DOCUMENT_KINDS.find(
      ({ suffix }) =>
        path.toLowerCase().endsWith(suffix) &&
        fileName(path).length > suffix.length
    );
    if (!kind) continue;
    let content: z.infer<typeof documentFile>;
    try {
      const text = await workspace.readText(path);
      if (text === null) continue;
      const parsed = documentFile.safeParse(JSON.parse(text));
      if (!parsed.success || parsed.data["format"] !== kind.format) continue;
      content = parsed.data;
    } catch {
      // Not JSON, or a path the folder refuses. The reconcile reports it.
      continue;
    }
    const id = documentFileId.safeParse(content["id"]);
    documents.push({
      path,
      kind,
      content,
      id: id.success && isDocumentFileId(id.data) ? id.data : null
    });
  }
  return documents;
}

/**
 * Choose a new ID for every document file whose ID cannot stay: all of them
 * in a copy, and otherwise each one whose ID a row on this install has. The
 * new ID of a file is returned by path. `replaced` gets the first file of
 * each ID, since a reference to that ID means that file.
 */
async function replaceDocumentIds(
  documents: readonly FolderDocument[],
  copy: boolean,
  replaced: Map<string, string>
): Promise<Map<string, string>> {
  const newIds = new Map<string, string>();
  const seen = new Set<string>();
  for (const document of documents) {
    if (document.id === null) continue;
    const key = `${document.kind.kind}\u0000${document.id}`;
    const repeated = seen.has(key);
    seen.add(key);
    // A second file with one ID is given its own by the reconcile.
    if (repeated && !copy) continue;
    if (!copy && !(await document.kind.exists(document.id))) continue;
    const id = createTimeOrderedUuid();
    newIds.set(document.path, id);
    // Only an ID of the shape NodeTool generates is safe to replace wherever
    // it occurs as a string.
    if (!repeated && isFullResourceId(document.id) && !replaced.has(document.id)) {
      replaced.set(document.id, id);
    }
  }
  return newIds;
}

/**
 * Create the asset rows of a folder that is about to become the folder of
 * `projectId`, and rewrite the IDs in its workflow and timeline files that
 * cannot stay. Call it before the project is given the folder, and
 * {@link finishProjectFolderRestore} after.
 *
 * Rows are only inserted. When a later step fails, the caller removes them
 * with {@link discardRestoredAssets}.
 */
export async function restoreProjectFolder(
  args: RestoreProjectFolderArgs
): Promise<ProjectFolderRestoreReport> {
  const { workspace, projectId, copyOf } = args;
  const report: ProjectFolderRestoreReport = {
    assets: [],
    replaced: new Map(),
    rewritten: [],
    skipped: 0
  };
  try {
    await restoreAssets(args, report);
    const documents = await documentsIn(workspace);
    const newIds = await replaceDocumentIds(
      documents,
      copyOf !== null,
      report.replaced
    );
    if (copyOf !== null && isFullResourceId(copyOf) && !report.replaced.has(copyOf)) {
      report.replaced.set(copyOf, projectId);
    }
    if (report.replaced.size === 0 && newIds.size === 0) return report;

    for (const document of documents) {
      const remapped = remapResourceIds(document.content, report.replaced);
      const id = newIds.get(document.path);
      const next = id === undefined ? remapped : { ...remapped, id };
      if (JSON.stringify(next) === JSON.stringify(document.content)) continue;
      await workspace.write(
        document.path,
        `${JSON.stringify(next, null, 2)}\n`,
        "application/json"
      );
      report.rewritten.push(document.path);
    }
    return report;
  } catch (error) {
    await discardRestoredAssets(args.userId, report.assets);
    throw error;
  }
}

/**
 * Remove the asset rows a restore created, when the project could not be
 * given the folder after all. Only rows are removed. Every file stays.
 */
export async function discardRestoredAssets(
  userId: string,
  assetIds: readonly string[]
): Promise<void> {
  for (const asset of await Asset.findMany(userId, [...assetIds])) {
    try {
      await asset.delete();
    } catch (error) {
      log.warn("Could not remove the row of a restored asset", {
        assetId: asset.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Finish a restore once the project has the folder: reconcile the folder,
 * which marks an asset whose file is absent as offline, gives media the
 * manifest does not list a row, and creates the workflows and timelines from
 * their files. Then write the manifest from the rows, so that it names the
 * IDs this install uses.
 *
 * A failure is logged and not thrown. The project is open by then, and the
 * reconcile that runs when it is next opened does the same work.
 */
export async function finishProjectFolderRestore(
  projectId: string,
  userId: string
): Promise<void> {
  try {
    await reconcileInBackground(projectId, userId);
    await writeProjectAssetManifest(projectId, userId);
  } catch (error) {
    log.warn("Could not finish restoring a project folder", {
      projectId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
