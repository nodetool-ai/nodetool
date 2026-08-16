/**
 * playTake — play a line's recorded take.
 *
 * A take stores an asset id, not a URL; the bytes live behind the asset's own
 * `get_url`. Shared by the script editor's line row and the storyboard shot
 * inspector, which both offer a play button on the current take.
 */

import { useAssetStore } from "../AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

export const playTake = async (assetId: string): Promise<void> => {
  if (typeof Audio === "undefined") {
    return;
  }
  try {
    const asset = await useAssetStore.getState().get(assetId);
    const url = getAssetUrl(asset);
    if (url) {
      void new Audio(url).play().catch(() => undefined);
    }
  } catch {
    // Asset unavailable — nothing to play.
  }
};
