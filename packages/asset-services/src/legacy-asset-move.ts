/**
 * Moving the bytes of an asset from before project folders into its
 * project's folder (PRD T3, T9 step 4).
 *
 * Such an asset keeps its bytes in the asset store under
 * `<owner>/<assetId>.<ext>`, or under the older flat key `<assetId>.<ext>`.
 * {@link moveLegacyAssetIntoFolder} moves one asset in these steps:
 *
 * 1. Record the target path and the SHA-256 of the legacy object on the row
 *    ({@link WORKSPACE_MOVE_TARGET_KEY}, {@link WORKSPACE_MOVE_SOURCE_KEY}).
 * 2. Copy the legacy object to the target. The bytes are written under a
 *    staging name beside the target and the target is given them in one
 *    exclusive step.
 * 3. Verify the copy by reading it back and comparing every byte.
 * 4. Set `workspace_path` and the fingerprint on the row, when the legacy
 *    object is still the one that was read.
 * 5. Read the legacy object again and delete it, when it still has the
 *    recorded hash.
 * 6. Remove the recorded target and hash from the row.
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
 * | No `workspace_path`, target recorded | The whole bytes at the target | Verifies and continues with step 4. |
 * | No `workspace_path`, target recorded | Anything else at the target | Leaves it and copies to the next free name. |
 * | `workspace_path` set, target recorded | The file | Deletes the legacy object and removes the target. |
 *
 * Nothing at a target is ever replaced or deleted. A target holds the whole
 * copy or nothing, because the copy is published in one step, so a file
 * that is there and is not the whole bytes is someone else's. The only
 * files this module removes from a folder are its own staging name, which
 * carries the asset id, and a copy the same call created and could not use.
 *
 * Bytes stored under the legacy key while the move runs are never deleted.
 * An update of the asset's bytes writes there for as long as the row names
 * no file. The legacy object is deleted only while it still hashes to what
 * step 1 recorded, or holds exactly the bytes of the file. Otherwise the row
 * is pointed back at the legacy object and a later pass moves the new bytes.
 *
 * A legacy object that cannot be read is not a missing one. The asset store
 * answers a failed read like a missing key, so absence is confirmed with a
 * `stat` of every legacy key before the asset is treated as having none.
 *
 * External assets, folder rows and assets of another project are never
 * touched. Thumbnails and other derived objects stay in the asset store.
 */
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { Asset, moveTargetOf } from "@nodetool-ai/models";
import {
  WORKSPACE_MOVE_SOURCE_KEY,
  WORKSPACE_MOVE_TARGET_KEY,
  assetFileNameCandidates,
  directoryFolderId,
  isNonEmptyString,
  joinDirectory,
  parentDirectory,
  type ProjectDirectoryResolver
} from "@nodetool-ai/protocol";
import type { Workspace, WorkspaceStat } from "@nodetool-ai/runtime";
import {
  assetKeyCandidates,
  type StorageAdapter,
  type StorageStat
} from "@nodetool-ai/storage";
import {
  WORKSPACE_FINGERPRINT_KEYS,
  WORKSPACE_OFFLINE_KEY,
  isProjectAssetOffline,
  partialContentHash,
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
  /** The copy holds exactly the bytes of the legacy object. */
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

/**
 * The file name the copy of an asset is staged under, beside its target. It
 * carries the asset id, so the name is this move's own in any directory.
 */
export function legacyAssetStagingName(assetId: string): string {
  return `.${assetId}.nodetool-move.tmp`;
}

/** The asset store keys an asset's legacy object can be under, newest first. */
function legacyKeys(asset: Asset): string[] {
  return assetFileNameCandidates(asset.id, asset.content_type).flatMap(
    (fileName) => assetKeyCandidates(asset.user_id, fileName)
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && Buffer.compare(a, b) === 0;
}

/** The legacy object being moved, with what the copy is compared to. */
interface MoveSource {
  /** The key the object was read from, as a URI of the asset store. */
  uri: string;
  /** What the store reported about the object right before it was read. */
  stat: StorageStat;
  bytes: Uint8Array;
  /** SHA-256 of `bytes`: what the legacy object must still be to be deleted. */
  sha: string;
}

type LegacyObject =
  | ({ state: "found" } & MoveSource)
  /** A legacy key holds an object that could not be read whole. */
  | { state: "unreadable" }
  /** No legacy key holds an object, confirmed by a `stat` of each. */
  | { state: "absent" };

/**
 * The legacy object of `asset`. Call it only for a row with no
 * `workspace_path` and no `external_path`: the asset store then has nothing
 * but the object to answer with.
 *
 * The store answers a failed read with null, as it does for a missing key.
 * So a key is taken for empty only when `stat` finds nothing under it, and an
 * object that `stat` finds and `retrieve` does not return is unreadable.
 */
async function readLegacyObject(
  storage: StorageAdapter,
  asset: Asset
): Promise<LegacyObject> {
  for (const key of legacyKeys(asset)) {
    const uri = storage.uriForKey(key);
    const stat = await storage.stat(uri);
    if (!stat) continue;
    const bytes = await storage.retrieve(uri);
    // A length other than the one reported is an object that changed while
    // it was read.
    if (!bytes || bytes.byteLength !== stat.size) return { state: "unreadable" };
    return { state: "found", uri, stat, bytes, sha: sha256(bytes) };
  }
  return { state: "absent" };
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

/** The SHA-256 a move recorded on `asset` for its legacy object, or null. */
function recordedSourceOf(asset: Asset): string | null {
  const recorded = asset.metadata?.[WORKSPACE_MOVE_SOURCE_KEY];
  return isNonEmptyString(recorded) ? recorded : null;
}

function withoutKeys(
  metadata: Record<string, unknown> | null,
  keys: readonly string[]
): Record<string, unknown> {
  const dropped = new Set(keys);
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key]) => !dropped.has(key))
  );
}

