/**
 * Extract an asset id from a node output value. The value may be a plain string
 * id or an AssetRef-like object (`{ uri, asset_id }` or `{ id }`).
 */
export const extractAssetId = (result: unknown): string | undefined => {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.asset_id === "string") return r.asset_id;
    if (typeof r.id === "string") return r.id;
  }
  return undefined;
};
