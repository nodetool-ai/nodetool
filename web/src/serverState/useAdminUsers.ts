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
