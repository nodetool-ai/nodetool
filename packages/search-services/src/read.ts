/**
 * Read passages from the index (D17 `search_read`): the passage at a locator
 * and its neighbours, without extracting the file again.
 */

import { and, eq, like, or } from "drizzle-orm";
import { getPortableDb, searchChunks, searchItems } from "@nodetool-ai/models";
import { isShortResourceId, type SearchField, type SearchKind } from "@nodetool-ai/protocol";
import { METADATA_FIELDS } from "./index-writer.js";

export interface LibraryReadRequest {
  userId: string;
  /** The item's resource id (an asset or document id), or its item id. Full or a 12-character prefix. */
  id: string;
  /**
   * Where to read. Every key must match the passage's locator, such as
   * `{ page: 4 }` or `{ node_id: "…" }`. A `start` offset matches the passage
   * whose range holds it. Omitted reads from the first passage.
   */
  locator?: Record<string, unknown>;
  /** Passages before the matched one. Default 1, at most 10. */
  before?: number;
  /** Passages after the matched one. Default 1, at most 10. */
  after?: number;
}

export interface LibraryPassage {
  ordinal: number;
  field: SearchField;
  text: string;
  locator: Record<string, unknown> | null;
}

export type LibraryReadResult =
  | {
      ok: true;
      item: { itemId: string; resourceType: string; resourceId: string; kind: SearchKind; title: string; state: string };
      /** The passages read, in document order. */
      passages: LibraryPassage[];
      /** Index of the matched passage in `passages`. */
      matched: number;
      /** Body passages the item has in all. */
      total: number;
    }
  | { ok: false; error: string };

function clampCount(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 1), 0), 10);
}

function locatorMatches(want: Record<string, unknown>, have: Record<string, unknown> | null): boolean {
  if (!have) return false;
  for (const [key, value] of Object.entries(want)) {
    if (key === "start" && typeof value === "number") {
      const start = have.start;
      const end = have.end;
      if (typeof start !== "number" || typeof end !== "number" || value < start || value >= end) {
        return false;
      }
      continue;
    }
    if (JSON.stringify(have[key]) !== JSON.stringify(value)) return false;
  }
  return true;
}

/** One lookup of {@link findLibraryItem}: the row when found, or why the id was ambiguous. */
export interface LibraryItemLookup {
  row?: typeof searchItems.$inferSelect;
  error?: string;
}

/** An owner's item by item id or resource id, full or as an exact 12-character prefix. */
export async function findLibraryItem(userId: string, id: string): Promise<LibraryItemLookup> {
  const db = getPortableDb();
  const owner = eq(searchItems.user_id, userId);
  if (isShortResourceId(id)) {
    const rows = await db
      .select()
      .from(searchItems)
      .where(and(owner, or(like(searchItems.resource_id, `${id}%`), like(searchItems.id, `${id}%`))))
      .limit(2);
    if (rows.length > 1) return { error: `The id ${id} matches more than one item. Pass the full id.` };
    return { row: rows[0] };
  }
  const [row] = await db
    .select()
    .from(searchItems)
    .where(and(owner, or(eq(searchItems.resource_id, id), eq(searchItems.id, id))))
    .limit(1);
  return { row };
}

/** Read the passage at a locator of one item and its neighbours. */
export async function readLibraryPassage(request: LibraryReadRequest): Promise<LibraryReadResult> {
  const found = await findLibraryItem(request.userId, request.id);
  if ("error" in found && found.error) return { ok: false, error: found.error };
  const item = found.row;
  if (!item || item.state === "excluded") {
    return { ok: false, error: `No library item ${request.id}.` };
  }
  const chunks = await getPortableDb()
    .select()
    .from(searchChunks)
    .where(eq(searchChunks.item_id, item.id));
  const body = chunks
    .filter((chunk) => !(METADATA_FIELDS as readonly string[]).includes(chunk.field))
    .sort((a, b) => a.ordinal - b.ordinal);
  // An item with no extracted content reads as its metadata passages.
  const passages = (body.length > 0 ? body : chunks.sort((a, b) => a.ordinal - b.ordinal)).map(
    (chunk): LibraryPassage => ({
      ordinal: chunk.ordinal,
      field: chunk.field as SearchField,
      text: chunk.text,
      locator: chunk.locator ?? null
    })
  );
  if (passages.length === 0) return { ok: false, error: `${item.title} has no indexed text.` };

  let index = 0;
  if (request.locator && Object.keys(request.locator).length > 0) {
    index = passages.findIndex((passage) => locatorMatches(request.locator!, passage.locator));
    if (index < 0) {
      return { ok: false, error: `No passage of ${item.title} matches ${JSON.stringify(request.locator)}.` };
    }
  }
  const from = Math.max(0, index - clampCount(request.before));
  const to = Math.min(passages.length, index + clampCount(request.after) + 1);
  return {
    ok: true,
    item: {
      itemId: item.id,
      resourceType: item.resource_type,
      resourceId: item.resource_id,
      kind: item.kind as SearchKind,
      title: item.title,
      state: item.state
    },
    passages: passages.slice(from, to),
    matched: index - from,
    total: body.length
  };
}
