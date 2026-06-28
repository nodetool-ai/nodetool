/**
 * Helpers for the Collection node (`nodetool.control.Collection`).
 *
 * A Collection holds an ordered, homogeneous list of media items — every item
 * shares the first item's `type` (image / video / audio / …). Items are the
 * same `{ type, uri, asset_id }` value shape that flows over `output_update`
 * and that every downstream media consumer already understands, so a curated
 * collection is drop-in compatible with the rest of the graph.
 */
import type { Asset, TypeMetadata } from "../stores/ApiTypes";
import { assetToOutputValue } from "./nodeGenerations";

export interface CollectionItem {
  /** "image" | "video" | "audio" | "text" | "json" | "model_3d" | "asset" */
  type: string;
  uri?: string;
  /** Durable reference; preferred over `uri` (which can be a signed URL). */
  asset_id?: string;
  name?: string;
  [key: string]: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The media type the whole collection is locked to (first item wins). */
export const collectionType = (
  items: readonly CollectionItem[]
): string | undefined => (items.length > 0 ? items[0].type : undefined);

/** Stable identity for dedup: prefer the durable asset id, fall back to uri. */
const itemKey = (item: CollectionItem): string =>
  item.asset_id ?? item.uri ?? "";

/** Build a collection item from a persisted asset (asset panel / external upload). */
export const assetToItem = (asset: Asset): CollectionItem | null => {
  const value = assetToOutputValue(asset);
  const type = typeof value.type === "string" ? value.type : undefined;
  if (!type) return null;
  return {
    ...value,
    type,
    asset_id: asset.id,
    name: asset.name ?? undefined
  };
};

/** Coerce a generation / output value (`{ type, uri, … }`) into a collection item. */
export const outputValueToItem = (
  value: unknown,
  assetId?: string
): CollectionItem | null => {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" ? value.type : undefined;
  if (!type) return null;
  return {
    ...value,
    type,
    ...(assetId ? { asset_id: assetId } : {})
  } as CollectionItem;
};

export type AppendResult =
  | { ok: true; items: CollectionItem[]; added: number }
  | { ok: false; reason: "type-mismatch" | "duplicate" | "empty"; expected?: string };

/**
 * Append `incoming` to `existing`, enforcing a single type and de-duplicating.
 * The collection's type is the first existing item's type, or the first
 * incoming item's type when the collection is empty. Items of the wrong type
 * are rejected; already-present items are skipped.
 */
export const appendItems = (
  existing: readonly CollectionItem[],
  incoming: readonly CollectionItem[]
): AppendResult => {
  if (incoming.length === 0) return { ok: false, reason: "empty" };

  const expected = collectionType(existing) ?? incoming[0].type;
  const seen = new Set(existing.map(itemKey).filter(Boolean));
  const next = [...existing];
  let added = 0;
  let mismatched = false;

  for (const item of incoming) {
    if (item.type !== expected) {
      mismatched = true;
      continue;
    }
    const key = itemKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    next.push(item);
    added += 1;
  }

  if (added === 0) {
    return {
      ok: false,
      reason: mismatched ? "type-mismatch" : "duplicate",
      expected
    };
  }
  return { ok: true, items: next, added };
};

const isCollectionItem = (v: unknown): v is CollectionItem =>
  isRecord(v) && typeof v.type === "string";

/** Read the items array off a node's persisted properties, defensively. */
export const readItems = (value: unknown): CollectionItem[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isCollectionItem);
};

/**
 * Media kinds whose item `type` is also a canonical graph data-type, so the
 * Collection's output handle can be narrowed from `any` to the concrete type.
 * Non-media kinds (text/json/model_3d/asset) stay `any` — their ref shape
 * doesn't cleanly map to a single downstream input type.
 */
const NARROWABLE_KINDS: ReadonlySet<string> = new Set(["image", "video", "audio"]);

/**
 * The effective output element type for a collection, or null to keep the
 * declared `any` (empty collection, or a non-narrowable kind).
 */
export const collectionElementType = (
  items: readonly CollectionItem[]
): TypeMetadata | null => {
  const kind = collectionType(items);
  if (!kind || !NARROWABLE_KINDS.has(kind)) return null;
  return {
    type: kind,
    optional: false,
    values: null,
    type_args: [],
    type_name: null
  };
};
