/**
 * Moving the bytes of an asset from before project folders into its
 * project's folder (PRD T3, T9 step 4).
 *
 * Such an asset keeps its bytes in the asset store under
 * `<owner>/<assetId>.<ext>`, or under the older flat key `<assetId>.<ext>`.
 * {@link moveLegacyAssetIntoFolder} moves one asset in these steps:
 *
 * 1. Record the target path on the row ({@link WORKSPACE_MOVE_TARGET_KEY}).
 * 2. Copy the legacy object to the target with an exclusive create.
 * 3. Verify the copy by size and partial hash.
 * 4. Set `workspace_path` and the fingerprint on the row.
 * 5. Delete the legacy object.
 * 6. Remove the recorded target from the row.
 *
 * The asset is readable at every point. Readers ask the asset store for the
 * id key. The legacy object answers until step 5, and from then on the key
 * misses and resolves through the row to the file, which step 4 named.
 *
 * Every step can be the last one a process runs. The recorded target is what
 * makes the next run continue instead of starting over:
 *
 * | Row | Folder | Next run |
 * | --- | --- | --- |
 * | No `workspace_path`, target recorded | Nothing at the target | Copies to the target. |
 * | No `workspace_path`, target recorded | A beginning of the bytes at the target | Removes that interrupted copy and copies again. |
 * | No `workspace_path`, target recorded | The whole bytes at the target | Verifies and continues with step 4. |
 * | `workspace_path` set, target recorded | The file | Deletes the legacy object and removes the target. |
 *
 * No file is ever replaced. A file at the target that is neither the bytes
 * nor a beginning of them belongs to someone else: it stays, and the copy
 * takes the next free name. The only file removed from the folder is a
 * shorter file at the recorded target whose every byte is the start of the
 * asset's bytes, which is a copy this move left unfinished.
 *
 * A file that is already in the asset's directory under a name the copy
 * could have taken, holds exactly the asset's bytes and has no row is used
 * as the copy. That is what an earlier run leaves when another writer saves
 * the row over the recorded target.
 *
 * External assets, folder rows and assets of another project are never
 * touched. Thumbnails and other derived objects stay in the asset store.
 */
import { createLogger } from "@nodetool-ai/config";
import { Asset, moveTargetOf } from "@nodetool-ai/models";
import {
  WORKSPACE_MOVE_TARGET_KEY,
  assetFileNameCandidates,
  directoryFolderId,
  parentDirectory,
  type ProjectDirectoryResolver
} from "@nodetool-ai/protocol";
import type { Workspace, WorkspaceStat } from "@nodetool-ai/runtime";
import { assetKeyCandidates, type StorageAdapter } from "@nodetool-ai/storage";
import {
  isProjectAssetOffline,
  partialContentHash,
  partialContentHashOfWorkspaceFile,
  withWorkspaceFingerprint,
  type WorkspaceFingerprint
} from "./project-asset-file.js";
import {
  assetFileExtension,
  claimFile,
  projectAssetFileStem,
  withProjectFolderLock
} from "./project-asset.js";

const log = createLogger("nodetool.asset-services.legacy-asset-move");

/** A point between two steps of a move. A test stops the move there. */
export type LegacyAssetMoveStep =
  /** The target is recorded on the row. Nothing is written yet. */
  | "claimed"
  /** The bytes are at the target. */
  | "copied"
  /** The copy has the size and partial hash of the legacy object. */
  | "verified"
  /** The row names the file. The legacy object is still there. */
  | "switched"
  /** The legacy object is gone. The row still records the target. */
  | "legacy_deleted";

/** What one call did for one asset. */
export type LegacyAssetMoveOutcome =
  /** The bytes are in the folder and nothing is left of the move. */
  | { status: "moved"; path: string }
  /** The asset needed nothing: it was moved before, or is not one to move. */
  | { status: "settled" }
  /** The row has no object under any legacy key, so there is nothing to copy. */
  | { status: "no_bytes" }
  /** The move could not finish now. The asset is as readable as it was. */
  | { status: "waiting"; reason: string };

