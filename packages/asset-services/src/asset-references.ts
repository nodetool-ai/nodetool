/**
 * Asset references inside stored documents, and keeping them inside one
 * project (PRD D10).
 *
 * Document formats evolve independently, but stored asset locators
 * (`asset://<id>.<ext>`) and the fields that hold asset ids share stable
 * names. Discovery reads those, never arbitrary nested `id` fields.
 */
import { Asset } from "@nodetool-ai/models";
import { getProjectFolderResolver } from "@nodetool-ai/runtime";
import { copyAssetToProject } from "./copy-asset-to-project.js";

/** A document as JSON: what is stored, and what discovery walks. */
export type DocumentJson =
  | string
  | number
  | boolean
  | null
  | DocumentJson[]
  | { [key: string]: DocumentJson };

type DocumentJsonObject = { [key: string]: DocumentJson };

function isJsonString(value: DocumentJson): value is string {
  return typeof value === "string";
}

function isJsonObject(value: DocumentJson): value is DocumentJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Field names, lowercased, whose string or string-array value is asset ids. */
export const ASSET_REFERENCE_KEYS: ReadonlySet<string> = new Set([
  "assetid",
  "asset_id",
  "assetids",
  "asset_ids",
  "currentassetid",
  "current_asset_id",
  "waveformassetid",
  "waveform_asset_id",
  "entityid",
  "entity_id",
  "entityids",
  "entity_ids",
  "thumbnailassetid",
  "thumbnail_asset_id",
  "referenceassetid",
  "reference_asset_id",
  "referenceassetids",
  "reference_asset_ids",
  "locationid",
  "location_id",
  "styleentityid",
  "style_entity_id",
  "sourceassetid",
  "source_asset_id",
  "maskassetid",
  "mask_asset_id"
]);

/** The asset id an `asset://` locator names, or null for any other string. */
export function assetIdFromLocator(locator: string): string | null {
  if (!locator.startsWith("asset://")) return null;
  const rest = locator.slice("asset://".length).split(/[?#]/)[0];
  const last = rest.includes("/")
    ? rest.slice(rest.lastIndexOf("/") + 1)
    : rest;
  const id = last.replace(/\.[^.]+$/, "");
  return id || null;
}

/** `locator` with its asset id replaced when `ids` maps it. */
export function remapAssetLocator(
  locator: string,
  ids: ReadonlyMap<string, string>
): string {
  const assetId = assetIdFromLocator(locator);
  if (!assetId) return locator;
  const copiedId = ids.get(assetId);
  if (!copiedId) return locator;
  const prefix = locator.slice(0, locator.lastIndexOf(assetId));
  return `${prefix}${copiedId}${locator.slice(prefix.length + assetId.length)}`;
}

function addIds(value: DocumentJson, target: Set<string>): void {
  if (isJsonString(value) && value.length > 0) {
    target.add(assetIdFromLocator(value) ?? value);
  } else if (Array.isArray(value)) {
    for (const item of value) addIds(item, target);
  }
}

/**
 * Every asset id `value` references: each `asset://` locator, and each
 * string under an {@link ASSET_REFERENCE_KEYS} field or one of `extraKeys`
 * (lowercased field names a format adds, such as a sketch layer's `image`).
 */
export function findAssetReferences(
  value: DocumentJson,
  extraKeys: readonly string[] = []
): Set<string> {
  const keys = new Set([...ASSET_REFERENCE_KEYS, ...extraKeys]);
  const found = new Set<string>();
  const pending: DocumentJson[] = [value];
  while (pending.length > 0) {
    const current = pending.pop() ?? null;
    if (isJsonString(current)) {
      const id = assetIdFromLocator(current);
      if (id) found.add(id);
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (isJsonObject(current)) {
      for (const [key, child] of Object.entries(current)) {
        if (keys.has(key.toLowerCase())) addIds(child, found);
        pending.push(child);
      }
    }
  }
  return found;
}

/**
 * A copy of `value` with every asset id in `ids` replaced: inside `asset://`
 * locators, and as a whole string anywhere. Asset ids are unique opaque
 * tokens, so a string equal to one is a reference to it.
 */
export function remapAssetReferences(
  value: DocumentJson,
  ids: ReadonlyMap<string, string>
): DocumentJson {
  if (isJsonString(value)) {
    return ids.get(value) ?? remapAssetLocator(value, ids);
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapAssetReferences(item, ids));
  }
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      remapAssetReferences(child, ids)
    ])
  );
}

/** An asset of another project that a document now references as a copy. */
export interface AssetReferenceCopy {
  /** The asset the document referenced. */
  source_asset_id: string;
  /** The copy in the document's project that it references now. */
  asset_id: string;
}

export interface LocalizeAssetReferencesArgs<T> {
  userId: string;
  /** The project the document belongs to. */
  projectId: string;
  /**
   * The document, or any value about to be stored with it. It must survive
   * a JSON round trip, as everything stored as document text does.
   */
  value: T;
  /** Lowercased field names this format adds to {@link ASSET_REFERENCE_KEYS}. */
  extraKeys?: readonly string[];
}

/**
 * `value` with every reference to an asset of another project replaced by a
 * reference to its copy in `projectId`, made with {@link copyAssetToProject}.
 * After this, the value references no asset whose `project_id` is not the
 * document's project. References to unknown ids are left for the caller's
 * validation to report. A value that needed no copy is returned as it is.
 *
 * A host with no project folder resolver keeps no project files to copy, and
 * the value is returned unchanged.
 *
 * Throws what `copyAssetToProject` throws, before anything is stored, so a
 * caller reports the error instead of storing a reference across projects.
 */
export async function localizeAssetReferences<T>(
  args: LocalizeAssetReferencesArgs<T>
): Promise<{ value: T; copies: AssetReferenceCopy[] }> {
  if (!getProjectFolderResolver()) return { value: args.value, copies: [] };
  // SAFETY: JSON.parse of JSON.stringify output is JSON by construction.
  const tree = JSON.parse(JSON.stringify(args.value) ?? "null") as DocumentJson;
  const referenced = [...findAssetReferences(tree, args.extraKeys)];

  const ids = new Map<string, string>();
  const copies: AssetReferenceCopy[] = [];
  for (let start = 0; start < referenced.length; start += 900) {
    const assets = await Asset.findMany(
      args.userId,
      referenced.slice(start, start + 900)
    );
    for (const asset of assets) {
      if (asset.project_id === args.projectId) continue;
      const { asset: used } = await copyAssetToProject({
        userId: args.userId,
        assetId: asset.id,
        projectId: args.projectId
      });
      if (used.id === asset.id) continue;
      ids.set(asset.id, used.id);
      copies.push({ source_asset_id: asset.id, asset_id: used.id });
    }
  }
  if (ids.size === 0) return { value: args.value, copies };
  // SAFETY: the tree is the JSON form of a T, the documented contract of
  // `value`, with only asset id strings replaced by other asset id strings.
  const value = remapAssetReferences(tree, ids) as T;
  return { value, copies };
}
