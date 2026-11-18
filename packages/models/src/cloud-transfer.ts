/**
 * Rows of transfers into cloud projects and their commit attempts
 * (docs/plans/native-cloud-sync/technical-design.md, "Sending: capture,
 * stage, commit attempt", WP2.4). The commit itself is in
 * `@nodetool-ai/project-services/transfer`.
 */
import { and, asc, eq } from "drizzle-orm";
import { createTimeOrderedUuid } from "./base-model.js";
import { getDatabase, getPortableDb } from "./db.js";
import { cloudTransferAttempts, cloudTransfers } from "./schema/cloud-transfers.js";

export type CloudTransferRow = typeof cloudTransfers.$inferSelect;
export type CloudTransferAttemptRow = typeof cloudTransferAttempts.$inferSelect;
export type CloudTransferState = "open" | "committed" | "cancelled";

/**
 * Creates the transfer, or returns the one the caller already opened under
 * the id. Returns null when the id belongs to another person's transfer or
 * to a transfer into another project.
 */
export async function openCloudTransfer(input: {
  id: string;
  userId: string;
  projectId: string;
  firstPublication: boolean;
  now?: Date;
}): Promise<CloudTransferRow | null> {
  const now = (input.now ?? new Date()).toISOString();
  await getPortableDb()
    .insert(cloudTransfers)
    .values({
      id: input.id,
      user_id: input.userId,
      project_id: input.projectId,
      first_publication: input.firstPublication,
      state: "open",
      committed_attempt_id: null,
      created_at: now,
      updated_at: now
    })
    .onConflictDoNothing();
  const row = await getCloudTransfer(input.id);
  if (!row || row.user_id !== input.userId || row.project_id !== input.projectId) return null;
  return row;
}

export async function getCloudTransfer(id: string): Promise<CloudTransferRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(cloudTransfers)
    .where(eq(cloudTransfers.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Reads the transfer and, on PostgreSQL, locks its row until the surrounding
 * transaction ends, so two attempts of one transfer commit one after the
 * other. Call it inside `withTransaction`.
 */
export async function lockCloudTransfer(id: string): Promise<CloudTransferRow | null> {
  const connection = getDatabase();
  if (connection.dialect === "postgres") {
    const table = connection.schema.cloudTransfers;
    const [row] = await connection.db.select().from(table).where(eq(table.id, id)).for("update");
    return row ?? null;
  }
  return getCloudTransfer(id);
}

/**
 * On PostgreSQL, locks the row of a workflow or timeline until the
 * surrounding transaction ends, so nothing changes it between a transfer's
 * checks and its write. Does nothing on SQLite.
 */
export async function lockTransferDocumentRow(kind: "workflow" | "timeline", id: string): Promise<void> {
  const connection = getDatabase();
  if (connection.dialect !== "postgres") return;
  const table = kind === "workflow" ? connection.schema.workflows : connection.schema.timelineSequences;
  await connection.db.select({ id: table.id }).from(table).where(eq(table.id, id)).for("update");
}

export async function setCloudTransferState(
  id: string,
  state: CloudTransferState,
  committedAttemptId: string | null = null,
  now: Date = new Date()
): Promise<void> {
  await getPortableDb()
    .update(cloudTransfers)
    .set({ state, committed_attempt_id: committedAttemptId, updated_at: now.toISOString() })
    .where(eq(cloudTransfers.id, id));
}

export async function findCloudTransferAttempt(
  transferId: string,
  attemptId: string
): Promise<CloudTransferAttemptRow | null> {
  const [row] = await getPortableDb()
    .select()
    .from(cloudTransferAttempts)
    .where(
      and(
        eq(cloudTransferAttempts.transfer_id, transferId),
        eq(cloudTransferAttempts.attempt_id, attemptId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function recordCloudTransferAttempt(input: {
  transferId: string;
  attemptId: string;
  userId: string;
  digest: string;
  outcome: "committed" | "refused";
  result: unknown;
  now?: Date;
}): Promise<void> {
  await getPortableDb()
    .insert(cloudTransferAttempts)
    .values({
      id: createTimeOrderedUuid(),
      transfer_id: input.transferId,
      attempt_id: input.attemptId,
      user_id: input.userId,
      digest: input.digest,
      outcome: input.outcome,
      result: JSON.stringify(input.result),
      created_at: (input.now ?? new Date()).toISOString()
    });
}

export async function listCloudTransferAttempts(transferId: string): Promise<CloudTransferAttemptRow[]> {
  return getPortableDb()
    .select()
    .from(cloudTransferAttempts)
    .where(eq(cloudTransferAttempts.transfer_id, transferId))
    .orderBy(asc(cloudTransferAttempts.created_at), asc(cloudTransferAttempts.id));
}
