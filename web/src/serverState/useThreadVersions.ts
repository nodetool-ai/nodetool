/**
 * useThreadVersions
 *
 * Server state for the versions of a chat thread (`trpc.messages.versions`).
 * Edit and Retry keep the turns they replace as an earlier version of the
 * conversation at that point. Each fork names the live message the versions
 * follow, and the switcher sits on the first live message after it.
 *
 * The query key carries a signature of the loaded messages, so a finished
 * turn, a rewind or a switch refetches without explicit invalidation.
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import useGlobalChatStore from "../stores/GlobalChatStore";
import { trpcClient } from "../trpc/client";

import type { RouterOutputs } from "../trpc/client";

export type ThreadFork = RouterOutputs["messages"]["versions"]["forks"][number];

/** A switcher for one message: which version it is and how to change it. */
export interface MessageVersionNav {
  /** 1-based position of the live version. */
  index: number;
  count: number;
  /** Show the version at this 1-based position. */
  select: (index: number) => void;
}

export const threadVersionsQueryKey = (
  threadId: string,
  signature: string
) => ["threads", threadId, "versions", signature] as const;

interface UseThreadVersionsResult {
  /** Switchers keyed by the id of the message they belong to. */
  navByMessageId: Record<string, MessageVersionNav>;
  isSwitching: boolean;
}

/**
 * @param signature changes whenever the thread's live messages do
 * @param enabled false while a turn runs, when the history is still moving
 * @param onSwitchError reports a switch the server refused
 */
export const useThreadVersions = (
  threadId: string | null | undefined,
  signature: string,
  enabled: boolean,
  onSwitchError?: (error: unknown) => void
): UseThreadVersionsResult => {
  const queryClient = useQueryClient();
  const loadMessages = useGlobalChatStore((state) => state.loadMessages);

  const query = useQuery({
    queryKey: threadVersionsQueryKey(threadId ?? "none", signature),
    queryFn: async (): Promise<ThreadFork[]> =>
      (
        await trpcClient.messages.versions.query({
          thread_id: threadId as string
        })
      ).forks,
    enabled: Boolean(threadId) && enabled,
    staleTime: Infinity
  });

  const switchMutation = useMutation({
    mutationFn: (input: { after: string; branchId: string }) =>
      trpcClient.messages.switchVersion.mutate({
        thread_id: threadId as string,
        after: input.after,
        branch_id: input.branchId
      }),
    onSuccess: async () => {
      if (!threadId) return;
      await loadMessages(threadId);
      await queryClient.invalidateQueries({
        queryKey: ["threads", threadId, "versions"]
      });
    },
    onError: (error) => onSwitchError?.(error)
  });

  const { mutate, isPending } = switchMutation;
  const selectVersion = useCallback(
    (fork: ThreadFork, index: number) => {
      const branchId = fork.versions[index - 1];
      if (!branchId || isPending) return;
      mutate({ after: fork.after, branchId });
    },
    [mutate, isPending]
  );

  const forks = query.data;
  const navByMessageId = useMemo(() => {
    const nav: Record<string, MessageVersionNav> = {};
    for (const fork of forks ?? []) {
      if (!fork.first_message_id || fork.active < 0) continue;
      nav[fork.first_message_id] = {
        index: fork.active + 1,
        count: fork.versions.length,
        select: (index: number) => selectVersion(fork, index)
      };
    }
    return nav;
  }, [forks, selectVersion]);

  return { navByMessageId, isSwitching: isPending };
};
