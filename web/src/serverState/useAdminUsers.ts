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
