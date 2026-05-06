/**
 * Thin wrappers around the `trpc.timeline.versions.*` hooks.
 *
 * Components can also call `trpc.timeline.versions.*` directly; these wrappers
 * exist for convenience and consistent cache-invalidation patterns.
 */

import { trpc } from "../../trpc/client";

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
  return trpc.timeline.versions.setFavorite.useMutation({
    onSuccess: (_version, vars) => {
      utils.timeline.versions.list.invalidate({
        id: vars.id,
        clipId: vars.clipId
      });
    }
  });
};

/** Delete a clip version; invalidates the versions list on success. */
export const useDeleteClipVersion = () => {
  const utils = trpc.useUtils();
  return trpc.timeline.versions.delete.useMutation({
    onSuccess: (_data, vars) => {
      utils.timeline.versions.list.invalidate({
        id: vars.id,
        clipId: vars.clipId
      });
    }
  });
};
