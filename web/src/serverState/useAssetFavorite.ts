import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import { useNotificationStore } from "../stores/NotificationStore";
import type { Asset } from "../stores/ApiTypes";

interface SetAssetFavoriteInput {
  assetIds: string[];
  favorite: boolean;
}

/** Flip the star on every cached list holding one of the assets. */
const withFavorite = (
  data: unknown,
  ids: Set<string>,
  favorite: boolean
): unknown => {
  if (typeof data !== "object" || data === null || !("assets" in data)) {
    return data;
  }
  const { assets } = data;
  if (!Array.isArray(assets)) {
    return data;
  }
  return {
    ...data,
    assets: (assets as Asset[]).map((asset) =>
      ids.has(asset.id) ? { ...asset, favorite } : asset
    )
  };
};

/** Star or unstar assets. Every asset list is refetched, Favorites included. */
export const useSetAssetFavorite = (): ((
  assetIds: string[],
  favorite: boolean
) => void) => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { mutate } = useMutation({
    mutationFn: ({ assetIds, favorite }: SetAssetFavoriteInput) =>
      Promise.all(
        assetIds.map((id) => trpcClient.assets.update.mutate({ id, favorite }))
      ),
    onMutate: ({ assetIds, favorite }) => {
      const ids = new Set(assetIds);
      queryClient.setQueriesData({ queryKey: ["assets"] }, (data: unknown) =>
        withFavorite(data, ids, favorite)
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
    onError: (error: Error) => {
      console.error("Failed to update favorites", error);
      addNotification({
        type: "error",
        alert: true,
        content: "Could not update favorites.",
        dismissable: false
      });
    }
  });
  return useCallback(
    (assetIds: string[], favorite: boolean) => mutate({ assetIds, favorite }),
    [mutate]
  );
};
