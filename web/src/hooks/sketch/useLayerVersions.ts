/**
 * Thin wrappers around `trpc.sketch.versions.*` with consistent cache
 * invalidation. Mirrors `useClipVersions` for the timeline.
 */

import { trpc } from "../../trpc/client";

/** Fetch all versions for a specific layer in an image document. */
export const useLayerVersions = (
  documentId: string | null | undefined,
  layerId: string | null | undefined
) =>
  trpc.sketch.versions.list.useQuery(
    { id: documentId ?? "", layerId: layerId ?? "" },
    { enabled: !!(documentId && layerId), staleTime: 30_000 }
  );

/** Toggle the favorite flag on a layer version; invalidates the list. */
export const useSetLayerVersionFavorite = () => {
  const utils = trpc.useUtils();
  return trpc.sketch.versions.setFavorite.useMutation({
    onSuccess: (_version, vars) => {
      void utils.sketch.versions.list.invalidate({
        id: vars.id,
        layerId: vars.layerId
      });
      void utils.sketch.get.invalidate({ id: vars.id });
    }
  });
};

/** Delete a layer version; invalidates the versions list on success. */
export const useDeleteLayerVersion = () => {
  const utils = trpc.useUtils();
  return trpc.sketch.versions.delete.useMutation({
    onSuccess: (_data, vars) => {
      void utils.sketch.versions.list.invalidate({
        id: vars.id,
        layerId: vars.layerId
      });
      void utils.sketch.get.invalidate({ id: vars.id });
    }
  });
};
