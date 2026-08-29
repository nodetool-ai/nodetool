/**
 * useAssetsForLocators
 *
 * Resolves a list of media locators (`asset://<id>`, or a `*Ref` carrying
 * `asset_id`) to the asset records behind them, positionally aligned with the
 * input. `useResolvedMediaUri` answers "what URL renders this one ref"; a
 * gallery needs the whole record — content type, name, `get_url` — for every
 * item it can page through, which is what {@link AssetViewer} navigates over.
 */

import { useQueries } from "@tanstack/react-query";

import { useAssetStore } from "../../stores/AssetStore";
import type { Asset } from "../../stores/ApiTypes";
import { assetIdOf } from "../../utils/mediaRef";
import type { MediaLocatorSource } from "../../utils/mediaRef";

export type AssetLocator = MediaLocatorSource;

/** @param sources the locators to resolve, in the order the gallery shows them */
export function useAssetsForLocators(
  sources: AssetLocator[]
): (Asset | undefined)[] {
  const getAsset = useAssetStore((state) => state.get);
  const ids = sources.map(assetIdOf);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["asset", id],
      // Safety: the query only runs when `enabled` proved the id is a string.
      queryFn: () => getAsset(id as string),
      enabled: Boolean(id)
    }))
  });

  return results.map((result) => result.data);
}

export default useAssetsForLocators;
