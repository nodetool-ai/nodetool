import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import type { Asset } from "../stores/ApiTypes";
import { useAssetStore } from "../stores/AssetStore";
import { useAssetRevisionStore } from "../stores/AssetRevisionStore";
import { normalizeAssetUrls } from "../utils/normalizeAsset";

export interface RelinkAssetInput {
  id: string;
  /** Absolute disk path of the replacement file. */
  path: string;
}

/**
 * Point an asset that references a local file in place at another file.
 * The asset keeps its id and URL. On success the asset query holds the
 * relinked row, folder listings refetch, and the asset's revision moves so
 * hooks that resolved it once resolve it again.
 */
export function useRelinkAsset(): UseMutationResult<
  Asset,
  Error,
  RelinkAssetInput
> {
  const queryClient = useQueryClient();
  const addAsset = useAssetStore((s) => s.add);
  const bump = useAssetRevisionStore((s) => s.bump);
  return useMutation({
    mutationFn: async (input: RelinkAssetInput) =>
      normalizeAssetUrls(
        (await trpcClient.assets.relinkExternal.mutate(input)) as Asset
      ),
    onSuccess: (asset) => {
      addAsset(asset);
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      bump(asset.id);
    }
  });
}
