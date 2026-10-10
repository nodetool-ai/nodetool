/**
 * Users router — migrated from REST `/api/users*`.
 *
 * All procedures require the caller to be an admin (see `isAdmin`). Issuing
 * a token (create / resetToken) is refused in Supabase mode, where API user
 * tokens do not authenticate.
 * The response shapes differ by operation:
 *   • list / get return `token_hash` (masked).
 *   • create / resetToken return plaintext `token` (shown once on creation).
 */

import { FileUserManager } from "@nodetool-ai/auth";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listOutput,
  createInput,
  userCreateResponse,
  removeInput,
  removeOutput,
  resetTokenInput,
  type UserListItem
} from "@nodetool-ai/protocol/api-schemas/users.js";

/** Manager singleton — matches legacy behaviour (module-scoped instance). */
const manager = new FileUserManager();

/**
 * Check if a user ID has admin privileges: user "1" (the Local-mode user),
 * an id in the comma-separated `ADMIN_USER_IDS`, or an API user created with
 * the admin role.
 */
async function isAdmin(userId: string): Promise<boolean> {
  if (userId === "1") return true;
  const adminIds = process.env.ADMIN_USER_IDS;
  if (
    adminIds
      ?.split(",")
      .map((s) => s.trim())
      .includes(userId)
  ) {
    return true;
  }
  return (await manager.getUserById(userId))?.role === "admin";
}

/** Guard: throws FORBIDDEN if caller is not an admin. */
async function requireAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) {
    throwApiError(ApiErrorCode.FORBIDDEN, "Admin access required");
  }
}

/**
 * API user tokens authenticate only in Local mode (see the auth hook in
 * server.ts). In Supabase mode a token issued here would never work, so
 * refuse to issue one.
 */
function requireLocalMode(): void {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      "API users are only supported in Local mode. With Supabase auth, " +
        "create the user in Supabase or have them mint an access token in the app."
    );
  }
}

/** Build a list-item response from a FileUserManager UserRecord. */
function toUserListItem(
  username: string,
  record: { id: string; role: string; tokenHash: string; createdAt: string }
): UserListItem {
  return {
    username,
    user_id: record.id,
    role: record.role,
    token_hash: record.tokenHash.slice(0, 16) + "...",
    created_at: record.createdAt
  };
}

export const usersRouter = router({
  list: protectedProcedure.output(listOutput).query(async ({ ctx }) => {
    await requireAdmin(ctx.userId);
    const users = await manager.listUsers();
    return {
      users: Object.entries(users).map(([username, rec]) =>
        toUserListItem(username, rec)
      )
    };
  }),

  create: protectedProcedure
    .input(createInput)
    .output(userCreateResponse)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      requireLocalMode();
      try {
        const result = await manager.addUser(input.username, input.role);
        return {
          username: result.username,
          user_id: result.userId,
          role: result.role,
          token: result.token,
          created_at: result.createdAt
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bad request";
        throwApiError(ApiErrorCode.INVALID_INPUT, msg);
      }
    }),

  remove: protectedProcedure
    .input(removeInput)
    .output(removeOutput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      try {
        await manager.removeUser(input.username);
        return { message: `User '${input.username}' removed successfully` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Not found";
        throwApiError(ApiErrorCode.NOT_FOUND, msg);
      }
    }),

  resetToken: protectedProcedure
    .input(resetTokenInput)
    .output(userCreateResponse)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      requireLocalMode();
      try {
        const result = await manager.resetToken(input.username);
        return {
          username: result.username,
          user_id: result.userId,
          role: result.role,
          token: result.token,
          created_at: result.createdAt
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Not found";
        throwApiError(ApiErrorCode.NOT_FOUND, msg);
      }
    })
});
