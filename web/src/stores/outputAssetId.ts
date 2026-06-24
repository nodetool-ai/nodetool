/**
 * Extract an asset id from a node output value. The value may be a plain string
 * id or an AssetRef-like object (`{ uri, asset_id }` or `{ id }`).
 */
export const extractAssetId = (result: unknown): string | undefined => {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    if ("asset_id" in result && typeof result.asset_id === "string")
      return result.asset_id;
    if ("id" in result && typeof result.id === "string") return result.id;
  }
  return undefined;
};
