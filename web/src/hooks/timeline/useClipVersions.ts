/** Thin wrappers around `trpc.timeline.versions.*` with consistent cache invalidation. */

import type { ClipVersion } from "@nodetool-ai/timeline";
import { trpc } from "../../trpc/client";

interface SetFavoriteVars {
  id: string;
  clipId: string;
  versionId: string;
  favorite: boolean;
}

interface DeleteVersionVars {
  id: string;
  clipId: string;
  versionId: string;
}

interface VersionMutationProcedure<TVars, TData> {
  useMutation: (options: {
    onSuccess: (data: TData, variables: TVars) => void;
  }) => {
    mutate: (variables: TVars) => void;
  };
}

interface ExtendedVersionsRouter {
  setFavorite: VersionMutationProcedure<SetFavoriteVars, ClipVersion>;
  delete: VersionMutationProcedure<DeleteVersionVars, { ok: true }>;
}

const extendedVersions = trpc.timeline.versions as typeof trpc.timeline.versions &
  ExtendedVersionsRouter;

/** Fetch all versions for a specific clip inside a sequence. */
export const useClipVersions = (
  sequenceId: string | null | undefined,
  clipId: string | null | undefined
) =>
  trpc.timeline.versions.list.useQuery(
    { id: sequenceId ?? "", clipId: clipId ?? "" },
    { enabled: !!(sequenceId && clipId), staleTime: 30_000 }
  );

/** Append a new clip version; invalidates the versions list on success. */
export const useAppendClipVersion = () => {
  const utils = trpc.useUtils();
  return trpc.timeline.versions.append.useMutation({
    onSuccess: (_version, vars) => {
      utils.timeline.versions.list.invalidate({
        id: vars.id,
        clipId: vars.clipId
      });
      utils.timeline.get.invalidate({ id: vars.id });
    }
  });
};

/** Toggle the favorite flag on a clip version. */
export const useSetClipVersionFavorite = () => {
  const utils = trpc.useUtils();
  return extendedVersions.setFavorite.useMutation({
    onSuccess: (_version, vars) => {
      void utils.timeline.versions.list.invalidate({
        id: vars.id,
        clipId: vars.clipId
      });
    }
  });
};

/** Delete a clip version; invalidates the versions list on success. */
export const useDeleteClipVersion = () => {
  const utils = trpc.useUtils();
  return extendedVersions.delete.useMutation({
    onSuccess: (_data, vars) => {
      void utils.timeline.versions.list.invalidate({
        id: vars.id,
        clipId: vars.clipId
      });
    }
  });
};
