/**
 * A file the run names by path that is also an asset: an agent's
 * `output_file`, the file a Save-file node writes.
 *
 * The asset host writes the file once, at that path in the run's project
 * folder, and creates the row that points at it (`saveProjectAsset`). The run
 * reads its file back through `context.workspace`. When that workspace is the
 * project folder, which is the case for every chat turn and workflow run on
 * the server, the two are the same file and nothing else is written. A host
 * whose run works in another folder (the CLI chat in the current directory)
 * also gets the file there, so the path keeps meaning what the caller asked.
 */
import { getProjectFolderResolver, type Workspace } from "@nodetool-ai/runtime-core";
import type { AssetCreateParamsLike } from "@nodetool-ai/runtime-core";

/** What a run that saves a file as an asset needs from its context. */
export interface RunFileAssetContext {
  readonly userId: string;
  readonly projectId: string | null;
  readonly workspace: Workspace | null;
  /** Absent on a context that persists nothing, as on a bare test double. */
  hasModelInterface?(name: "createAsset"): boolean;
  createAsset(
    args: Pick<
      AssetCreateParamsLike,
      "name" | "contentType" | "content" | "path" | "metadata"
    >
  ): Promise<unknown>;
}

/** Where the file of {@link saveRunFileAsset} ended up. */
export interface SavedRunFile {
  /** The asset's id, or null when no asset was created. */
  asset_id: string | null;
  /** The path the run reads the file at, or null when it has none. */
  path: string | null;
  /** Why the asset could not be created, when it could not. */
  asset_error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function idOf(created: unknown): string | null {
  if (typeof created !== "object" || created === null) return null;
  const id = (created as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/**
 * True when `path` in the run's workspace is `path` in the folder of the
 * run's project. The two `Workspace` objects are compared by the URI each
 * gives the path, which names one file on every storage backend.
 */
export async function runWorkspaceIsProjectFolder(
  context: Pick<RunFileAssetContext, "userId" | "projectId" | "workspace">,
  path: string
): Promise<boolean> {
  const workspace = context.workspace;
  const resolve = getProjectFolderResolver();
  if (!workspace || !resolve) return false;
  try {
    const folder = await resolve(context.projectId, context.userId);
    return folder.ok && folder.workspace.uri(path) === workspace.uri(path);
  } catch {
    // An unreachable folder is not the run's folder.
    return false;
  }
}

/**
 * Put `bytes` at `path` in the run's workspace unless the asset `assetId`
 * already wrote them there, which it did when the run's workspace is the
 * project folder. Returns the path, or null when the run has no workspace.
 * Throws when the write fails.
 */
export async function ensureRunFile(
  context: Pick<RunFileAssetContext, "userId" | "projectId" | "workspace">,
  bytes: Uint8Array,
  path: string,
  contentType: string,
  assetId: string | null
): Promise<string | null> {
  const workspace = context.workspace;
  if (!workspace) return null;
  if (assetId && (await runWorkspaceIsProjectFolder(context, path))) {
    return path;
  }
  await workspace.write(path, bytes, contentType);
  return path;
}

/**
 * Save `bytes` as an asset whose file is at `path` in the run's project
 * folder, and make sure the run reads them at `path`.
 *
 * A failed asset save does not fail the call: the file still lands in the
 * run's workspace and `asset_error` says why there is no row. A host with no
 * `createAsset` interface gets the workspace file alone.
 */
export async function saveRunFileAsset(
  context: RunFileAssetContext,
  bytes: Uint8Array,
  opts: {
    path: string;
    name: string;
    contentType: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<SavedRunFile> {
  let assetId: string | null = null;
  let assetError: string | undefined;
  if (context.hasModelInterface?.("createAsset")) {
    try {
      assetId = idOf(
        await context.createAsset({
          name: opts.name,
          contentType: opts.contentType,
          content: bytes,
          path: opts.path,
          metadata: opts.metadata ?? null
        })
      );
    } catch (error) {
      assetError = errorMessage(error);
    }
  }
  const path = await ensureRunFile(
    context,
    bytes,
    opts.path,
    opts.contentType,
    assetId
  );
  const saved: SavedRunFile = { asset_id: assetId, path };
  if (assetError !== undefined) saved.asset_error = assetError;
  return saved;
}
