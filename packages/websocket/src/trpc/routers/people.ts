/**
 * People router — find someone to share with by name.
 *
 * Procedures:
 *   search (query) — active directory accounts whose name or email matches
 *
 * Needs the `share_links` permission, since its only use is inviting. Reads
 * the user directory, so it finds people only on an SSO server.
 */

import { listUserAccounts } from "@nodetool-ai/models";
import {
  peopleSearchInput,
  peopleSearchOutput
} from "@nodetool-ai/protocol/api-schemas/people.js";

import { requirePermission } from "../../lib/permissions.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

/** Few enough to pick from in a menu. */
const SEARCH_LIMIT = 8;

export const peopleRouter = router({
  search: protectedProcedure
    .input(peopleSearchInput)
    .output(peopleSearchOutput)
    .query(async ({ ctx, input }) => {
      await requirePermission(ctx.userId, "share_links");
      // One extra row, so leaving out the caller still fills the menu.
      const { accounts } = await listUserAccounts({
        query: input.query,
        status: "active",
        limit: SEARCH_LIMIT + 1
      });
      return {
        people: accounts
          .filter((account) => account.userId !== ctx.userId)
          .slice(0, SEARCH_LIMIT)
          .map((account) => ({
            user_id: account.userId,
            display_name: account.displayName,
            email: account.email
          }))
      };
    })
});