export interface LegacyAssetMoveOptions {
  /** The asset store that holds the legacy objects. */
  storage: StorageAdapter;
  /** The folder of the asset's project. */
  workspace: Workspace;
  /** The id of the project that owns `workspace`. */
  projectId: string;
  /** Derives the directory of an asset from its `parent_id` chain. */
  resolver: ProjectDirectoryResolver;
  /**
   * Called after each step with the step's name. A test throws from it to
   * stop the move where a killed process would have stopped. No cleanup runs
   * between a step and this call, so what the throw leaves behind is what a
   * kill leaves behind.
   */
  afterStep?: (step: LegacyAssetMoveStep, assetId: string) => Promise<void> | void;
}

/** A directory name the reconcile never enters, so no asset may be filed there. */
function isSkippedSegment(segment: string): boolean {
  return segment.startsWith(".") || segment.toLowerCase() === "node_modules";
}

/**
 * The directory of the project folder that the path of a legacy folder row
 * becomes. A hidden segment and `node_modules` get a leading underscore,
 * because the reconcile skips such directories and would report every file
 * in one as missing.
 */
export function legacyFolderDirectory(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => (isSkippedSegment(segment) ? `_${segment}` : segment))
    .join("/");
}

/**
 * The directory of the project folder an asset under `parentId` moves into:
 * the path its `parent_id` chain spells, through legacy folder rows or a
 * directory id.
 */
export function legacyAssetDirectory(
  resolver: ProjectDirectoryResolver,
  parentId: string | null
): string {
  return legacyFolderDirectory(resolver.directoryOfParent(parentId));
}

/** The asset store keys an asset's legacy object can be under, newest first. */
function legacyKeys(asset: Asset): string[] {
  return assetFileNameCandidates(asset.id, asset.content_type).flatMap(
    (fileName) => assetKeyCandidates(asset.user_id, fileName)
  );
}

/**
 * The bytes of the legacy object of `asset`, or null when no legacy key holds
 * one. Call it only for a row with no `workspace_path` and no
 * `external_path`: the asset store then has nothing but the object to answer
 * with.
 */
async function readLegacyObject(
  storage: StorageAdapter,
  asset: Asset
): Promise<Uint8Array | null> {
  for (const key of legacyKeys(asset)) {
    const bytes = await storage.retrieve(storage.uriForKey(key));
    if (bytes) return bytes;
  }
  return null;
}

async function statFile(
  workspace: Workspace,
  path: string
): Promise<WorkspaceStat | null> {
  try {
    const info = await workspace.stat(path);
    return info && !info.isDirectory ? info : null;
  } catch {
    // A path the folder refuses names no file.
    return null;
  }
}

function startsWith(bytes: Uint8Array, start: Uint8Array): boolean {
  if (start.byteLength > bytes.byteLength) return false;
  for (let i = 0; i < start.byteLength; i++) {
    if (bytes[i] !== start[i]) return false;
  }
  return true;
}

/** The bytes being moved, with what the copy is compared to. */
interface MoveSource {
  bytes: Uint8Array;
  hash: string;
}

/** The file a move copies into. `written` says this call created it. */
interface MoveTarget {
  path: string;
  written: boolean;
}

class LegacyAssetMove {
  private readonly workspace: Workspace;

  constructor(
    private readonly userId: string,
    private readonly assetId: string,
    private readonly options: LegacyAssetMoveOptions
  ) {
    this.workspace = options.workspace;
  }

  private async step(step: LegacyAssetMoveStep): Promise<void> {
    await this.options.afterStep?.(step, this.assetId);
  }

