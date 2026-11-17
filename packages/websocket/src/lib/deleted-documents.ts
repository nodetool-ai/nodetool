/**
 * The restore period of deleted documents on a production server
 * (docs/plans/native-cloud-sync/technical-design.md, WP2.2, PRD D4), and the
 * purge that the server's cleanup timer runs.
 */
import { purgeDeletedDocuments } from "@nodetool-ai/models";

/** How long the owner can restore a deleted workflow, timeline or project. */
export const DELETED_DOCUMENT_RETENTION_DAYS = 30;

const PURGE_BATCH = 500;

/**
 * Deletes every kept document past its purge time, in batches, and returns
 * how many it deleted.
 */
export async function purgeDueDeletedDocuments(now: Date = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const purged = await purgeDeletedDocuments(now, PURGE_BATCH);
    total += purged;
    if (purged < PURGE_BATCH) return total;
  }
}
