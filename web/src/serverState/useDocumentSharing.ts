/**
 * Server state for sharing project documents other than workflows:
 * storyboards, scripts, timelines, sketches, apps and JS scripts.
 *
 * Same model as workflow sharing (`useWorkflowSharing`): the owner mints
 * role-scoped links, and anyone signed in who redeems one becomes a
 * collaborator. There is no public link for these kinds. Backed by the
 * `documentSharing.*` tRPC procedures.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { documentSharing } from "@nodetool-ai/protocol/api-schemas";
import { trpcClient } from "../trpc/client";
import type { CollaboratorRole } from "./useWorkflowSharing";

export type SharedDocumentType = documentSharing.SharedDocumentTypeValue;

export const SHARED_DOCUMENT_TYPES: readonly SharedDocumentType[] = [
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript"
];

export const isSharedDocumentType = (
  value: string
): value is SharedDocumentType =>
  (SHARED_DOCUMENT_TYPES as readonly string[]).includes(value);

export interface SharedDocumentTarget {
  type: SharedDocumentType;
  id: string;
}

export const documentSharingQueryKey = (target: SharedDocumentTarget) =>
  ["documents", target.type, target.id, "sharing"] as const;

export const documentsSharedWithMeQueryKey = [
  "documents",
  "shared-with-me"
] as const;

/** The URL a document share link opens: the page that redeems it. */
export const documentShareUrlForToken = (token: string): string =>
  `${window.location.origin}/share/document/${token}`;

/** Collaborators and links, for the owner's share dialog. */
export const useDocumentSharing = (
  target: SharedDocumentTarget | null
) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: target
      ? documentSharingQueryKey(target)
      : ["documents", "none", "sharing"],
    queryFn: () =>
      trpcClient.documentSharing.get.query(target as SharedDocumentTarget),
    enabled: target !== null,
    staleTime: 10 * 1000
  });

  const invalidate = () => {
    if (target) {
      queryClient.invalidateQueries({
        queryKey: documentSharingQueryKey(target)
      });
    }
  };

  const ref = () => target as SharedDocumentTarget;

  const createLink = useMutation({
    mutationFn: (role: CollaboratorRole) =>
      trpcClient.documentSharing.createLink.mutate({ ...ref(), role }),
    onSuccess: invalidate
  });

  const revokeLink = useMutation({
    mutationFn: (shareId: string) =>
      trpcClient.documentSharing.revokeLink.mutate({
        ...ref(),
        share_id: shareId
      }),
    onSuccess: invalidate
  });

  const setRole = useMutation({
    mutationFn: (opts: { userId: string; role: CollaboratorRole }) =>
      trpcClient.documentSharing.setRole.mutate({
        ...ref(),
        user_id: opts.userId,
        role: opts.role
      }),
    onSuccess: invalidate
  });

  const removeCollaborator = useMutation({
    mutationFn: (userId: string) =>
      trpcClient.documentSharing.removeCollaborator.mutate({
        ...ref(),
        user_id: userId
      }),
    onSuccess: invalidate
  });

  return { query, createLink, revokeLink, setRole, removeCollaborator };
};

/** Redeem a document share token; resolves to the document and the role. */
export const useAcceptDocumentShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      trpcClient.documentSharing.accept.mutate({ token }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: documentsSharedWithMeQueryKey
      });
    }
  });
};

/** Documents shared with the current user, with their role on each. */
export const useDocumentsSharedWithMe = () =>
  useQuery({
    queryKey: documentsSharedWithMeQueryKey,
    queryFn: () => trpcClient.documentSharing.sharedWithMe.query(),
    staleTime: 30 * 1000
  });