  async run(): Promise<LegacyAssetMoveOutcome> {
    const asset = await Asset.find(this.userId, this.assetId);
    if (
      !asset ||
      asset.id !== this.assetId ||
      asset.project_id !== this.options.projectId ||
      asset.external_path ||
      asset.content_type === "folder"
    ) {
      return { status: "settled" };
    }
    const recorded = moveTargetOf(asset);
    if (asset.workspace_path) {
      return recorded ? this.finish(asset) : { status: "settled" };
    }

    const bytes = await readLegacyObject(this.options.storage, asset);
    if (!bytes) {
      return recorded
        ? this.adoptWithoutSource(asset, recorded)
        : { status: "no_bytes" };
    }
    const source: MoveSource = { bytes, hash: partialContentHash(bytes) };

    const target =
      (recorded ? await this.resume(asset, recorded, source) : null) ??
      (await this.claim(asset, source));
    await this.step("copied");

    const fingerprint = await this.verify(target, source);
    await this.step("verified");

    if (!(await this.pointRowAt(asset, target.path, fingerprint))) {
      // An asset deleted meanwhile must not come back as a file with no row,
      // which the reconcile would index as a new asset.
      const deleted = (await Asset.find(asset.user_id, asset.id)) === null;
      if (deleted && target.written) await this.workspace.delete(target.path);
      return {
        status: "waiting",
        reason: deleted
          ? "the asset was deleted while its bytes were copied"
          : "the asset changed while its bytes were copied"
      };
    }
    await this.step("switched");

    return this.finish(asset);
  }

  /**
   * Continue with the target an earlier run recorded. Null when that path
   * cannot be used any more, and the caller then claims a new one.
   */
  private async resume(
    asset: Asset,
    recorded: string,
    source: MoveSource
  ): Promise<MoveTarget | null> {
    let path: string;
    try {
      path = this.workspace.key(recorded);
    } catch {
      return null;
    }
    const owners = await Asset.findByWorkspacePath(
      asset.user_id,
      asset.project_id,
      path
    );
    // Another asset took the name before the copy was made.
    if (owners.length > 0) return null;

    const info = await this.workspace.stat(path);
    if (info?.isDirectory) return null;
    if (info) {
      const size = source.bytes.byteLength;
      if (info.size > size) return null;
      if (info.size === size) {
        // The whole copy, or a file of someone else's with the same length.
        return (await this.holdsBytes(path, source))
          ? { path, written: false }
          : null;
      }
      const existing = await this.workspace.read(path);
      if (!existing || !startsWith(source.bytes, existing)) return null;
      // A copy that stopped part way. Every byte of it is in the legacy
      // object, and no row names it.
      await this.workspace.delete(path);
    }
    const written = await this.workspace.writeNew(
      path,
      source.bytes,
      asset.content_type
    );
    return written ? { path, written: true } : null;
  }

  /** Whether the file at `path` holds exactly the bytes being moved. */
  private async holdsBytes(path: string, source: MoveSource): Promise<boolean> {
    const existing = await this.workspace.read(path);
    return (
      existing !== null &&
      existing.byteLength === source.bytes.byteLength &&
      startsWith(source.bytes, existing)
    );
  }

  /** Record `path` on the row as where the bytes are going. */
  private async record(asset: Asset, path: string): Promise<void> {
    const read = asset.metadata;
    asset.metadata = { ...(read ?? {}), [WORKSPACE_MOVE_TARGET_KEY]: path };
    const saved = await asset.saveMoveStateIf({
      workspace_path: null,
      metadata: read
    });
    if (!saved) {
      asset.metadata = read;
      throw new Error(
        `Asset ${asset.id} changed before its bytes could be copied`
      );
    }
    await this.step("claimed");
  }

