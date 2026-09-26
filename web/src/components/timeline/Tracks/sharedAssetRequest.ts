/**
 * One asset read shared by the hooks a clip mounts together.
 *
 * `useAssetUrl` and `useAssetOffline` both resolve a clip's asset on mount.
 * Requests for the same id that start while one is in flight share it, so a
 * clip costs one `assets.get`, not two. The entry is dropped when the request
 * settles, so the next mount or revision reads the server again.
 */
import type { Asset } from "../../../stores/ApiTypes";

const inFlight = new Map<string, Promise<Asset>>();

export function sharedAssetRequest(
  getAsset: (id: string) => Promise<Asset>,
  assetId: string
): Promise<Asset> {
  const pending = inFlight.get(assetId);
  if (pending) {
    return pending;
  }
  const request = getAsset(assetId).finally(() => {
    inFlight.delete(assetId);
  });
  inFlight.set(assetId, request);
  return request;
}
