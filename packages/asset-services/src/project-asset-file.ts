/**
 * The file behind an asset in its project's folder (see
 * `Asset.workspace_path`), and the fingerprint the row records for it.
 *
 * The folder is reached through the `Workspace` the project resolver hands
 * out, so a local directory and a storage-backed folder read the same way.
 * This module holds no storage adapter and makes no thumbnail, which keeps it
 * importable from the key-miss lookup the asset store itself is built with.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { isFiniteNumber } from "@nodetool-ai/protocol";
import { getProjectFolderResolver, type Workspace } from "@nodetool-ai/runtime";

/** The row fields that place an asset's file in a project folder. */
export interface ProjectAssetFileFields {
  user_id: string;
  project_id: string;
  workspace_path: string | null;
}

/** One file in a project folder. `path` is relative to the folder. */
export interface ProjectAssetFile {
  workspace: Workspace;
  path: string;
}

/** Thrown when an asset's project folder cannot be reached. */
export class ProjectFolderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ProjectFolderUnavailableError";
  }
}

/**
 * The folder of `projectId`. Throws {@link ProjectFolderUnavailableError} with
 * the resolver's reason when the folder is missing or unreachable. No other
 * folder is ever substituted.
 */
export async function requireProjectFolder(
  projectId: string | null | undefined,
  userId: string
): Promise<{
  projectId: string;
  workspace: Workspace;
  /** The folder's `.nodetool/` directory, for NodeTool's own files. */
  nodetoolDir: Workspace | null;
}> {
  const resolve = getProjectFolderResolver();
  if (!resolve) {
    throw new ProjectFolderUnavailableError(
      "Project folders are not available on this host: no project folder resolver is installed"
    );
  }
  const folder = await resolve(projectId, userId);
  if (!folder.ok) throw new ProjectFolderUnavailableError(folder.reason);
  return {
    projectId: folder.projectId,
    workspace: folder.workspace,
    nodetoolDir: folder.nodetoolDir ?? null
  };
}

/**
 * The file `asset` keeps in its project folder. Null for an asset with no
 * `workspace_path`. Throws {@link ProjectFolderUnavailableError} when the
 * asset has one and its folder cannot be reached, so a caller about to rename
 * or delete never mistakes an unplugged drive for an asset without a file.
 */
export async function requireProjectAssetFile(
  asset: ProjectAssetFileFields
): Promise<ProjectAssetFile | null> {
  if (!asset.workspace_path) return null;
  const folder = await requireProjectFolder(asset.project_id, asset.user_id);
  return { workspace: folder.workspace, path: asset.workspace_path };
}

/**
 * The file `asset` keeps in its project folder, for readers. Null when the
 * asset has no `workspace_path`, its folder cannot be reached, or the
 * reconciler marked it offline: a reader reports each as missing bytes.
 */
export async function projectAssetFile(
  asset: ProjectAssetFileFields & { metadata?: Record<string, unknown> | null }
): Promise<ProjectAssetFile | null> {
  if (isProjectAssetOffline(asset)) return null;
  try {
    return await requireProjectAssetFile(asset);
  } catch {
    // An unreachable folder leaves the asset unreadable until it is located.
    return null;
  }
}

/**
 * The real file on this host behind a project asset file, or null when the
 * folder has no local directory or the file is not there. `materialize`
 * applies the folder's containment check, so a symlink that leaves the folder
 * is never handed out.
 */
export async function localProjectAssetPath(
  file: ProjectAssetFile
): Promise<string | null> {
  if (!file.workspace.localDir) return null;
  try {
    if (!(await file.workspace.exists(file.path))) return null;
    return await file.workspace.materialize(file.path);
  } catch {
    return null;
  }
}

// ── Fingerprint ─────────────────────────────────────────────────────────────

/**
 * The metadata keys that fingerprint a project asset file, stored the way the
 * external fingerprint is (`external_size`, `external_mtime`). Server-owned:
 * a client metadata update never writes them.
 */
export const WORKSPACE_FINGERPRINT_KEYS = [
  "workspace_size",
  "workspace_mtime",
  "workspace_hash"
] as const;

/** Bytes hashed from each end of a file. */
export const PARTIAL_HASH_SPAN = 1024 * 1024;

/**
 * The metadata key the reconciler sets to `true` on a row whose file is gone
 * from the project folder. The row stays, every reader reports its bytes as
 * missing, and relink or a file that comes back clears the mark.
 */
export const WORKSPACE_OFFLINE_KEY = "workspace_offline";

/** Every metadata key the server owns on an asset in a project folder. */
export const WORKSPACE_SERVER_KEYS = [
  ...WORKSPACE_FINGERPRINT_KEYS,
  WORKSPACE_OFFLINE_KEY
] as const;

/**
 * Whether the reconciler found the file of `asset` missing from its project
 * folder. Always false for an asset that keeps no file there. It reads the
 * row only, so it costs nothing on an asset response.
 */
