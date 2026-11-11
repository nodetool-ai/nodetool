/**
 * People in the user directory, as sharing sees them: names for the ids in a
 * collaborator list, and the check that someone can be invited by name.
 */
import { getUserAccounts } from "@nodetool-ai/models";

import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

export interface PersonNames {
  display_name: string | null;
  email: string | null;
}

/** Add the directory name and email to each item. Ids with no row get nulls. */
export async function withPersonNames<T extends { user_id: string }>(
  items: readonly T[]
): Promise<Array<T & PersonNames>> {
  const accounts = await getUserAccounts(items.map((item) => item.user_id));
  return items.map((item) => {
    const account = accounts.get(item.user_id);
    return {
      ...item,
      display_name: account?.displayName ?? null,
      email: account?.email ?? null
    };
  });
}

/**
 * Refuse an invite to anyone but an active directory account other than the
 * owner. Every refusal reads the same, so an invite cannot probe which ids
 * exist or are disabled.
 */
export async function requireInvitee(
  ownerId: string,
  userId: string
): Promise<void> {
  const account = (await getUserAccounts([userId])).get(userId);
  if (!account || account.status !== "active" || userId === ownerId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Person not found");
  }
}
