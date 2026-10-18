/**
 * A value found while walking a bundle's document or graphs. Both are decoded
 * JSON, so every value is a scalar, an array or a keyed object.
 */
export type BundleContent = string | number | boolean | null | undefined | BundleContent[] | ContentRecord;

/** A keyed object whose values are bundle content. */
export interface ContentRecord {
  [key: string]: BundleContent;
}

/**
 * View a bundle part as content to walk.
 *
 * `BundleGraph` carries its nodes and edges as `unknown[]` and the app
 * document is an interface with no index signature, so neither is assignable
 * to {@link BundleContent} although both are decoded JSON.
 */
export function bundleContent<T>(part: T): BundleContent {
  // SAFETY: bundles come from `serializeApplicationBundle` or a parsed export, so every value in a document or graph is JSON.
  return part as BundleContent;
}

/** A keyed object inside bundle content, arrays excluded. */
export function isContentRecord(value: BundleContent): value is ContentRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
