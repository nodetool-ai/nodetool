/**
 * The drafts this computer holds for the signed-in cloud account, counted
 * for the sign-out dialog (FR30, technical design, "Sign-out with waiting
 * changes"). The main window reads them from the local server. The native
 * apps' drafts are not counted: they stay on disk under the account.
 */
import type { CloudAccountState } from "../../window";
import { trpcClient } from "../../trpc/client";
import { serverKeyOf } from "./localDraftStore";

export interface DraftCounts {
  /** Changes the cloud window sends at its next save. */
  waiting: number;
  /** Changes the server refused. They stay until the person resolves them. */
  unsent: number;
}

/** The account's drafts on this computer, or null when the local server did not answer. */
export async function countCloudDrafts(account: CloudAccountState): Promise<DraftCounts | null> {
  if (!account.accountId || !account.serverOrigin) {
    return { waiting: 0, unsent: 0 };
  }
  try {
    const { drafts } = await trpcClient.cloudLocal.drafts.list.query({
      server_key: await serverKeyOf(account.serverOrigin),
      account_id: account.accountId
    });
    return {
      waiting: drafts.filter((draft) => draft.state === "waiting").length,
      unsent: drafts.filter((draft) => draft.state === "unsent").length
    };
  } catch {
    return null;
  }
}
