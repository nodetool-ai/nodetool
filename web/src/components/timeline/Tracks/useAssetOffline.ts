/**
 * useAssetOffline
 *
 * Whether a clip's asset references a local file in place that is missing or
 * changed on disk. The server computes the flag on each asset read. False
 * until the asset resolves, with no id, and when the asset is unavailable.
 * A relink bumps the asset's revision, which reads it again.
 */

import { useEffect, useState } from "react";
import { useAssetStore } from "../../../stores/AssetStore";
import { useAssetRevision } from "../../../stores/AssetRevisionStore";
import { sharedAssetRequest } from "./sharedAssetRequest";
import { isAssetOffline } from "../../../utils/assetHelpers";

export function useAssetOffline(assetId: string | undefined): boolean {
  const getAsset = useAssetStore((s) => s.get);
  const revision = useAssetRevision(assetId);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!assetId) {
      setOffline(false);
      return;
    }
    let cancelled = false;
    sharedAssetRequest(getAsset, assetId)
      .then((asset) => {
        if (!cancelled) {
          setOffline(isAssetOffline(asset));
        }
      })
      .catch(() => {
        // Asset unavailable — nothing to relink, so no offline badge.
        if (!cancelled) {
          setOffline(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, getAsset, revision]);

  return offline;
}