const MOVE_KEYS = [WORKSPACE_MOVE_TARGET_KEY, WORKSPACE_MOVE_SOURCE_KEY];

/** The file a move copies into. `written` says this call created it. */
interface MoveTarget {
  path: string;
  written: boolean;
}

class LegacyAssetMove {
  private readonly workspace: Workspace;
  private readonly storage: StorageAdapter;

  constructor(
    private readonly userId: string,
    private readonly assetId: string,
    private readonly options: LegacyAssetMoveOptions
  ) {
    this.workspace = options.workspace;
    this.storage = options.storage;
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
      return recorded ? this.finish(asset, false) : { status: "settled" };
    }

    const source = await readLegacyObject(this.storage, asset);
    if (source.state === "unreadable") {
      return {
        status: "waiting",
        reason: "the stored bytes could not be read, so they are kept where they are"
      };
    }
    if (source.state === "absent") {
      return recorded
        ? this.adoptWithoutSource(asset, recorded)
        : { status: "no_bytes" };
    }

    const target =
      (recorded ? await this.resume(asset, recorded, source) : null) ??
      (await this.claim(asset, source));
    await this.step("copied");

    const fingerprint = await this.verify(target, source);
    await this.step("verified");

    // Bytes stored under the legacy key since it was read belong to the
    // asset now. The copy holds the earlier ones and must not be named.
    if (!(await this.isStillTheObjectRead(source))) {
      await this.removeOwnCopy(target);
      return {
        status: "waiting",
        reason: "the stored bytes changed while they were copied"
      };
    }
    if (!(await this.pointRowAt(asset, target.path, fingerprint))) {
      // A copy with no row would be indexed as a second asset, and the copy
      // of a deleted asset would bring it back.
      await this.removeOwnCopy(target);
      return {
        status: "waiting",
        reason: "the asset changed or was deleted while its bytes were copied"
      };
    }
    await this.step("switched");

