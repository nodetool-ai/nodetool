/**
 * Admin router — the user directory of a self-hosted server.
 *
 * Procedures:
 *   me            (query)    — whether the caller is an admin (any user)
 *   users.list    (query)    — search and page the directory (admin)
 *   users.get     (query)    — one account (admin)
 *   users.update  (mutation) — set role or status (admin)
 *
 * Disabling an account takes effect on this process at once: the cached
 * status is dropped and the user's open WebSockets are closed. Other replicas
 * follow within `ACCOUNT_STATUS_TTL_MS`. An admin cannot disable or demote
 * themselves, so a server cannot lose its last admin from the UI.
 */

import {
  getUserAccount,
  listUserAccounts,
  updateUserAccount,
  type UserAccount
} from "@nodetool-ai/models";
import {
  adminMeOutput,
  adminUser,
  adminUserRef,
  adminUsersListInput,
  adminUsersListOutput,
  adminUsersUpdateInput,
  type AdminUser
} from "@nodetool-ai/protocol/api-schemas/admin.js";
import { ApiErrorCode } from "../../error-codes.js";
import { isAdmin } from "../../lib/admin.js";
import {
  closeUserSockets,
  forgetAccountStatus
} from "../../lib/user-directory.js";
import { throwApiError } from "../error-formatter.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

async function requireAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) {
    throwApiError(ApiErrorCode.FORBIDDEN, "Admin access required");
  }
}

async function toAdminUser(account: UserAccount): Promise<AdminUser> {
  return {
    user_id: account.userId,
    email: account.email,
    display_name: account.displayName,
    auth_source: account.authSource,
    groups: account.groups,
    role: account.role,
    is_admin: await isAdmin(account.userId),
    status: account.status,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
    last_sign_in_at: account.lastSignInAt,
    last_seen_at: account.lastSeenAt
  };
}

export const adminRouter = router({
  me: protectedProcedure.output(adminMeOutput).query(async ({ ctx }) => ({
    is_admin: await isAdmin(ctx.userId)
  })),

  users: router({
    list: protectedProcedure
      .input(adminUsersListInput)
      .output(adminUsersListOutput)
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const page = await listUserAccounts({
          query: input.query,
          status: input.status,
          role: input.role,
          limit: input.limit,
          offset: input.offset
        });
        return {
          users: await Promise.all(page.accounts.map(toAdminUser)),
          total: page.total
        };
      }),

    get: protectedProcedure
      .input(adminUserRef)
      .output(adminUser)
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const account = await getUserAccount(input.user_id);
        if (!account) throwApiError(ApiErrorCode.NOT_FOUND, "User not found");
        return toAdminUser(account);
      }),

    update: protectedProcedure
      .input(adminUsersUpdateInput)
      .output(adminUser)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        if (input.user_id === ctx.userId) {
          if (input.status === "disabled") {
            throwApiError(
              ApiErrorCode.INVALID_INPUT,
              "You cannot disable your own account."
            );
          }
          if (input.role === "member") {
            throwApiError(
              ApiErrorCode.INVALID_INPUT,
              "You cannot remove your own admin role."
            );
          }
        }
        const account = await updateUserAccount(input.user_id, {
          role: input.role,
          status: input.status
        });
        if (!account) throwApiError(ApiErrorCode.NOT_FOUND, "User not found");
        forgetAccountStatus(account.userId);
        if (account.status === "disabled") closeUserSockets(account.userId);
        return toAdminUser(account);
      })
  })
});
