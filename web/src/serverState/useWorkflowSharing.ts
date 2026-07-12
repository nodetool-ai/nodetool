/**
 * Server state for private workflow sharing.
 *
 * The owner mints role-scoped share links (`viewer` opens and runs, `editor`
 * also modifies); anyone signed in who redeems a link becomes a collaborator.
 * Backed by the `workflows.sharing.*` tRPC procedures.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";

export type ShareRole = "viewer" | "editor";
export type WorkflowRole = "owner" | ShareRole;

export const workflowSharingQueryKey = (workflowId: string) =>
  ["workflow", workflowId, "sharing"] as const;

export const sharedWithMeQueryKey = ["workflows", "shared-with-me"] as const;

export const myWorkflowRoleQueryKey = (workflowId: string) =>
  ["workflow", workflowId, "my-role"] as const;

/** Build the URL a collaborator opens to redeem a share link. */
export const shareUrlForToken = (token: string): string =>
  `${window.location.origin}/share/${token}`;

/** Collaborators + share links, for the owner's share dialog. */
export const useWorkflowSharing = (workflowId: string | null | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: workflowId
      ? workflowSharingQueryKey(workflowId)
      : ["workflow", "none", "sharing"],
    queryFn: () =>
      trpcClient.workflows.sharing.get.query({ id: workflowId as string }),
    enabled: !!workflowId
  });

  const invalidate = () => {
    if (workflowId) {
      queryClient.invalidateQueries({
        queryKey: workflowSharingQueryKey(workflowId)
      });
    }
  };

  const createLink = useMutation({
    mutationFn: (role: ShareRole) =>
      trpcClient.workflows.sharing.createLink.mutate({
        id: workflowId as string,
        role
      }),
    onSuccess: invalidate
  });

  const revokeLink = useMutation({
    mutationFn: (shareId: string) =>
      trpcClient.workflows.sharing.revokeLink.mutate({
        id: workflowId as string,
        share_id: shareId
      }),
    onSuccess: invalidate
  });

  const setRole = useMutation({
    mutationFn: (opts: { userId: string; role: ShareRole }) =>
      trpcClient.workflows.sharing.setRole.mutate({
        id: workflowId as string,
        user_id: opts.userId,
        role: opts.role
      }),
    onSuccess: invalidate
  });

  const removeCollaborator = useMutation({
    mutationFn: (userId: string) =>
      trpcClient.workflows.sharing.removeCollaborator.mutate({
        id: workflowId as string,
        user_id: userId
      }),
    onSuccess: invalidate
  });

  return { query, createLink, revokeLink, setRole, removeCollaborator };
};

/** Redeem a share token; resolves to the workflow and granted role. */
export const useAcceptShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      trpcClient.workflows.sharing.accept.mutate({ token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedWithMeQueryKey });
    }
  });
};

/** Workflows shared with the current user, with their role on each. */
export const useSharedWithMe = () =>
  useQuery({
    queryKey: sharedWithMeQueryKey,
    queryFn: () => trpcClient.workflows.sharing.sharedWithMe.query({}),
    staleTime: 30 * 1000
  });

/** The current user's effective role on a workflow (read-only UI state). */
export const useMyWorkflowRole = (workflowId: string | null | undefined) =>
  useQuery({
    queryKey: workflowId
      ? myWorkflowRoleQueryKey(workflowId)
      : ["workflow", "none", "my-role"],
    queryFn: () =>
      trpcClient.workflows.sharing.myRole.query({ id: workflowId as string }),
    enabled: !!workflowId,
    staleTime: 60 * 1000
  });
