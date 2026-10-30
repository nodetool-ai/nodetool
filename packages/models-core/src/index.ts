export { SQLITE_CORE_BASELINE_SQL, JOB_TRACE_MARKER_DDL, ASSET_FAVORITE_DDL } from "./sqlite-baseline.js";
export { workflows } from "./schema/workflows.js";
export { assets } from "./schema/assets.js";
export { jobs } from "./schema/jobs.js";
export { secrets } from "./schema/secrets.js";

export type ResourceKind = "workflows" | "assets" | "jobs" | "secrets";
export interface ResourceDocument extends Record<string, unknown> {
  readonly id: string;
  readonly user_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}
export interface Repository {
  put(kind: ResourceKind, userId: string, document: Record<string, unknown> & { id?: string }): Promise<ResourceDocument>;
  get(kind: ResourceKind, userId: string, id: string): Promise<ResourceDocument | null>;
  list(kind: ResourceKind, userId: string): Promise<ResourceDocument[]>;
  delete(kind: ResourceKind, userId: string, id: string): Promise<boolean>;
  close(): void | Promise<void>;
}
export class AmbiguousResourceIdError extends Error {
  readonly code = "AMBIGUOUS_RESOURCE_ID";
  constructor(id: string) {
    super(`Resource ID ${id} is ambiguous`);
    this.name = "AmbiguousResourceIdError";
  }
}
/** Resolve agent-visible prefixes only within the already authorized records. */
export function resolveResourceId(records: readonly ResourceDocument[], id: string): ResourceDocument | null {
  const exact = records.find((record) => record.id === id);
  if (exact) { return exact; }
  if (!/^[0-9a-f]{12}$/.test(id)) { return null; }
  const matches = records.filter((record) => /^[0-9a-f]{32}$/.test(record.id) && record.id.startsWith(id));
  if (matches.length > 1) { throw new AmbiguousResourceIdError(id); }
  return matches[0] ?? null;
}
export { workflows as postgresWorkflows } from "./schema-pg/workflows.js";
export { assets as postgresAssets } from "./schema-pg/assets.js";
export { jobs as postgresJobs } from "./schema-pg/jobs.js";
export { secrets as postgresSecrets } from "./schema-pg/secrets.js";
