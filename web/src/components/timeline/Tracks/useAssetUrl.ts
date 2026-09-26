/**
 * useAssetUrl
 *
 * Resolves a stored asset id to its media URL through the AssetStore.
 * Returns undefined until the asset resolves, when there is no id, or when the
 * asset is unavailable. A resolution still in flight when the id changes is
 * discarded so a slow earlier asset can never overwrite a newer one.
 *
 * The URL comes from `getAssetMediaUrl`, so for a file referenced in place it
 * carries the file's mtime and the URL-keyed caches (peaks, filmstrips) miss
 * after a relink. A relink bumps the asset's revision, which resolves it again.
 */

import { useEffect, useState } from "react";
import { useAssetStore } from "../../../stores/AssetStore";
import { useAssetRevision } from "../../../stores/AssetRevisionStore";
import { sharedAssetRequest } from "./sharedAssetRequest";
import { getAssetMediaUrl } from "../../../utils/assetHelpers";
import { packageClipMediaUrl } from "../packageClipMedia";

export function useAssetUrl(assetId: string | undefined): string | undefined {
  const getAsset = useAssetStore((s) => s.get);
  const revision = useAssetRevision(assetId);
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    const packageUrl = packageClipMediaUrl(assetId);
    if (packageUrl) {
      setUrl(packageUrl);
      return;
    }
    let cancelled = false;
    sharedAssetRequest(getAsset, assetId)
      .then((asset) => {
        if (!cancelled) {
          setUrl(getAssetMediaUrl(asset) ?? undefined);
        }
      })
      .catch(() => {
        // Asset unavailable — leave the url unset; the caller renders without it.
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, getAsset, revision]);

  return url;
}