export function isProjectAssetOffline(asset: {
  workspace_path: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  return (
    Boolean(asset.workspace_path) &&
    asset.metadata?.[WORKSPACE_OFFLINE_KEY] === true
  );
}

/**
 * The mtime the row recorded for the file of `asset` in its project folder,
 * or null for an asset that keeps no file there. It versions what is derived
 * from the file and stored under the asset's id alone, such as the thumbnail.
 */
export function projectAssetMtime(asset: {
  workspace_path: string | null;
  metadata?: Record<string, unknown> | null;
}): number | null {
  if (!asset.workspace_path) return null;
  const mtime = asset.metadata?.["workspace_mtime"];
  return isFiniteNumber(mtime) ? mtime : null;
}

export interface WorkspaceFingerprint {
  workspace_size: number;
  workspace_mtime: number;
  workspace_hash: string;
}

/**
 * The head and tail ranges the partial hash covers for a file of `size`
 * bytes: the first {@link PARTIAL_HASH_SPAN} bytes, then the last
 * {@link PARTIAL_HASH_SPAN} bytes that the head did not already cover. A file
 * of up to twice the span is hashed whole, each byte once.
 */
function partialHashRanges(size: number): {
  head: [number, number];
  tail: [number, number];
} {
  const headEnd = Math.min(size, PARTIAL_HASH_SPAN);
  const tailStart = Math.max(headEnd, size - PARTIAL_HASH_SPAN);
  return { head: [0, headEnd], tail: [tailStart, size] };
}

function finishPartialHash(
  head: Uint8Array,
  tail: Uint8Array,
  size: number
): string {
  return createHash("sha256")
    .update(head)
    .update(tail)
    .update(`:${size}`)
    .digest("hex");
}

/**
 * SHA-256 over the first and last 1 MiB of `bytes` plus their length. Cheap
 * enough to compute for every file on every scan, which a full hash of
 * multi-gigabyte footage is not.
 */
export function partialContentHash(bytes: Uint8Array): string {
  const { head, tail } = partialHashRanges(bytes.byteLength);
  return finishPartialHash(
    bytes.subarray(head[0], head[1]),
    bytes.subarray(tail[0], tail[1]),
    bytes.byteLength
  );
}

async function readRange(
  handle: Awaited<ReturnType<typeof open>>,
  [start, end]: [number, number]
): Promise<Uint8Array> {
  const buffer = new Uint8Array(end - start);
  let filled = 0;
  while (filled < buffer.byteLength) {
    const { bytesRead } = await handle.read(
      buffer,
      filled,
      buffer.byteLength - filled,
      start + filled
    );
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return buffer.subarray(0, filled);
}

/** {@link partialContentHash} of a file on this host, read by range. */
export async function partialContentHashOfFile(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const { head, tail } = partialHashRanges(size);
    return finishPartialHash(
      await readRange(handle, head),
      await readRange(handle, tail),
      size
    );
  } finally {
    await handle.close();
  }
}

/**
 * {@link partialContentHash} of a file in a project folder. The file is read
 * by range where the folder is a directory on this host. A storage-backed
 * folder stages it first, and the staged copy is removed again, so pass a
 * workspace whose scratch directory holds nothing a run still needs.
 */
export async function partialContentHashOfWorkspaceFile(
  workspace: Workspace,
  path: string
): Promise<string> {
  try {
    return await partialContentHashOfFile(await workspace.materialize(path));
  } finally {
    await workspace.cleanupScratch?.();
  }
}

/** Bytes read from a file at a time while its full hash is computed. */
const CONTENT_HASH_CHUNK = 1024 * 1024;

/**
 * SHA-256 of a whole file on this host, in hex. The file is read as a stream
 * of {@link CONTENT_HASH_CHUNK} pieces, so memory use does not grow with the
 * file, and the event loop runs between pieces. Rejects with the signal's
 * reason when `signal` aborts.
 */
export async function contentHashOfFile(
  path: string,
  signal?: AbortSignal
): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path, {
    highWaterMark: CONTENT_HASH_CHUNK,
    signal
  });
  for await (const chunk of stream) {
    // SAFETY: a read stream opened without an encoding yields Buffers.
    hash.update(chunk as Uint8Array);
  }
  return hash.digest("hex");
}

/**
 * {@link contentHashOfFile} of a file in a project folder. A folder that is a
 * directory on this host is read in place. A storage-backed folder stages the
 * file first, as {@link partialContentHashOfWorkspaceFile} does, and the
 * staged copy is removed again.
 */
export async function contentHashOfWorkspaceFile(
  workspace: Workspace,
  path: string,
  signal?: AbortSignal
): Promise<string> {
  try {
    return await contentHashOfFile(await workspace.materialize(path), signal);
  } finally {
    await workspace.cleanupScratch?.();
  }
}

/**
 * `metadata` with the file fingerprint written over any earlier one. A
 * fingerprint is recorded from a file that is there, so the offline mark goes.
 */
export function withWorkspaceFingerprint(
  metadata: Record<string, unknown> | null | undefined,
  fingerprint: WorkspaceFingerprint
): Record<string, unknown> {
  const kept = Object.fromEntries(
    Object.entries(metadata ?? {}).filter(
      ([key]) => key !== WORKSPACE_OFFLINE_KEY
    )
  );
  return { ...kept, ...fingerprint };
}

/**
 * `next` with every server-owned fingerprint key in `owned` taken from
 * `current`, so a client that replaces an asset's metadata can neither forge
 * nor drop what the server recorded about the file.
 */
export function keepFingerprint(
  next: Record<string, unknown>,
  current: Record<string, unknown> | null,
  owned: readonly string[]
): Record<string, unknown> {
  const ownedKeys = new Set(owned);
  const merged = Object.fromEntries(
    Object.entries(next).filter(([key]) => !ownedKeys.has(key))
  );
  for (const key of owned) {
    if (current && key in current) merged[key] = current[key];
  }
  return merged;
}
