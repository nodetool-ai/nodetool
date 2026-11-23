/**
 * Reference sets: the files a piece of document content refers to
 * (docs/plans/native-cloud-sync/technical-design.md, "Reference sets and file
 * authorization").
 *
 * A file is named by its asset id. The server stores the result per document
 * and scope, and serves a file of another person only when it is in a set the
 * reader may read.
 */

/**
 * The document kinds that have a reference set function: every kind a grant
 * can name. All are whole documents until phases 3 and 5.
 */
export const REF_DOCUMENT_KINDS = [
  "workflow",
  "timeline",
  "storyboard",
  "script",
  "sketch",
  "application",
  "jsscript"
] as const;
export type RefDocumentKind = (typeof REF_DOCUMENT_KINDS)[number];

export function isRefDocumentKind(value: unknown): value is RefDocumentKind {
  return (REF_DOCUMENT_KINDS as readonly unknown[]).includes(value);
}

/**
 * The four sets stored per document. `viewer` and `editor` describe the
 * current revision. `version_viewer` and `version_editor` describe one saved
 * version. For whole documents, the viewer and editor sets are equal.
 */
export const DOCUMENT_REF_SCOPES = [
  "viewer",
  "editor",
  "version_viewer",
  "version_editor"
] as const;
export type DocumentRefScope = (typeof DOCUMENT_REF_SCOPES)[number];

import { isRecord, isString } from "./predicates.js";
import { decodeSketchLayerData, SERIALIZED_LAYER_DATA_PREFIX } from "./api-schemas/sketch.js";

const ASSET_ID = /^[0-9a-f]{32}$/;

/**
 * A field whose value is asset ids: `assetId`, `asset_ids`,
 * `sourceVideoAssetId`, … An entity of the ingredient library is an image
 * asset, so `entity_id`, `entityId` and `entity_ids` name assets too.
 */
const ASSET_ID_KEY = /(?:asset|entity)_?ids?$/i;

/** A map keyed by asset id, such as `durationsByAssetId`. */
const BY_ASSET_ID_KEY = /by_?asset_?id$/i;

/** `/api/storage/<id>.<ext>` or `/api/storage/<owner>/<id>_thumb.<ext>` inside a URL. */
const STORAGE_PATH =
  /\/api\/storage\/(?:[^/?#]+\/)?([0-9a-f]{32})(?:_thumb|_proxy)?\.[A-Za-z0-9]+/g;

/** The asset id an `asset://` locator names, or null for any other string. */
function idFromLocator(value: string): string | null {
  if (!value.startsWith("asset://")) return null;
  const rest = value.slice("asset://".length).split(/[?#]/)[0];
  const last = rest.slice(rest.lastIndexOf("/") + 1);
  const id = last.replace(/\.[^.]+$/, "");
  return ASSET_ID.test(id) ? id : null;
}

function addFromString(value: string, found: Set<string>): void {
  // A sketch layer's `data` holds its image inside an envelope.
  if (value.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) {
    const { image } = decodeSketchLayerData(value, 0, 0);
    if (image !== null && !image.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) addFromString(image, found);
    return;
  }
  const locator = idFromLocator(value);
  if (locator) found.add(locator);
  if (value.includes("/api/storage/")) {
    for (const match of value.matchAll(STORAGE_PATH)) found.add(match[1]);
  }
}

function addIds(value: unknown, found: Set<string>): void {
  if (isString(value)) {
    if (ASSET_ID.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) addIds(item, found);
  }
}

function collect(content: unknown): Set<string> {
  const found = new Set<string>();
  const pending: unknown[] = [content];
  while (pending.length > 0) {
    const current = pending.pop();
    if (isString(current)) {
      addFromString(current, found);
    } else if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
    } else if (isRecord(current)) {
      for (const [key, child] of Object.entries(current)) {
        if (ASSET_ID_KEY.test(key)) addIds(child, found);
        if (BY_ASSET_ID_KEY.test(key) && isRecord(child)) {
          for (const id of Object.keys(child)) {
            if (ASSET_ID.test(id)) found.add(id);
          }
        }
        pending.push(child);
      }
    }
  }
  return found;
}

/**
 * The asset ids `content` refers to, sorted. `content` is the stored
 * document: a workflow's graph, a timeline's, storyboard's, script's,
 * app's or JS script's document, or a sketch's document with its thumbnail.
 * It may also be the JSON text of any of them.
 *
 * Every kind is a whole document in phase 2, so every value it holds is
 * current content: a clip's versions, a shot's earlier keyframes and a
 * node's properties are followed like any other field. A reference is an
 * `asset://` locator, a storage URL, a 32-character id under a field named
 * like `assetId`, `asset_ids` or `entityId`, a key of a map named like
 * `durationsByAssetId`, or either of the first two inside a sketch layer's
 * `ntlayer:` envelope.
 */
export function refsOf(kind: RefDocumentKind, content: unknown): string[] {
  if (!isRefDocumentKind(kind)) {
    throw new Error(`No reference set function for ${String(kind)}`);
  }
  let value = content;
  if (isString(content)) {
    try {
      value = JSON.parse(content) as unknown;
    } catch {
      // Not JSON: read the text as one string value.
    }
  }
  return [...collect(value)].sort();
}
