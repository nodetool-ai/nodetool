/**
 * useAssetUrl
 *
 * Resolves a stored asset id to its fetchable URL through the AssetStore.
 * Returns undefined until the asset resolves, when there is no id, or when the
 * asset is unavailable. A resolution still in flight when the id changes is
 * discarded so a slow earlier asset can never overwrite a newer one.
 */

import { useEffect, useState } from "react";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";

export function useAssetUrl(assetId: string | undefined): string | undefined {
  const getAsset = useAssetStore((s) => s.get);
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    getAsset(assetId)
      .then((asset) => {
        if (!cancelled) {
          setUrl(getAssetUrl(asset) ?? undefined);
        }
      })
      .catch(() => {
        // Asset unavailable — leave the url unset; the caller renders without it.
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, getAsset]);

  return url;
}
