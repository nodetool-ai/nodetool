/**
 * Server state for the admin area: whether the caller is an admin, and the
 * user directory of a self-hosted SSO server. Backed by the `admin.*` tRPC
 * procedures, which check admin rights on the server.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { admin } from "@nodetool-ai/protocol/api-schemas";
import { isSsoMode } from "../lib/runtimeConfig";
import { trpcClient } from "../trpc/client";

export type AdminUser = admin.AdminUser;
export type AdminUserStatus = admin.AdminUserStatus;
export type AdminUserRole = admin.AdminUserRole;

export interface AdminUsersFilter {
  query: string;
  status: AdminUserStatus | "all";
  offset: number;
  limit: number;
}

export const adminMeQueryKey = ["admin", "me"] as const;
export const adminUsersQueryKey = ["admin", "users"] as const;

export type AdminStatus = "loading" | "admin" | "denied";

/**
 * Whether the signed-in user is an admin of an SSO server. The directory
 * only exists in SSO mode, so other modes never ask and read as denied.
 */
export const useIsAdminStatus = (): AdminStatus => {
  const enabled = isSsoMode();
  const query = useQuery({
    queryKey: adminMeQueryKey,
    queryFn: () => trpcClient.admin.me.query(),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  if (!enabled) return "denied";
  if (query.isLoading) return "loading";
  return query.data?.is_admin === true ? "admin" : "denied";
};

/** True when the signed-in user is an admin of an SSO server. */
export const useIsAdmin = (): boolean => useIsAdminStatus() === "admin";

/** One page of the user directory. */
export const useAdminUsers = (filter: AdminUsersFilter) =>
  useQuery({
    queryKey: [...adminUsersQueryKey, filter],
    queryFn: () =>
      trpcClient.admin.users.list.query({
        query: filter.query.trim() || undefined,
        status: filter.status === "all" ? undefined : filter.status,
        limit: filter.limit,
        offset: filter.offset
      }),
    placeholderData: (previous) => previous,
    staleTime: 10 * 1000
  });

export interface AdminUserChange {
  userId: string;
  role?: AdminUserRole;
  status?: AdminUserStatus;
}

/** Change one account's role or status, then refresh the directory. */
export const useUpdateAdminUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: AdminUserChange) =>
      trpcClient.admin.users.update.mutate({
        user_id: change.userId,
        role: change.role,
        status: change.status
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminUsersQueryKey })
  });
};

export type AdminQuotaLimits = admin.AdminQuotaLimits;
export type AdminUserQuota = admin.AdminUserQuota;
export type AdminDefaultQuota = admin.AdminDefaultQuotaOutput;

export const adminDefaultQuotaQueryKey = ["admin", "quotas", "default"] as const;

/** The limits every user gets unless an admin set their own. */
export const useAdminDefaultQuota = () =>
  useQuery({
    queryKey: adminDefaultQuotaQueryKey,
    queryFn: () => trpcClient.admin.quotas.getDefault.query(),
    staleTime: 10 * 1000
  });

/** Change the default limits, then refresh them and the directory. */
export const useSetDefaultQuota = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (limits: AdminQuotaLimits) =>
      trpcClient.admin.quotas.setDefault.mutate(limits),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminDefaultQuotaQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminUsersQueryKey })
      ])
  });
};

export interface UserQuotaChange {
  userId: string;
  /** Limits of the user's own, or null to put them back on the default. */
  limits: AdminQuotaLimits | null;
}

/** Give one user limits of their own, or clear them. */
export const useSetUserQuota = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, limits }: UserQuotaChange) =>
      limits
        ? trpcClient.admin.quotas.setUser.mutate({ user_id: userId, ...limits })
        : trpcClient.admin.quotas.clearUser.mutate({ user_id: userId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminUsersQueryKey })
  });
};

export type AdminPermissionFlag = admin.AdminPermissionFlag;
export type AdminPermissionOverrides = admin.AdminPermissionOverrides;
export type AdminUserPermissions = admin.AdminUserPermissions;

/** In the order the permissions dialog lists them. */
export const ADMIN_PERMISSION_FLAGS: readonly AdminPermissionFlag[] = [
  "use_llm",
  "generate_media",
  "use_server_keys",
  "manage_own_keys",
  "share_links",
  "share_public",
  "publish_apps",
  "install_packs"
];

export const adminDefaultPermissionsQueryKey = [
  "admin",
  "permissions",
  "default"
] as const;

/** The flags every user gets unless an admin set one for them. */
export const useAdminDefaultPermissions = () =>
  useQuery({
    queryKey: adminDefaultPermissionsQueryKey,
    queryFn: () => trpcClient.admin.permissions.getDefault.query(),
    staleTime: 10 * 1000
  });

export interface PermissionsChange {
  /** One user, or null for the default. */
  userId: string | null;
  /** Replaces the flags set at that level. */
  overrides: AdminPermissionOverrides;
}

/** Set the default flags or one user's, then refresh both views. */
export const useSetPermissions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, overrides }: PermissionsChange) =>
      userId === null
        ? trpcClient.admin.permissions.setDefault.mutate({ overrides })
        : trpcClient.admin.permissions.setUser.mutate({
            user_id: userId,
            overrides
          }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminDefaultPermissionsQueryKey
        }),
        queryClient.invalidateQueries({ queryKey: adminUsersQueryKey })
      ])
  });
};

export type AdminSharingForUser = admin.AdminSharingForUserOutput;
export type AdminShareLink = admin.AdminShareLink;
export type AdminShareGrant = admin.AdminShareGrant;
export type AdminSharedDocument = admin.AdminSharedDocument;
export type AdminSharedDocumentType = admin.AdminSharedDocumentType;

export const adminUserSharingQueryKey = (userId: string) =>
  ["admin", "sharing", userId] as const;

/** What one person shares and what is shared with them. */
export const useAdminUserSharing = (userId: string | null) =>
  useQuery({
    queryKey: adminUserSharingQueryKey(userId ?? ""),
    queryFn: () =>
      trpcClient.admin.sharing.forUser.query({ user_id: userId as string }),
    enabled: userId !== null
  });

export type AdminSharingAction =
  | { kind: "revokeLink"; type: AdminSharedDocumentType; shareId: string }
  | {
      kind: "removeGrant";
      type: AdminSharedDocumentType;
      documentId: string;
      userId: string;
    }
  | { kind: "makePrivate"; workflowId: string };

/** Take back a link, a grant or a public workflow, then refresh every view. */
export const useAdminSharingAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: AdminSharingAction) => {
      switch (action.kind) {
        case "revokeLink":
          return trpcClient.admin.sharing.revokeLink.mutate({
            type: action.type,
            share_id: action.shareId
          });
        case "removeGrant":
          return trpcClient.admin.sharing.removeGrant.mutate({
            type: action.type,
            document_id: action.documentId,
            user_id: action.userId
          });
        case "makePrivate":
          return trpcClient.admin.sharing.makePrivate.mutate({
            workflow_id: action.workflowId
          });
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "sharing"] })
  });
};
