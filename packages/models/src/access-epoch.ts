/**
 * Access epochs (docs/plans/native-cloud-sync/technical-design.md, "Order of
 * access changes against writes").
 *
 * The access check and the write it authorizes must not be separable by a
 * revocation. A transaction that changes access locks the epoch rows of the
 * affected documents and projects for update and increments them. A
 * transaction that accepts a write locks the rows of its document and
 * project in share mode before it checks access, and holds them until it
 * commits. A revocation therefore either commits first, and the write sees
 * it, or waits for the write, which was authorized when it committed.
 *
 * Rows are locked in one order, by kind and id, so two transactions that
 * lock several rows never wait on each other in a cycle. SQLite has a single
 * writer, so there the rows only count.
 */
import { eq, sql } from "drizzle-orm";
import { getDatabase, getPortableDb, inTransaction, withTransaction } from "./db.js";
import { accessEpochs } from "./schema/access-epochs.js";

/** A document, by its kind, or a project, by the kind `project`. */
export interface AccessKey {
  kind: string;
  id: string;
}

/** The project key of a document's project, or none when it has no project. */
export function projectAccessKey(projectId: string | null | undefined): AccessKey[] {
  return projectId ? [{ kind: "project", id: projectId }] : [];
}

function rowId(key: AccessKey): string {
  return `${key.kind}:${key.id}`;
}

function ordered(keys: readonly AccessKey[]): AccessKey[] {
  const unique = new Map<string, AccessKey>();
  for (const key of keys) unique.set(`${key.kind}\u0000${key.id}`, key);
  return [...unique.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, key]) => key);
}

/**
 * Increments the epochs of `keys`, creating rows at 1. Holds the rows locked
 * until the surrounding transaction ends, so call it first inside the
 * transaction that changes access.
 */
export async function bumpAccessEpochs(keys: readonly AccessKey[]): Promise<void> {
  const db = getPortableDb();
  for (const key of ordered(keys)) {
    await db
      .insert(accessEpochs)
      .values({ id: rowId(key), kind: key.kind, object_id: key.id, epoch: 1 })
      .onConflictDoUpdate({
        target: accessEpochs.id,
        set: { epoch: sql`${accessEpochs.epoch} + 1` }
      });
  }
}

/**
 * Locks the epochs of `keys` in share mode until the surrounding transaction
 * ends, and returns them by `kind:id`. A change of access to any of them
 * waits until then. Call it inside `withTransaction`, before the access
 * check.
 */
export async function lockAccessEpochs(keys: readonly AccessKey[]): Promise<Map<string, number>> {
  const epochs = new Map<string, number>();
  const connection = getDatabase();
  for (const key of ordered(keys)) {
    await getPortableDb()
      .insert(accessEpochs)
      .values({ id: rowId(key), kind: key.kind, object_id: key.id, epoch: 0 })
      .onConflictDoNothing();
    let epoch: number | undefined;
    if (connection.dialect === "postgres") {
      const table = connection.schema.accessEpochs;
      const [row] = await connection.db
        .select({ epoch: table.epoch })
        .from(table)
        .where(eq(table.id, rowId(key)))
        .for("share");
      epoch = row?.epoch;
    } else {
      const [row] = await getPortableDb()
        .select({ epoch: accessEpochs.epoch })
        .from(accessEpochs)
        .where(eq(accessEpochs.id, rowId(key)));
      epoch = row?.epoch;
    }
    epochs.set(rowId(key), epoch ?? 0);
  }
  return epochs;
}

/**
 * Runs a change of access: increments the epochs of `keys`, then `body`.
 * On PostgreSQL both run in one transaction, so the change waits for every
 * write that holds one of the rows in share mode. Inside a transaction that
 * is already open they join it.
 *
 * SQLite has a single writer, so no write is in progress while the change
 * runs, and the body runs without a transaction. Change bodies delete files
 * and wait on other things than the database, which a SQLite transaction
 * body must not do.
 */
export async function changingAccess<T>(keys: readonly AccessKey[], body: () => Promise<T>): Promise<T> {
  if (getDatabase().dialect === "sqlite" && !inTransaction()) {
    await bumpAccessEpochs(keys);
    return body();
  }
  return withTransaction(async () => {
    await bumpAccessEpochs(keys);
    return body();
  });
}