  /**
   * A file in `directory` under one of the names the asset could have been
   * copied to that holds exactly its bytes and that no row names or waits
   * for. It is the copy of an earlier run whose recorded target was lost,
   * when another writer saved the row over it. Using it again keeps that
   * copy from staying behind as a second file.
   */
  private async earlierCopy(
    asset: Asset,
    source: MoveSource,
    directory: string,
    stem: string,
    extension: string
  ): Promise<string | null> {
    const suffix = extension ? `.${extension}` : "";
    const first = `${stem}${suffix}`.toLowerCase();
    const numbered = `${stem}-`.toLowerCase();
    const entries = await this.workspace.list(directory);
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isDirectory || entry.size !== source.bytes.byteLength) continue;
      const name = entry.name.toLowerCase();
      const counter =
        name.startsWith(numbered) && name.endsWith(suffix.toLowerCase())
          ? name.slice(numbered.length, name.length - suffix.length)
          : null;
      if (name !== first && (counter === null || !/^\d+$/.test(counter))) {
        continue;
      }
      const path = this.workspace.key(entry.path);
      const owner = { userId: asset.user_id, projectId: asset.project_id };
      const named = await Asset.findByWorkspacePath(
        owner.userId,
        owner.projectId,
        path
      );
      const awaited = await Asset.findMovingTo(
        owner.userId,
        owner.projectId,
        path
      );
      if (named.length > 0 || awaited.length > 0) continue;
      if (await this.holdsBytes(path, source)) return path;
    }
    return null;
  }

  /** Record a free name in the asset's directory and copy the bytes there. */
  private async claim(asset: Asset, source: MoveSource): Promise<MoveTarget> {
    const folderPath = legacyAssetDirectory(
      this.options.resolver,
      asset.parent_id
    );
    const directory = folderPath ? this.workspace.key(folderPath) : "";
    const stem = projectAssetFileStem(asset.name, asset.content_type);
    const extension = assetFileExtension(asset.content_type);

    const earlier = await this.earlierCopy(
      asset,
      source,
      directory,
      stem,
      extension
    );
    if (earlier) {
      await this.record(asset, earlier);
      return { path: earlier, written: false };
    }
    const path = await claimFile(
      this.workspace,
      { userId: asset.user_id, projectId: asset.project_id },
      directory,
      stem,
      extension,
      source.bytes,
      asset.content_type,
      (candidate) => this.record(asset, candidate)
    );
    return { path, written: true };
  }

  /**
   * The fingerprint of the copy, once its size and partial hash equal those
   * of the legacy object. A copy this call wrote that does not match is
   * removed. Throws when they differ, and the row is left as it was.
   */
  private async verify(
    target: MoveTarget,
    source: MoveSource
  ): Promise<WorkspaceFingerprint> {
    const info = await statFile(this.workspace, target.path);
    const hash =
      info && info.size === source.bytes.byteLength
        ? await partialContentHashOfWorkspaceFile(this.workspace, target.path)
        : null;
    if (!info || hash !== source.hash) {
      if (target.written) await this.workspace.delete(target.path);
      throw new Error(
        `The copy of asset ${this.assetId} at ${target.path} does not match its stored bytes`
      );
    }
    return {
      workspace_size: info.size,
      workspace_mtime: info.modifiedAt,
      workspace_hash: hash
    };
  }

  /**
   * Name the file on the row. The recorded target stays until the legacy
   * object is gone. False when the row is no longer what was read.
   */
  private async pointRowAt(
    asset: Asset,
    path: string,
    fingerprint: WorkspaceFingerprint
  ): Promise<boolean> {
    const previous = {
      workspace_path: asset.workspace_path,
      parent_id: asset.parent_id,
      size: asset.size,
      content_hash: asset.content_hash,
      metadata: asset.metadata
    };
    asset.workspace_path = path;
    // The folder row the asset was filed under goes once it is empty.
    asset.parent_id = directoryFolderId(
      asset.user_id,
      asset.project_id,
      parentDirectory(path)
    );
    asset.size = fingerprint.workspace_size;
    // The full hash is the background hash job's to compute.
    asset.content_hash = null;
    asset.metadata = {
      ...withWorkspaceFingerprint(previous.metadata, fingerprint),
      [WORKSPACE_MOVE_TARGET_KEY]: path
    };
    const saved = await asset.saveFilePlacementIf({
      workspace_path: previous.workspace_path,
      metadata: previous.metadata
    });
    if (!saved) Object.assign(asset, previous);
    return saved;
  }

  /**
   * Delete the legacy object of an asset whose row names its file, then
   * remove the recorded target. The row is read again first: the object is
   * deleted only while the row still names a file that is in the folder.
   */
  private async finish(moved: Asset): Promise<LegacyAssetMoveOutcome> {
    const asset = await Asset.find(moved.user_id, moved.id);
    const path = asset?.workspace_path;
    if (!asset || !path || asset.external_path) {
      return {
        status: "waiting",
        reason: "the asset changed after its row was pointed at the file"
      };
    }
    const { storage } = this.options;
    const uris = legacyKeys(asset).map((key) => storage.uriForKey(key));
    const present =
      !isProjectAssetOffline(asset) &&
      (await statFile(this.workspace, path)) !== null;
    if (!present) {
      // With the file gone, the store answers a key only from its own object.
      for (const uri of uris) {
        if (await storage.stat(uri)) {
          return {
            status: "waiting",
            reason: `the file ${path} is not in the project folder, so the stored bytes are kept`
          };
        }
      }
    } else {
      for (const uri of uris) await storage.delete(uri);
      await this.step("legacy_deleted");
    }

    const read = asset.metadata;
    asset.metadata = Object.fromEntries(
      Object.entries(read ?? {}).filter(
        ([key]) => key !== WORKSPACE_MOVE_TARGET_KEY
      )
    );
    const cleared = await asset.saveMoveStateIf({
      workspace_path: path,
      metadata: read
    });
    if (cleared) return present ? { status: "moved", path } : { status: "settled" };
    return {
      status: "waiting",
      reason: "the asset changed while its stored bytes were removed"
    };
  }

  /**
   * A row with a recorded target and no legacy object: its row was written
   * back to an earlier state after the object was deleted. The file at the
   * target is the asset's when no other row names it and it has the size the
   * row holds, and the row is pointed at it again.
   */
  private async adoptWithoutSource(
    asset: Asset,
    recorded: string
  ): Promise<LegacyAssetMoveOutcome> {
    let path: string;
    try {
      path = this.workspace.key(recorded);
    } catch {
      return { status: "no_bytes" };
    }
    const info = await statFile(this.workspace, path);
    const owners = await Asset.findByWorkspacePath(
      asset.user_id,
      asset.project_id,
      path
    );
    if (
      !info ||
      owners.length > 0 ||
      asset.size === null ||
      asset.size !== info.size
    ) {
      return { status: "no_bytes" };
    }
    const hash = await partialContentHashOfWorkspaceFile(this.workspace, path);
    const pointed = await this.pointRowAt(asset, path, {
      workspace_size: info.size,
      workspace_mtime: info.modifiedAt,
      workspace_hash: hash
    });
    if (!pointed) {
      return {
        status: "waiting",
        reason: "the asset changed while its file was looked up"
      };
    }
    log.warn("Pointed an asset with no stored bytes at its file again", {
      assetId: asset.id,
      path
    });
    return this.finish(asset);
  }
}

/**
 * Move the bytes of one asset from the asset store into its project folder,
 * or finish a move an earlier run started. See the module comment for the
 * steps and for what each interrupted state continues with.
 *
 * It runs under the project's folder lock, so no save and no reconcile of the
 * same folder sees a copy whose row is not written yet.
 *
 * Throws when the folder or the asset store fails, or when a copy does not
 * verify. The asset is then as readable as before the call.
 */
export function moveLegacyAssetIntoFolder(
  userId: string,
  assetId: string,
  options: LegacyAssetMoveOptions
): Promise<LegacyAssetMoveOutcome> {
  return withProjectFolderLock(userId, options.projectId, () =>
    new LegacyAssetMove(userId, assetId, options).run()
  );
}
