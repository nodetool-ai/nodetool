/**
 * The `updated_at` of a 3D clip's set asset, for the Blockout reference rows.
 *
 * A set is saved in place under the same id, so its revision is the only thing
 * that shows the reference was rendered from an older set. The query shares
 * the `["asset", id]` key the model editor invalidates when it saves, so a save
 * there moves this value without a reload.
 */

import { useQuery } from "@tanstack/react-query";

import { useAssetStore } from "../../stores/AssetStore";

/** Undefined while the asset loads or when it has no revision. */
export function useModel3DAssetRevision(
  assetId: string | undefined
): string | undefined {
  const getAsset = useAssetStore((s) => s.get);
  const { data } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => getAsset(assetId ?? ""),
    enabled: Boolean(assetId),
    staleTime: 0
  });
  return assetId ? (data?.updated_at ?? undefined) : undefined;
}
