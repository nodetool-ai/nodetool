/**
 * Rewrite resource IDs inside a stored document.
 *
 * A copy of a document, and a project folder opened as a copy, point at new
 * rows. Every string that is an old ID, and every `asset://` locator that
 * names one, is replaced by the new ID. Document formats change on their own
 * schedule, so the rewrite walks the value and does not know its shape.
 *
 * A caller that takes its IDs from a file it did not write must pass only
 * IDs of the shape NodeTool generates. A string is replaced wherever it
 * equals a key, so a key such as `image` would rewrite every value `image`.
 */

/** The asset ID in an `asset://` locator, or null for any other string. */
export function assetIdFromLocator(locator: string): string | null {
  if (!locator.startsWith("asset://")) return null;
  const rest = locator.slice("asset://".length).split(/[?#]/)[0] ?? "";
  const last = rest.includes("/")
    ? rest.slice(rest.lastIndexOf("/") + 1)
    : rest;
  const id = last.replace(/\.[^.]+$/, "");
  return id || null;
}

function remapAssetLocator(
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

function remapString(value: string, ids: ReadonlyMap<string, string>): string {
  if (value.startsWith("asset://")) return remapAssetLocator(value, ids);
  return ids.get(value) ?? value;
}

/**
 * A deep copy of the JSON value `value` in which every old ID in `ids` is its
 * new ID. Object keys are never rewritten and keep their order, so a
 * rewritten file differs only where an ID changed.
 */
export function remapResourceIds<T>(
  value: T,
  ids: ReadonlyMap<string, string>
): T {
  const text = JSON.stringify(value);
  // `undefined` has no JSON text and holds no ID.
  if (text === undefined) return value;
  const copy: T = JSON.parse(text, (_key, child) =>
    typeof child === "string" ? remapString(child, ids) : child
  );
  return copy;
}
