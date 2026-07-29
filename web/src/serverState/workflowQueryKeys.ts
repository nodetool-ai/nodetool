/**
 * Query keys for the paginated workflow list.
 *
 * The fetch limit must live in the key, not only in the `queryFn`: several
 * screens list workflows with different limits, and a bare `["workflows"]` key
 * makes them share one cache entry. Whichever component mounted first wins, so
 * a page asking for 1000 could be served a cached 100 and silently drop the
 * rest.
 *
 * Every key starts with `WORKFLOW_LIST_KEY_PREFIX`, so the existing
 * `invalidateQueries({ queryKey: ["workflows"] })` calls (TanStack Query
 * matches key prefixes) still invalidate all variants.
 */
export const WORKFLOW_LIST_KEY_PREFIX = "workflows" as const;

export const workflowListQueryKey = (
  limit: number,
  cursor = ""
): readonly unknown[] => [WORKFLOW_LIST_KEY_PREFIX, "list", { cursor, limit }];
