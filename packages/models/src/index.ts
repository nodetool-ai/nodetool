/**
 * @nodetool-ai/models – Database models and query utilities.
 *
 * Public API surface for the models package. Re-exports everything
 * consumers need to define, query and persist data models.
 */

// ── Database Connection ─────────────────────────────────────────────
export {
  initDb,
  initPostgresDb,
  initTestDb,
  getDb,
  getDbType,
  getRawDb,
  closeDb
} from "./db.js";
export type { DbDialect } from "./db.js";

// ── Drizzle Schema (SQLite — default) ──────────────────────────────
export {
  workflows,
  jobs,
  messages,
  threads,
  assets,
  secrets,
  workspaces,
  workflowVersions,
  oauthCredentials,
  runNodeState,
  predictions,
  runEvents,
  runLeases,
  teamTasks,
  appSettings
} from "./schema/index.js";

// ── Drizzle Schema (PostgreSQL) ─────────────────────────────────────
export * as pgSchema from "./schema-pg/index.js";

// ── Base Model ───────────────────────────────────────────────────────
export {
  DBModel,
  ModelObserver,
  ModelChangeEvent,
  createTimeOrderedUuid,
  computeEtag
} from "./base-model.js";
export type { ModelObserverCallback, DrizzleTable } from "./base-model.js";

// ── Domain Models ────────────────────────────────────────────────────
export { Job } from "./job.js";
export type { JobStatus } from "./job.js";

export { Workflow } from "./workflow.js";
export type { AccessLevel, WorkflowGraph } from "./workflow.js";

export { WorkflowVersion } from "./workflow-version.js";

export { Asset } from "./asset.js";

export { Message } from "./message.js";

export { Thread } from "./thread.js";

export { Secret } from "./secret.js";
export {
  getSecret,
  getSecretRequired,
  hasSecret,
  getSecretSync,
  clearSecretCache,
  clearAllSecretCache
} from "./secret-helper.js";

export { Setting } from "./setting.js";

export { OAuthCredential } from "./oauth-credential.js";

export { Prediction } from "./prediction.js";
export type {
  AggregateResult,
  ProviderAggregateResult,
  ModelAggregateResult
} from "./prediction.js";

export { Workspace } from "./workspace.js";

export { RunNodeState } from "./run-node-state.js";
export type { NodeStatus } from "./run-node-state.js";

export { RunEvent } from "./run-event.js";
export type { EventType } from "./run-event.js";

export { RunLease } from "./run-lease.js";

// ── API Graph ───────────────────────────────────────────────────────
export {
  toApiNode,
  toApiEdge,
  toApiGraph,
  removeConnectedSlots
} from "./api-graph.js";
export type { ApiNode, ApiEdge, ApiGraph } from "./api-graph.js";

// ── Migrations (transition period — will be removed) ────────────────
export {
  MigrationError,
  LockError,
  ChecksumError,
  BaselineError,
  MigrationDiscoveryError,
  RollbackError,
  DatabaseState,
  APPLICATION_TABLES,
  MIGRATION_TRACKING_TABLE,
  MIGRATION_LOCK_TABLE,
  detectDatabaseState,
  SQLiteMigrationAdapter,
  PostgresMigrationAdapter,
  PostgresJsMigrationAdapter,
  migrations,
  MigrationRunner
} from "./migrations/index.js";
export type {
  MigrationDBAdapter,
  SqlParams,
  Row as MigrationRow,
  MigrationDef,
  Migration,
  AppliedMigration,
  MigrationStatus
} from "./migrations/index.js";

// ── Legacy Compatibility (deprecated — will be removed) ─────────────
// These re-exports allow existing consumer code to keep compiling during
// the transition. They are no-ops or thin wrappers.
export { MemoryAdapterFactory, MemoryAdapter } from "./memory-adapter.js";
export { SQLiteAdapter, SQLiteAdapterFactory } from "./sqlite-adapter.js";
export type {
  DatabaseAdapter,
  TableSchema,
  FieldDef,
  IndexDef,
  Row
} from "./database-adapter.js";
export {
  Operator,
  LogicalOperator,
  Variable,
  Condition,
  ConditionGroup,
  Field,
  ConditionBuilder,
  field
} from "./condition-builder.js";
export type { ConditionValue } from "./condition-builder.js";

// Legacy adapter resolver — now a no-op since models use getDb() directly.
// Kept for API compatibility during transition.
let _legacyResolver: ((schema: unknown) => unknown) | null = null;
export function setGlobalAdapterResolver(
  resolver: (schema: unknown) => unknown
): void {
  _legacyResolver = resolver;
}
export function getGlobalAdapterResolver():
  | ((schema: unknown) => unknown)
  | null {
  return _legacyResolver;
}

// Legacy types kept for API compat
export type { IndexSpec } from "./legacy-compat.js";
export type { ModelClass, AdapterResolver } from "./legacy-compat.js";
