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
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import { isFullResourceId } from "@nodetool-ai/protocol";
import type { Workspace } from "@nodetool-ai/runtime";
import {
  ProjectFolderUnavailableError,
  requireProjectFolder
} from "@nodetool-ai/asset-services/project-asset-file";
import { DebouncedRuns } from "./debounced-runs.js";
import { NestedFolders } from "./project-folder-scan.js";

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

/** A SHA-256 in hex, the form both hashes of an entry are written in. */
const SHA_256 = /^[0-9a-f]{64}$/;
/** Longest path an entry may name, in characters. */
const MAX_MANIFEST_PATH = 4096;

/**
 * One entry as a manifest holds it. The ID and the path decide whether the
 * entry is used at all. A fingerprint part that is not of its type reads as
 * not recorded, which makes the reconcile read the file.
 */
const manifestEntry = z.object({
  id: z.string().refine(isFullResourceId),
  path: z.string().min(1).max(MAX_MANIFEST_PATH),
  size: z.number().int().nonnegative().nullable().catch(null),
  mtime: z.number().nonnegative().nullable().catch(null),
  partial_hash: z.string().regex(SHA_256).nullable().catch(null),
  content_hash: z.string().regex(SHA_256).optional().catch(undefined)
});

const manifestFile = z.object({
  format: z.literal("nodetool.assets"),
  version: z.literal(1),
  assets: z.array(z.json())
});

/**
 * The entries of the manifest in `nodetoolDir`, for restoring a folder that
 * another install wrote. Empty when the folder has no manifest or the file is
 * not one.
 *
 * The file is read as untrusted input. An entry is kept only when its ID has
 * the shape NodeTool generates and its path is a string. Any other entry is
 * left out, and the rest are still returned. The caller checks each path
 * against the folder.
 */
export async function readAssetManifest(
  nodetoolDir: Workspace
): Promise<AssetManifestEntry[]> {
  const text = await nodetoolDir.readText(ASSET_MANIFEST_FILE);
  if (text === null) return [];
  let parsed: z.infer<typeof manifestFile>;
  try {
    parsed = manifestFile.parse(JSON.parse(text));
  } catch (error) {
    log.warn("Ignored an asset manifest that could not be read", {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
  const entries: AssetManifestEntry[] = [];
  for (const candidate of parsed.assets) {
    const entry = manifestEntry.safeParse(candidate);
    if (!entry.success) continue;
    const { content_hash, ...fields } = entry.data;
    entries.push(content_hash ? { ...fields, content_hash } : fields);
  }
  return entries;
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
  const { nodetoolDir, workspace } = folder;
  if (!nodetoolDir) {
    throw new ProjectFolderUnavailableError(
      "The project folder has no reserved directory to write the asset manifest to"
    );
  }
  const key = manifestKey(folder.projectId, userId);
  const write = async (): Promise<void> => {
    const rows = await Asset.listProjectFiles(userId, folder.projectId);
    // A row that names a file in the folder of another project is left out:
    // that file is listed by its own folder's manifest.
    const nested = new NestedFolders(workspace);
    const own: Asset[] = [];
    for (const row of rows) {
      if (row.workspace_path && (await nested.holds(row.workspace_path))) continue;
      own.push(row);
    }
    await writeAssetManifest(nodetoolDir, assetManifestOf(own));
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
