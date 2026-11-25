/**
 * Named leases shared by the library indexer processes. A lease is held by
 * one owner until it releases it or the lease expires, so a process that
 * crashed while holding one blocks the others only until then.
 */

import { and, eq, lt, or } from "drizzle-orm";
import { getPortableDb, searchLeases } from "@nodetool-ai/models";

/** Take `name` for `owner` for `ttlMs`, or renew it. False when another owner holds it. */
export async function acquireSearchLease(
  name: string,
  owner: string,
  ttlMs: number,
  now = new Date()
): Promise<boolean> {
  const db = getPortableDb();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  const inserted = await db
    .insert(searchLeases)
    .values({ name, owner, expires_at: expires })
    .onConflictDoNothing()
    .returning({ name: searchLeases.name });
  if (inserted.length > 0) return true;
  const taken = await db
    .update(searchLeases)
    .set({ owner, expires_at: expires })
    .where(
      and(
        eq(searchLeases.name, name),
        or(eq(searchLeases.owner, owner), lt(searchLeases.expires_at, now.toISOString()))
      )
    )
    .returning({ name: searchLeases.name });
  return taken.length > 0;
}

/** Give up `name` if `owner` still holds it. */
export async function releaseSearchLease(name: string, owner: string): Promise<void> {
  await getPortableDb()
    .delete(searchLeases)
    .where(and(eq(searchLeases.name, name), eq(searchLeases.owner, owner)));
}
