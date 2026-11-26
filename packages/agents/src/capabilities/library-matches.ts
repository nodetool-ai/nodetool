/**
 * The `query` parameter of the document list tools (D19): a thin call into the
 * library search with a fixed kind, so `list_timelines({ query })` matches
 * what `search` matches (names, descriptions, tags and the text inside) and
 * not only a substring of the name.
 */

import type { SearchKind } from "@nodetool-ai/protocol";

/** Most matches a list tool asks the index for. */
const MAX_MATCHES = 100;

/**
 * The ids of one owner's documents of one kind that match `query`, best
 * first. `projectId` narrows to one project.
 */
export async function libraryMatchIds(
  userId: string,
  kind: SearchKind,
  query: string,
  options: { limit?: number; projectId?: string } = {}
): Promise<string[]> {
  const { searchLibrary } = await import("@nodetool-ai/search-services");
  const request: Parameters<typeof searchLibrary>[0] = {
    userId,
    query,
    kinds: [kind],
    limit: Math.min(options.limit ?? MAX_MATCHES, MAX_MATCHES)
  };
  if (options.projectId) request.projectId = options.projectId;
  const result = await searchLibrary(request);
  return result.hits.map((hit) => hit.resourceId);
}

/** Load rows by id in the given order, keeping only the owner's. */
export async function ownedRowsInOrder<T extends { user_id: string }>(
  ids: readonly string[],
  userId: string,
  load: (id: string) => Promise<T | null>
): Promise<T[]> {
  const rows: T[] = [];
  for (const row of await Promise.all(ids.map((id) => load(id)))) {
    if (row !== null && row.user_id === userId) rows.push(row);
  }
  return rows;
}
