/**
 * Use an asset of another project in this one (PRD D10). Personal is the
 * library: picking one of its assets in project A copies the file into A's
 * `Imported/` directory and the document references the copy. The copy is an
 * independent asset, so editing or deleting either one leaves the other
 * unchanged.
 *
 * The copy records the source asset's id and the partial content hash of the
 * bytes it was made from. Using the same unchanged source in the same project
 * again returns that copy instead of writing a second file.
 */
import { Asset } from "@nodetool-ai/models";
import { ENTITY_METADATA_KEY, isRecord, isString } from "@nodetool-ai/protocol";
import { getProjectFolderResolver } from "@nodetool-ai/runtime";
import { retrieveAssetBytes } from "./asset-paths.js";
import { EXTERNAL_FINGERPRINT_KEYS } from "./external-asset-lookup.js";
import { IMPORTED_DIRECTORY, saveProjectAsset } from "./project-asset.js";
import {
  WORKSPACE_SERVER_KEYS,
  partialContentHash,
  requireProjectFolder
} from "./project-asset-file.js";
import { getAssetAdapter } from "./storage.js";

/** Metadata key on a copy: the id of the asset it was copied from. */
export const COPIED_FROM_ASSET_KEY = "copied_from_asset_id";

/** Metadata key on a copy: the partial content hash of the source's bytes. */
export const COPIED_FROM_HASH_KEY = "copied_from_hash";

/**
 * The metadata keys a copy carries about its source. Server-owned: a client
 * metadata update never writes them.
 */
export const COPY_SOURCE_KEYS = [
  COPIED_FROM_ASSET_KEY,
  COPIED_FROM_HASH_KEY
] as const;

/** Thrown when an asset cannot be copied into a project. */
export class AssetCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetCopyError";
  }
}

export interface CopyAssetToProjectArgs {
  userId: string;
  /** The asset to use. It must belong to `userId`. */
  assetId: string;
  /** The project the asset is used in. */
  projectId: string;
}

export interface CopiedAsset {
  /** The asset the document references: the copy, or the asset itself. */
  asset: Asset;
  /**
   * True when this call wrote a new file and row. False when the asset
   * already belongs to the project or an earlier copy of the same unchanged
   * source was returned.
   */
  copied: boolean;
}

const copyQueues = new Map<string, Promise<unknown>>();

/**
 * Run `task` after every earlier copy of the same source into the same
 * project, so two picks that arrive together still end with one copy.
 */
function withCopyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = copyQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  copyQueues.set(key, settled);
  void settled.then(() => {
    if (copyQueues.get(key) === settled) copyQueues.delete(key);
  });
  return next;
}

/**
 * Whether `asset` already belongs to the project whose folder is
 * `projectId`. A loose asset (`default`) belongs to the project its id
 * resolves to, which is Personal.
 */
async function belongsTo(asset: Asset, projectId: string): Promise<boolean> {
  if (asset.project_id === projectId) return true;
  const resolve = getProjectFolderResolver();
  if (!resolve) return false;
  try {
    const folder = await resolve(asset.project_id, asset.user_id);
    return folder.ok && folder.projectId === projectId;
  } catch {
    // An unreachable source folder is a different project; the read below
    // reports the missing bytes.
    return false;
  }
}

const SOURCE_FILE_KEYS = new Set<string>([
  ...WORKSPACE_SERVER_KEYS,
  ...EXTERNAL_FINGERPRINT_KEYS,
  ...COPY_SOURCE_KEYS
]);

/**
 * The entity marker of a copy. The assets it names besides its own bytes, a
 * swapped reference image and a LoRA file, are copied too, so the copied
 * entity references nothing outside its project.
 */
