/** Thin wrappers around `trpc.sketch.versions.*` — mirrors `useClipVersions`. */

import { trpc } from "../../trpc/client";

export const useLayerVersions = (
  documentId: string | null | undefined,
  layerId: string | null | undefined
) =>
  trpc.sketch.versions.list.useQuery(
    { id: documentId ?? "", layerId: layerId ?? "" },
    { enabled: !!(documentId && layerId), staleTime: 30_000 }
  );

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
