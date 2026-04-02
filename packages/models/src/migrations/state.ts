/**
 * Database state detection for the migration system.
 *
 * Port of Python's `nodetool.migrations.state`.
 */

import type { MigrationDBAdapter } from "./db-adapter.js";

export enum DatabaseState {
  FRESH_INSTALL = "fresh_install",
  LEGACY_DATABASE = "legacy_database",
  MIGRATION_TRACKED = "migration_tracked"
}

/** Known application tables that indicate an existing installation. */
export const APPLICATION_TABLES = [
  "nodetool_workflows",
  "nodetool_assets",
  "nodetool_threads",
  "nodetool_messages",
  "nodetool_jobs",
  "nodetool_predictions",
  "nodetool_secrets"
];

/** Migration system tables. */
export const MIGRATION_TRACKING_TABLE = "_nodetool_migrations";
export const MIGRATION_LOCK_TABLE = "_nodetool_migration_lock";

/**
 * Detect the current state of the database.
 */
export async function detectDatabaseState(
  db: MigrationDBAdapter
): Promise<DatabaseState> {
  if (await db.tableExists(MIGRATION_TRACKING_TABLE)) {
    return DatabaseState.MIGRATION_TRACKED;
  }

  for (const tableName of APPLICATION_TABLES) {
    if (await db.tableExists(tableName)) {
      return DatabaseState.LEGACY_DATABASE;
    }
  }

  return DatabaseState.FRESH_INSTALL;
}