async function copyEntityMarker(
  marker: Record<string, unknown>,
  copyRelated: (assetId: string) => Promise<string>
): Promise<Record<string, unknown>> {
  const next = { ...marker };
  const reference = next["reference_asset_id"];
  if (isString(reference) && reference.trim()) {
    next["reference_asset_id"] = await copyRelated(reference.trim());
  }
  const lora = next["lora"];
  const loraAsset = isRecord(lora) ? lora["asset_id"] : null;
  if (isRecord(lora) && isString(loraAsset) && loraAsset) {
    next["lora"] = { ...lora, asset_id: await copyRelated(loraAsset) };
  }
  return next;
}

/**
 * Use the asset `assetId` in the project `projectId`, and return the asset
 * the project's documents must reference.
 *
 * An asset of the project itself is returned as it is. An asset of another
 * project, Personal included, is copied: its bytes become a new file in the
 * `Imported/` directory of the project's folder, with a new row whose
 * metadata records the source asset's id and content hash. The source's other
 * metadata is kept, so an entity stays an entity.
 *
 * A copy of the same source whose recorded hash still matches the source's
 * bytes is returned instead of writing another file. A source whose bytes
 * changed since gets a new copy, and the earlier copy is left as it is.
 *
 * Throws {@link AssetCopyError} when the asset is missing, is a folder, or
 * has no bytes, and `ProjectFolderUnavailableError` when the project's folder
 * cannot be reached. Nothing is written in either case.
 */
export async function copyAssetToProject(
  args: CopyAssetToProjectArgs
): Promise<CopiedAsset> {
  return copyInto(args, new Set());
}

async function copyInto(
  args: CopyAssetToProjectArgs,
  visiting: Set<string>
): Promise<CopiedAsset> {
  const source = await Asset.find(args.userId, args.assetId);
  if (!source) {
    throw new AssetCopyError(`Asset ${args.assetId} was not found`);
  }
  const destination = await requireProjectFolder(args.projectId, args.userId);
  if (await belongsTo(source, destination.projectId)) {
    return { asset: source, copied: false };
  }
  if (source.isFolder) {
    throw new AssetCopyError(
      `${source.name || source.id} is a folder; only files can be copied into a project`
    );
  }
  if (visiting.has(source.id)) {
    throw new AssetCopyError(`Asset ${source.id} references itself`);
  }

  const lockKey = `${args.userId}\u0000${destination.projectId}\u0000${source.id}`;
  return withCopyLock(lockKey, async () => {
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      source.user_id,
      source.id,
      source.content_type
    );
    if (!bytes) {
      throw new AssetCopyError(
        `${source.name || source.id} has no stored media to copy`
      );
    }
    const hash = partialContentHash(bytes);
    const earlier = (
      await Asset.findByMetadataString(
        args.userId,
        destination.projectId,
        COPIED_FROM_ASSET_KEY,
        source.id
      )
    ).find((copy) => copy.metadata?.[COPIED_FROM_HASH_KEY] === hash);
    if (earlier) return { asset: earlier, copied: false };

    const metadata: Record<string, unknown> = Object.fromEntries(
      Object.entries(source.metadata ?? {}).filter(
        ([key]) => !SOURCE_FILE_KEYS.has(key)
      )
    );
    const marker = metadata[ENTITY_METADATA_KEY];
    if (isRecord(marker)) {
      const inside = new Set(visiting).add(source.id);
      metadata[ENTITY_METADATA_KEY] = await copyEntityMarker(
        marker,
        async (related) =>
          (
            await copyInto(
              { ...args, assetId: related, projectId: destination.projectId },
              inside
            )
          ).asset.id
      );
    }
    metadata[COPIED_FROM_ASSET_KEY] = source.id;
    metadata[COPIED_FROM_HASH_KEY] = hash;

    const asset = await saveProjectAsset({
      projectId: destination.projectId,
      userId: args.userId,
      name: source.name,
      contentType: source.content_type,
      bytes,
      directory: IMPORTED_DIRECTORY,
      // The source's folder row belongs to its own project.
      parentId: args.userId,
      metadata
    });
    return { asset, copied: true };
  });
}
