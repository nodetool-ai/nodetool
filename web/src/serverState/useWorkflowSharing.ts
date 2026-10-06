/**
 * Server state for private workflow sharing.
 *
 * The owner mints role-scoped share links (`viewer` opens and runs, `editor`
 * also modifies); anyone signed in who redeems a link becomes a collaborator.
 * A `public` link grants nothing: anyone can view the workflow through it,
 * and a signed-in user can copy it into their own workflows.
 * Backed by the `workflows.sharing.*` tRPC procedures, and by the
 * unauthenticated `GET /api/shared-workflows/:token` for the public read.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowGraph } from "@nodetool-ai/protocol";
import { trpcClient } from "../trpc/client";
import { BASE_URL } from "../stores/BASE_URL";

export type ShareRole = "viewer" | "editor" | "public";
/** The roles a collaborator can hold. A public link never makes one. */
export type CollaboratorRole = Exclude<ShareRole, "public">;

export const workflowSharingQueryKey = (workflowId: string) =>
  ["workflow", workflowId, "sharing"] as const;

export const sharedWithMeQueryKey = ["workflows", "shared-with-me"] as const;

export const publicSharedWorkflowQueryKey = (token: string) =>
  ["workflows", "public-share", token] as const;

/**
 * Build the URL a share link opens: a public link goes to the read-only view,
 * any other role to the page that redeems it into a collaborator grant.
 */
export const shareUrlForToken = (
  token: string,
  role: ShareRole = "viewer"
): string =>
  role === "public"
    ? `${window.location.origin}/view/${token}`
    : `${window.location.origin}/share/${token}`;

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
    mutationFn: (opts: { userId: string; role: CollaboratorRole }) =>
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

/** What a public link shows: the protocol's `publicSharedWorkflow` response. */
export interface PublicSharedWorkflow {
  name: string;
  description?: string | null;
  tags?: string[] | null;
  graph?: WorkflowGraph | null;
}

/**
 * A workflow behind a public link. Plain `fetch` rather than tRPC: the page
 * opens without an account, and only this REST route is exempt from auth.
 */
export const fetchPublicSharedWorkflow = async (
  token: string
): Promise<PublicSharedWorkflow> => {
  const response = await fetch(
    `${BASE_URL}/api/shared-workflows/${encodeURIComponent(token)}`
  );
  if (!response.ok) {
    throw new Error("This workflow is not available");
  }
  return (await response.json()) as PublicSharedWorkflow;
};

export const usePublicSharedWorkflow = (token: string | undefined) =>
  useQuery({
    queryKey: publicSharedWorkflowQueryKey(token ?? ""),
    queryFn: () => fetchPublicSharedWorkflow(token as string),
    enabled: !!token,
    staleTime: 30 * 1000,
    retry: false
  });

/** Copy a publicly linked workflow into the caller's own workflows. */
export const useDuplicateSharedWorkflow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      trpcClient.workflows.sharing.duplicatePublic.mutate({ token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    }
  });
};
