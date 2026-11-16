/**
 * Reference sets: the files a piece of document content refers to
 * (docs/plans/native-cloud-sync/technical-design.md, "Reference sets and file
 * authorization").
 *
 * A file is named by its asset id. The server stores the result per document
 * and scope, and serves a file of another person only when it is in a set the
 * reader may read.
 */

/** The document kinds that have a reference set function. */
export const REF_DOCUMENT_KINDS = ["workflow", "timeline"] as const;
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

const ASSET_ID = /^[0-9a-f]{32}$/;

/** A field whose value is asset ids: `assetId`, `asset_ids`, `sourceVideoAssetId`, … */
const ASSET_ID_KEY = /asset_?ids?$/i;

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
  const locator = idFromLocator(value);
  if (locator) found.add(locator);
  if (value.includes("/api/storage/")) {
    for (const match of value.matchAll(STORAGE_PATH)) found.add(match[1]);
  }
}

function addIds(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
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
    if (typeof current === "string") {
      addFromString(current, found);
    } else if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
    } else if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        if (ASSET_ID_KEY.test(key)) addIds(child, found);
        if (
          BY_ASSET_ID_KEY.test(key) &&
          child !== null &&
          typeof child === "object" &&
          !Array.isArray(child)
        ) {
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
 * document: a workflow's graph, or a timeline's document. It may also be
 * the JSON text of either.
 *
 * Both kinds are whole documents in phase 1, so every value they hold is
 * current content: a clip's versions and a node's properties are followed
 * like any other field. A reference is an `asset://` locator, a storage URL,
 * a 32-character id under a field named like `assetId` or `asset_ids`, or a
 * key of a map named like `durationsByAssetId`.
 */
export function refsOf(kind: RefDocumentKind, content: unknown): string[] {
  if (!isRefDocumentKind(kind)) {
    throw new Error(`No reference set function for ${String(kind)}`);
  }
  let value = content;
  if (typeof content === "string") {
    try {
      value = JSON.parse(content) as unknown;
    } catch {
      // Not JSON: read the text as one string value.
    }
  }
  return [...collect(value)].sort();
}
