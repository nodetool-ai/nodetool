/**
 * Database migration system for NodeTool.
 *
 * Port of Python's `nodetool.migrations` package.
 * Supports both SQLite and PostgreSQL/Supabase backends.
 */

export {
  MigrationError,
  LockError,
  ChecksumError,
  BaselineError,
  MigrationDiscoveryError,
  RollbackError
} from "./exceptions.js";

export {
  DatabaseState,
  APPLICATION_TABLES,
  MIGRATION_TRACKING_TABLE,
  MIGRATION_LOCK_TABLE,
  detectDatabaseState
} from "./state.js";

export type { MigrationDBAdapter, SqlParams, Row } from "./db-adapter.js";
export {
  SQLiteMigrationAdapter,
  PostgresMigrationAdapter
} from "./db-adapter.js";

export type { MigrationDef } from "./versions.js";
export { migrations } from "./versions.js";

export type { Migration, AppliedMigration, MigrationStatus } from "./runner.js";
export { MigrationRunner } from "./runner.js";
