/**
 * useTimelineCode
 *
 * Server state for a timeline's embedded authoring code
 * (`trpc.timeline.code.*`): the JS that baked the sequence's scenes, plus
 * per-scene divergence (`edited`) and bake conflicts.
 *
 * A successful `set` or `rebake` also invalidates `timeline.get` (via
 * `trpc.useUtils()`) so the editor's canvas — which reads the baked
 * document, not the code — refetches and shows the new bake.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpc, trpcClient } from "../trpc/client";
import type { RouterInputs, RouterOutputs } from "../trpc/client";

export type TimelineCodeScene =
  RouterOutputs["timeline"]["code"]["get"]["scenes"][number];
export type TimelineCodeGetResult = RouterOutputs["timeline"]["code"]["get"];
export type TimelineCodeBakeResult = RouterOutputs["timeline"]["code"]["set"];
type TimelineCodeSetInput = RouterInputs["timeline"]["code"]["set"];
type TimelineCodeRebakeInput = RouterInputs["timeline"]["code"]["rebake"];
type TimelineCodeDetachInput = RouterInputs["timeline"]["code"]["detach"];

export const timelineCodeQueryKey = (id: string) =>
  ["timeline", id, "code"] as const;

export const useTimelineCode = (sequenceId: string | null | undefined) => {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const query = useQuery({
    queryKey: timelineCodeQueryKey(sequenceId ?? "none"),
    queryFn: (): Promise<TimelineCodeGetResult> =>
      trpcClient.timeline.code.get.query({ id: sequenceId as string }),
    enabled: !!sequenceId,
    staleTime: 10 * 1000
  });

  const invalidateCode = useCallback(() => {
    if (!sequenceId) return;
    queryClient.invalidateQueries({ queryKey: timelineCodeQueryKey(sequenceId) });
  }, [queryClient, sequenceId]);

  // Any successful bake changes what the canvas renders even though the code
  // panel never touches the sequence document directly.
  const refetchBakedDocument = useCallback(() => {
    if (!sequenceId) return;
    void utils.timeline.get.invalidate({ id: sequenceId });
  }, [sequenceId, utils]);

  const setCodeMutation = useMutation({
    mutationFn: (input: Omit<TimelineCodeSetInput, "id">) =>
      trpcClient.timeline.code.set.mutate({
        id: sequenceId as string,
        ...input
      }),
    onSuccess: () => {
      invalidateCode();
      refetchBakedDocument();
    }
  });

  const rebakeMutation = useMutation({
    mutationFn: (input: Omit<TimelineCodeRebakeInput, "id"> = {}) =>
      trpcClient.timeline.code.rebake.mutate({
        id: sequenceId as string,
        ...input
      }),
    onSuccess: () => {
      invalidateCode();
      refetchBakedDocument();
    }
  });

  const detachMutation = useMutation({
    mutationFn: (scenes: TimelineCodeDetachInput["scenes"]) =>
      trpcClient.timeline.code.detach.mutate({
        id: sequenceId as string,
        scenes
      }),
    onSuccess: invalidateCode
  });

  return {
    ...query,
    setCode: setCodeMutation.mutateAsync,
    isSettingCode: setCodeMutation.isPending,
    rebake: rebakeMutation.mutateAsync,
    isRebaking: rebakeMutation.isPending,
    detachScenes: detachMutation.mutateAsync,
    isDetaching: detachMutation.isPending
  };
};

/**
 * Whether the timeline has authoring code at all — the flag `TopBar`'s Code
 * button and the inspector tab list use to decide whether to show up. Reads
 * the same `timeline.code.get` query as `useTimelineCode` (same query key),
 * so opening the panel right after never re-fetches.
 */
export const useTimelineHasCode = (
  sequenceId: string | null | undefined
): boolean => {
  const { data } = useQuery({
    queryKey: timelineCodeQueryKey(sequenceId ?? "none"),
    queryFn: (): Promise<TimelineCodeGetResult> =>
      trpcClient.timeline.code.get.query({ id: sequenceId as string }),
    enabled: !!sequenceId,
    staleTime: 10 * 1000,
    select: (result) => (result.code?.length ?? 0) > 0
  });
  return !!data;
};

export default useTimelineCode;
