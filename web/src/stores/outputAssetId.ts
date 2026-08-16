import { isString } from "../utils/typePredicates";
/**
 * Extract an asset id from a node output value. The value may be a plain string
 * id or an AssetRef-like object (`{ uri, asset_id }` or `{ id }`).
 */
export const extractAssetId = (result: unknown): string | undefined => {
  if (!result) return undefined;
  if (isString(result)) return result;
  if (typeof result === "object") {
    if ("asset_id" in result && isString(result.asset_id))
      return result.asset_id;
    if ("id" in result && isString(result.id)) return result.id;
  }
  return undefined;
};