    return this.finish(asset, target.written);
  }

  /** Remove a copy this call created. A file it found is left where it is. */
  private async removeOwnCopy(target: MoveTarget): Promise<void> {
    if (target.written) await this.workspace.delete(target.path);
  }

  /** Whether the legacy object is the one `source` was read from. */
  private async isStillTheObjectRead(source: MoveSource): Promise<boolean> {
    const now = await this.storage.stat(source.uri);
    return (
      now !== null &&
      now.size === source.stat.size &&
      now.modifiedAt === source.stat.modifiedAt
    );
  }

  /**
   * Remove this asset's staging file beside `path`. A process that died
   * while it published a copy can leave it, hard-linked to the copy, and the
   * copy cannot be read until the second name is gone.
   */
  private async removeStaging(path: string): Promise<void> {
    await this.workspace.delete(
      joinDirectory(parentDirectory(path), legacyAssetStagingName(this.assetId))
    );
  }

  /** Whether the file at `path` holds exactly the bytes being moved. */
  private async holdsBytes(path: string, source: MoveSource): Promise<boolean> {
    const existing = await this.workspace.read(path);
    return existing !== null && sameBytes(existing, source.bytes);
  }

  /**
   * Record on the row where the bytes are going and what they hash to.
   * Nothing is written when the row already records both.
   */
  private async record(
    asset: Asset,
    path: string,
    source: MoveSource
  ): Promise<void> {
    if (moveTargetOf(asset) === path && recordedSourceOf(asset) === source.sha) {
      return;
    }
    const read = asset.metadata;
    asset.metadata = {
      ...(read ?? {}),
      [WORKSPACE_MOVE_TARGET_KEY]: path,
      [WORKSPACE_MOVE_SOURCE_KEY]: source.sha
    };
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
   * Continue with the target an earlier run recorded. Null when that path
   * cannot be used any more, and the caller then claims a new one.
   *
   * Whatever is at the path stays there. It is the copy only when it holds
   * exactly the bytes, and anything else, an empty file included, is someone
   * else's file.
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
    await this.removeStaging(path);
    const owners = await Asset.findByWorkspacePath(
      asset.user_id,
      asset.project_id,
      path
    );
    // Another asset took the name before the copy was made.
    if (owners.length > 0) return null;

    const info = await this.workspace.stat(path);
    if (info) {
      const isCopy =
        !info.isDirectory &&
        info.size === source.bytes.byteLength &&
        (await this.holdsBytes(path, source));
      if (!isCopy) return null;
      await this.record(asset, path, source);
      return { path, written: false };
    }
    await this.record(asset, path, source);
    const written = await this.workspace.writeNew(
      path,
      source.bytes,
      asset.content_type,
      { stagingName: legacyAssetStagingName(asset.id) }
    );
    return written ? { path, written: true } : null;
  }

  /** Record a free name in the asset's directory and copy the bytes there. */
  private async claim(asset: Asset, source: MoveSource): Promise<MoveTarget> {
    const directory = legacyAssetDirectory(
      this.options.resolver,
      asset.parent_id
    );
    const path = await claimFile(
      this.workspace,
      { userId: asset.user_id, projectId: asset.project_id },
      directory ? this.workspace.key(directory) : "",
      projectAssetFileStem(asset.name, asset.content_type),
      assetFileExtension(asset.content_type),
      source.bytes,
      asset.content_type,
      (candidate) => this.record(asset, candidate, source),
      legacyAssetStagingName(asset.id)
    );
    return { path, written: true };
  }

  /**
   * The fingerprint of the copy, once it has been read back and holds every
   * byte of the legacy object. A copy this call wrote that does not match is
   * removed. Throws when they differ, and the row is left as it was.
   */
  private async verify(
    target: MoveTarget,
    source: MoveSource
  ): Promise<WorkspaceFingerprint> {
    const info = await statFile(this.workspace, target.path);
    const matches =
      info !== null &&
      info.size === source.bytes.byteLength &&
      (await this.holdsBytes(target.path, source));
    if (!info || !matches) {
      await this.removeOwnCopy(target);
      throw new Error(
        `The copy of asset ${this.assetId} at ${target.path} does not match its stored bytes`
      );
    }
    return {
      workspace_size: info.size,
      workspace_mtime: info.modifiedAt,
      workspace_hash: partialContentHash(source.bytes)
    };
  }

  /**
   * Name the file on the row. The recorded target and hash stay until the
   * legacy object is gone. False when the row is no longer what was read.
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
   * remove what the move recorded. `ownCopy` says this call created the file.
   *
   * The row is read again first, and so is every legacy object. An object is
   * deleted only when it still hashes to what was recorded before the copy,
   * or holds exactly the bytes of the file. One that holds anything else was
   * stored after the copy and is the asset's newest bytes: nothing is
   * deleted, and the row goes back to it. An object that cannot be read is
   * kept, and so is every object when the file has left the folder.
   */
  private async finish(
    moved: Asset,
    ownCopy: boolean
  ): Promise<LegacyAssetMoveOutcome> {
    const asset = await Asset.find(moved.user_id, moved.id);
    const path = asset?.workspace_path;
    if (!asset || !path || asset.external_path) {
      return {
        status: "waiting",
        reason: "the asset changed after its row was pointed at the file"
      };
    }
    const uris = legacyKeys(asset).map((key) => this.storage.uriForKey(key));
    const present =
      !isProjectAssetOffline(asset) &&
      (await statFile(this.workspace, path)) !== null;
    if (!present) {
      // With the file gone, the store answers a key only from its own object.
      for (const uri of uris) {
        if (await this.storage.stat(uri)) {
          return {
            status: "waiting",
            reason: `the file ${path} is not in the project folder, so the stored bytes are kept`
          };
        }
      }
      return this.clearRecorded(asset, path, { status: "settled" });
    }

    const recorded = recordedSourceOf(asset);
    let fileBytes: Uint8Array | null | undefined;
    const deletable: string[] = [];
    for (const uri of uris) {
      // A key with no object of its own is answered from the file.
      const stored = await this.storage.retrieve(uri);
      if (stored === null) {
        if ((await this.storage.stat(uri)) === null) continue;
        return {
          status: "waiting",
          reason: "the stored bytes could not be read, so they are kept"
        };
      }
      if (recorded !== null && sha256(stored) === recorded) {
        deletable.push(uri);
        continue;
      }
      if (fileBytes === undefined) fileBytes = await this.workspace.read(path);
      if (fileBytes !== null && sameBytes(stored, fileBytes)) {
        deletable.push(uri);
        continue;
      }
      return this.pointRowBack(asset, path, recorded, ownCopy);
    }
    for (const uri of deletable) await this.storage.delete(uri);
    await this.step("legacy_deleted");

    return this.clearRecorded(asset, path, { status: "moved", path });
  }

  /** Remove the recorded target and hash from a row that names its file. */
  private async clearRecorded(
    asset: Asset,
    path: string,
    done: LegacyAssetMoveOutcome
  ): Promise<LegacyAssetMoveOutcome> {
    const read = asset.metadata;
    asset.metadata = withoutKeys(read, MOVE_KEYS);
    const cleared = await asset.saveMoveStateIf({
      workspace_path: path,
      metadata: read
    });
    return cleared
      ? done
      : {
          status: "waiting",
          reason: "the asset changed while its stored bytes were removed"
        };
  }

  /**
   * The legacy object holds bytes that are neither the ones copied nor the
   * ones in the file: they were stored under the asset's key after the copy.
   * Nothing is deleted from the asset store.
   *
   * When this call created the file and the file still holds what it wrote,
   * the row is pointed back at the legacy object and that copy is removed,
   * so a later pass moves the new bytes. In every other case the row, the
   * file and the object stay as they are for a person to resolve.
   */
  private async pointRowBack(
    asset: Asset,
    path: string,
    recorded: string | null,
    ownCopy: boolean
  ): Promise<LegacyAssetMoveOutcome> {
    const fileBytes = ownCopy ? await this.workspace.read(path) : null;
    if (!fileBytes || recorded === null || sha256(fileBytes) !== recorded) {
      log.warn(
        "An asset's stored bytes changed after they were copied. Both are kept.",
        { assetId: asset.id, path }
      );
      return {
        status: "waiting",
        reason: "bytes were stored for the asset after its copy was made, so both are kept"
      };
    }
    const read = asset.metadata;
    asset.workspace_path = null;
    asset.content_hash = null;
    asset.metadata = withoutKeys(read, [
      ...WORKSPACE_FINGERPRINT_KEYS,
      WORKSPACE_OFFLINE_KEY
    ]);
    const reverted = await asset.saveFilePlacementIf({
      workspace_path: path,
      metadata: read
    });
    if (reverted) await this.workspace.delete(path);
    return {
      status: "waiting",
      reason: "bytes were stored for the asset after its copy was made, so the move starts over"
    };
  }

  /**
   * A row with a recorded target and no legacy object under any key: the row
   * was written back to an earlier state after the object was deleted. The
   * file at the target is the asset's when no other row names it and it
   * hashes to what the move recorded. The row is pointed at it again.
   *
   * Nothing is deleted on this path.
   */
  private async adoptWithoutSource(
    asset: Asset,
    recordedTarget: string
  ): Promise<LegacyAssetMoveOutcome> {
    let path: string;
    try {
      path = this.workspace.key(recordedTarget);
    } catch {
      return { status: "no_bytes" };
    }
    const recorded = recordedSourceOf(asset);
    const info = await statFile(this.workspace, path);
    const owners = await Asset.findByWorkspacePath(
      asset.user_id,
      asset.project_id,
      path
    );
    if (!info || owners.length > 0 || recorded === null) {
      return { status: "no_bytes" };
    }
    const fileBytes = await this.workspace.read(path);
    if (!fileBytes || sha256(fileBytes) !== recorded) {
      return { status: "no_bytes" };
    }
    const pointed = await this.pointRowAt(asset, path, {
      workspace_size: info.size,
      workspace_mtime: info.modifiedAt,
      workspace_hash: partialContentHash(fileBytes)
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
    return this.clearRecorded(asset, path, { status: "moved", path });
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
