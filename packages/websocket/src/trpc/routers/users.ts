/**
 * Users router — migrated from REST `/api/users*`.
 *
 * All procedures require the caller to be an admin (userId === "1" in dev,
 * or listed in the comma-separated `ADMIN_USER_IDS` env var in production).
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
  getInput,
  userListItem,
  createInput,
  userCreateResponse,
  removeInput,
  removeOutput,
  resetTokenInput,
  type UserListItem
} from "@nodetool-ai/protocol/api-schemas/users.js";

/**
 * Check if a user ID has admin privileges. Mirrors `isAdmin` from the
 * legacy users-api.ts: user "1" is always admin in dev, and
 * `ADMIN_USER_IDS` (comma-separated) grants admin in production.
 */
function isAdmin(userId: string): boolean {
  if (userId === "1") return true;
  const adminIds = process.env.ADMIN_USER_IDS;
  if (adminIds) {
    return adminIds
      .split(",")
      .map((s) => s.trim())
      .includes(userId);
  }
  return false;
}

/** Guard: throws FORBIDDEN if caller is not an admin. */
function requireAdmin(userId: string): void {
  if (!isAdmin(userId)) {
    throwApiError(ApiErrorCode.FORBIDDEN, "Admin access required");
  }
}

/** Manager singleton — matches legacy behaviour (module-scoped instance). */
const manager = new FileUserManager();

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
    requireAdmin(ctx.userId);
    const users = await manager.listUsers();
    return {
      users: Object.entries(users).map(([username, rec]) =>
        toUserListItem(username, rec)
      )
    };
  }),

  get: protectedProcedure
    .input(getInput)
    .output(userListItem)
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.userId);
      const user = await manager.getUser(input.username);
      if (!user) {
        throwApiError(
          ApiErrorCode.NOT_FOUND,
          `User '${input.username}' not found`
        );
      }
      return toUserListItem(input.username, user);
    }),

  create: protectedProcedure
    .input(createInput)
    .output(userCreateResponse)
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.userId);
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
      requireAdmin(ctx.userId);
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
      requireAdmin(ctx.userId);
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
