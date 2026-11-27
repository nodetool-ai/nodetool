/**
 * Named leases shared by the library indexer processes. A lease is held by
 * one owner until it releases it or the lease expires, so a process that
 * crashed while holding one blocks the others only until then.
 */

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getPortableDb, searchItems, searchLeases } from "@nodetool-ai/models";

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

/**
 * Claim items with the item lease the extractor uses, so two indexers never
 * embed or enrich, and pay for, the same item. Returns the lease version won
 * for each claimed item; an item another process holds is left out.
 */
export async function claimItems(
  itemIds: readonly string[],
  owner: string,
  ttlMs: number,
  now = new Date()
): Promise<Map<string, number>> {
  const db = getPortableDb();
  const at = now.toISOString();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  const won = new Map<string, number>();
  for (const id of itemIds) {
    const rows = await db
      .update(searchItems)
      .set({
        lease_owner: owner,
        lease_expires_at: expires,
        lease_version: sql`${searchItems.lease_version} + 1`
      })
      .where(
        and(
          eq(searchItems.id, id),
          or(isNull(searchItems.lease_expires_at), lt(searchItems.lease_expires_at, at))
        )
      )
      .returning({ id: searchItems.id, version: searchItems.lease_version });
    if (rows[0]) won.set(rows[0].id, rows[0].version);
  }
  return won;
}

/** Release claims from {@link claimItems} that were not taken over since. */
export async function releaseItemClaims(claims: ReadonlyMap<string, number>): Promise<void> {
  const db = getPortableDb();
  for (const [id, version] of claims) {
    await db
      .update(searchItems)
      .set({ lease_owner: null, lease_expires_at: null })
      .where(and(eq(searchItems.id, id), eq(searchItems.lease_version, version)));
  }
}

/** The condition that no process holds an item's lease. */
export function itemUnclaimed(now = new Date()) {
  return or(isNull(searchItems.lease_expires_at), lt(searchItems.lease_expires_at, now.toISOString()));
}
