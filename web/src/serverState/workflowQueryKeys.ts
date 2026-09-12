/**
 * Query keys for the paginated workflow list.
 *
 * The fetch limit must live in the key, not only in the `queryFn`: several
 * screens list workflows with different limits and project scopes, and a bare
 * `["workflows"]` key makes them share one cache entry. Whichever component
 * mounted first wins, so a page asking for one project could otherwise be
 * served another project's workflows.
 *
 * Every key starts with `WORKFLOW_LIST_KEY_PREFIX`, so the existing
 * `invalidateQueries({ queryKey: ["workflows"] })` calls (TanStack Query
 * matches key prefixes) still invalidate all variants.
 */
export const WORKFLOW_LIST_KEY_PREFIX = "workflows" as const;

export const workflowListQueryKey = (
  limit: number,
  cursor = "",
  projectId?: string
): readonly unknown[] => [
  WORKFLOW_LIST_KEY_PREFIX,
  "list",
  projectId ? { cursor, limit, projectId } : { cursor, limit }
];
