/**
 * The asset manifest of a project folder (PRD T3): `.nodetool/assets.json`.
 *
 * It lists every asset row that keeps its file in the folder, with the file's
 * path and fingerprint. The database stays the runtime read path. The
 * manifest travels with the folder, so that a copy of the folder can restore
 * the same asset ids.
 *
 * The file is written through the folder's reserved directory, which no run
 * code can reach. New contents go to a temporary file first and take the
 * manifest's place only once they are complete, so a write that is
 * interrupted leaves the previous manifest as it was.
 */
import { createLogger } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import {
  ProjectFolderUnavailableError,
  requireProjectFolder
} from "@nodetool-ai/asset-services/project-asset-file";
import { DebouncedRuns } from "./debounced-runs.js";

const log = createLogger("nodetool.project-services.project-manifest");

/** The manifest's file name inside the folder's reserved directory. */
export const ASSET_MANIFEST_FILE = "assets.json";
/** Where new contents are written before they replace the manifest. */
export const ASSET_MANIFEST_TEMP_FILE = `${ASSET_MANIFEST_FILE}.tmp`;

/** Quiet time after the last index change before the manifest is written. */
export const MANIFEST_DEBOUNCE_MS = 1_000;
/** Longest a manifest write waits while the index keeps changing, in ms. */
export const MANIFEST_MAX_WAIT_MS = 10_000;

/** One asset in the manifest. A part the row does not record is null. */
export interface AssetManifestEntry {
  id: string;
  /** The file's path relative to the project folder. */
  path: string;
  size: number | null;
  /** Last-modified time of the file, in ms since the epoch. */
  mtime: number | null;
  /** SHA-256 over the first and last 1 MiB of the file plus its size. */
  partial_hash: string | null;
  /** SHA-256 of the whole file. Absent until the hash job has read it. */
  content_hash?: string;
}

/** The contents of `.nodetool/assets.json`. */
export interface AssetManifest {
  format: "nodetool.assets";
  version: 1;
  assets: AssetManifestEntry[];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** The manifest of `rows`, ordered by path so equal indexes give equal files. */
export function assetManifestOf(rows: readonly Asset[]): AssetManifest {
  const assets: AssetManifestEntry[] = [];
  for (const row of rows) {
    if (!row.workspace_path) continue;
    const hash = row.metadata?.["workspace_hash"];
    const entry: AssetManifestEntry = {
      id: row.id,
      path: row.workspace_path,
      size: numberOrNull(row.metadata?.["workspace_size"]),
      mtime: numberOrNull(row.metadata?.["workspace_mtime"]),
      partial_hash: typeof hash === "string" ? hash : null
    };
    if (row.content_hash) entry.content_hash = row.content_hash;
    assets.push(entry);
  }
  assets.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.id < b.id ? -1 : 1
  );
  return { format: "nodetool.assets", version: 1, assets };
}

/**
 * Write `manifest` into `nodetoolDir`, the folder's reserved directory.
 * False when the manifest there already has these contents.
 *
 * The contents go to {@link ASSET_MANIFEST_TEMP_FILE} and are then moved onto
 * {@link ASSET_MANIFEST_FILE}. A write that stops halfway stops in the
 * temporary file, and the manifest keeps its previous, complete contents.
 */
export async function writeAssetManifest(
  nodetoolDir: Workspace,
  manifest: AssetManifest
): Promise<boolean> {
  const contents = `${JSON.stringify(manifest, null, 2)}\n`;
  if ((await nodetoolDir.readText(ASSET_MANIFEST_FILE)) === contents) {
    return false;
  }
  await nodetoolDir.write(
    ASSET_MANIFEST_TEMP_FILE,
    contents,
    "application/json"
  );
  await nodetoolDir.move(ASSET_MANIFEST_TEMP_FILE, ASSET_MANIFEST_FILE);
  return true;
}

const writes = new Map<string, Promise<void>>();

function manifestKey(projectId: string, userId: string): string {
  return `${userId}\u0000${projectId}`;
}

/**
 * Write the manifest of the project's folder from its asset rows, now. A
 * missing or loose project id names Personal. Writes for one folder run one
 * after another, so two never share the temporary file.
 *
 * Throws `ProjectFolderUnavailableError` when the folder cannot be reached.
 */
export async function writeProjectAssetManifest(
  projectId: string | null | undefined,
  userId: string
): Promise<void> {
  const folder = await requireProjectFolder(projectId, userId);
  const { nodetoolDir } = folder;
  if (!nodetoolDir) {
    throw new ProjectFolderUnavailableError(
      "The project folder has no reserved directory to write the asset manifest to"
    );
  }
  const key = manifestKey(folder.projectId, userId);
  const write = async (): Promise<void> => {
    const rows = await Asset.listProjectFiles(userId, folder.projectId);
    await writeAssetManifest(nodetoolDir, assetManifestOf(rows));
  };
  const next = (writes.get(key) ?? Promise.resolve()).then(write, write);
  const settled = next.catch(() => undefined);
  writes.set(key, settled);
  void settled.then(() => {
    if (writes.get(key) === settled) writes.delete(key);
  });
  return next;
}

const scheduled = new DebouncedRuns({
  debounceMs: MANIFEST_DEBOUNCE_MS,
  maxWaitMs: MANIFEST_MAX_WAIT_MS,
  onError: (error) => {
    const message = error instanceof Error ? error.message : String(error);
    // A folder that is away is reported where the project is shown.
    if (error instanceof ProjectFolderUnavailableError) {
      log.debug("Skipped writing an asset manifest", { reason: message });
    } else {
      log.warn("Writing an asset manifest failed", { error: message });
    }
  }
});

/** Write the project's asset manifest soon, debounced. Never throws. */
export function scheduleAssetManifestWrite(
  projectId: string,
  userId: string
): void {
  scheduled.schedule(manifestKey(projectId, userId), () =>
    writeProjectAssetManifest(projectId, userId)
  );
}

/** Run every scheduled manifest write now and wait for all of them. */
export async function flushAssetManifestWrites(): Promise<void> {
  await scheduled.flush();
}
