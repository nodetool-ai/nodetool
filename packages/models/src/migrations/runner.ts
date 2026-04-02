/**
 * Migration runner for the NodeTool database migration system.
 *
 * Port of Python's `nodetool.migrations.runner`.
 *
 * Handles migration discovery, execution, tracking, locking,
 * rollback, checksum validation, and baselining.
 * Works with both SQLite and PostgreSQL/Supabase backends.
 */

import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { MigrationDBAdapter } from "./db-adapter.js";
import {
  BaselineError,
  LockError,
  MigrationError,
  RollbackError
} from "./exceptions.js";
import {
  APPLICATION_TABLES,
  DatabaseState,
  MIGRATION_LOCK_TABLE,
  MIGRATION_TRACKING_TABLE
} from "./state.js";
import {
  migrations as builtinMigrations,
  type MigrationDef
} from "./versions.js";

// ── Types ────────────────────────────────────────────────────────────

export interface Migration {
  version: string;
  name: string;
  checksum: string;
  up: (db: MigrationDBAdapter) => Promise<void>;
  down: (db: MigrationDBAdapter) => Promise<void>;
  createsTables: string[];
  modifiesTables: string[];
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  appliedAt: string;
  executionTimeMs: number;
  baselined: boolean;
}

export interface MigrationStatus {
  state: string;
  currentVersion: string | null;
  applied: Array<{
    version: string;
    name: string;
    appliedAt: string;
    executionTimeMs: number;
    baselined: boolean;
  }>;
  pending: Array<{
    version: string;
    name: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function computeChecksum(def: MigrationDef): string {
  const content = [
    def.version,
    def.name,
    def.up.toString(),
    def.down.toString(),
    JSON.stringify(def.createsTables),
    JSON.stringify(def.modifiesTables)
  ].join("\n");
  return createHash("sha256").update(content).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── MigrationRunner ──────────────────────────────────────────────────

export class MigrationRunner {
  private adapter: MigrationDBAdapter;
  private migrationsCache: Migration[] | null = null;
  private customMigrations: MigrationDef[] | null;

  constructor(adapter: MigrationDBAdapter, customMigrations?: MigrationDef[]) {
    this.adapter = adapter;
    this.customMigrations = customMigrations ?? null;
  }

  // ── Migration tracking table management ────────────────────────────

  private async createTrackingTables(): Promise<void> {
    const isPostgres = this.adapter.dbType === "postgres";

    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TRACKING_TABLE} (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        baselined INTEGER DEFAULT 0
      )
    `);

    if (isPostgres) {
      await this.adapter.execute(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_LOCK_TABLE} (
          id INTEGER PRIMARY KEY,
          locked_at TEXT,
          locked_by TEXT,
          CONSTRAINT single_row CHECK (id = 1)
        )
      `);
      await this.adapter.execute(`
        INSERT INTO ${MIGRATION_LOCK_TABLE} (id, locked_at, locked_by)
        VALUES (1, NULL, NULL)
        ON CONFLICT (id) DO NOTHING
      `);
    } else {
      await this.adapter.execute(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_LOCK_TABLE} (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          locked_at TEXT,
          locked_by TEXT
        )
      `);
      await this.adapter.execute(`
        INSERT OR IGNORE INTO ${MIGRATION_LOCK_TABLE} (id, locked_at, locked_by)
        VALUES (1, NULL, NULL)
      `);
    }

    await this.adapter.commit();
  }

  private async getAppliedMigrations(): Promise<Map<string, AppliedMigration>> {
    if (!(await this.adapter.tableExists(MIGRATION_TRACKING_TABLE))) {
      return new Map();
    }

    const rows = await this.adapter.fetchall(`
      SELECT version, name, checksum, applied_at, execution_time_ms, baselined
      FROM ${MIGRATION_TRACKING_TABLE}
      ORDER BY version
    `);

    const applied = new Map<string, AppliedMigration>();
    for (const row of rows) {
      applied.set(row.version, {
        version: row.version,
        name: row.name,
        checksum: row.checksum,
        appliedAt: row.applied_at,
        executionTimeMs: row.execution_time_ms,
        baselined: Boolean(row.baselined)
      });
    }
    return applied;
  }

  private async recordMigration(
    migration: Migration,
    executionTimeMs: number,
    baselined = false
  ): Promise<void> {
    await this.adapter.execute(
      `INSERT INTO ${MIGRATION_TRACKING_TABLE}
       (version, name, checksum, applied_at, execution_time_ms, baselined)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        migration.version,
        migration.name,
        migration.checksum,
        new Date().toISOString(),
        executionTimeMs,
        baselined ? 1 : 0
      ]
    );
    await this.adapter.commit();
  }

  private async removeMigrationRecord(version: string): Promise<void> {
    await this.adapter.execute(
      `DELETE FROM ${MIGRATION_TRACKING_TABLE} WHERE version = ?`,
      [version]
    );
    await this.adapter.commit();
  }

  // ── Locking mechanism ──────────────────────────────────────────────

  private async acquireLock(timeout = 30000): Promise<boolean> {
    const lockId = `${hostname()}:${randomUUID().slice(0, 8)}`;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      await this.adapter.execute(
        `UPDATE ${MIGRATION_LOCK_TABLE}
         SET locked_at = ?, locked_by = ?
         WHERE id = 1 AND locked_at IS NULL`,
        [new Date().toISOString(), lockId]
      );
      await this.adapter.commit();

      if (this.adapter.getRowcount() > 0) {
        return true;
      }

      // Check for stale lock (older than 5 minutes)
      const row = await this.adapter.fetchone(
        `SELECT locked_at, locked_by FROM ${MIGRATION_LOCK_TABLE} WHERE id = 1`
      );
      if (row?.locked_at) {
        const lockedAt = new Date(row.locked_at).getTime();
        if (Date.now() - lockedAt > 300_000) {
          await this.adapter.execute(
            `UPDATE ${MIGRATION_LOCK_TABLE}
             SET locked_at = ?, locked_by = ?
             WHERE id = 1 AND locked_at = ?`,
            [new Date().toISOString(), lockId, row.locked_at]
          );
          await this.adapter.commit();
          if (this.adapter.getRowcount() > 0) {
            return true;
          }
        }
      }

      await sleep(500);
    }

    throw new LockError(
      `Could not acquire migration lock within ${timeout}ms. Another migration may be in progress.`
    );
  }

  private async releaseLock(): Promise<void> {
    await this.adapter.execute(
      `UPDATE ${MIGRATION_LOCK_TABLE}
       SET locked_at = NULL, locked_by = NULL
       WHERE id = 1`
    );
    await this.adapter.commit();
  }

  // ── Migration discovery ────────────────────────────────────────────

  discoverMigrations(): Migration[] {
    if (this.migrationsCache !== null) {
      return this.migrationsCache;
    }

    const defs = this.customMigrations ?? builtinMigrations;
    const result: Migration[] = defs.map((def) => ({
      version: def.version,
      name: def.name,
      checksum: computeChecksum(def),
      up: def.up,
      down: def.down,
      createsTables: def.createsTables,
      modifiesTables: def.modifiesTables
    }));

    result.sort((a, b) => a.version.localeCompare(b.version));
    this.migrationsCache = result;
    return result;
  }

  // ── Checksum validation ────────────────────────────────────────────

  async validateChecksums(): Promise<string[]> {
    const applied = await this.getAppliedMigrations();
    const migrationsMap = new Map(
      this.discoverMigrations().map((m) => [m.version, m])
    );
    const mismatches: string[] = [];

    for (const [version, appliedMigration] of applied) {
      const migration = migrationsMap.get(version);
      if (migration && migration.checksum !== appliedMigration.checksum) {
        mismatches.push(version);
      }
    }

    return mismatches;
  }

  // ── Database state detection ───────────────────────────────────────

  private async detectDatabaseState(): Promise<DatabaseState> {
    if (await this.adapter.tableExists(MIGRATION_TRACKING_TABLE)) {
      return DatabaseState.MIGRATION_TRACKED;
    }

    for (const tableName of APPLICATION_TABLES) {
      if (await this.adapter.tableExists(tableName)) {
        return DatabaseState.LEGACY_DATABASE;
      }
    }

    return DatabaseState.FRESH_INSTALL;
  }

  // ── Migration execution ────────────────────────────────────────────

  async migrate(opts?: {
    target?: string;
    dryRun?: boolean;
    validateChecksums?: boolean;
  }): Promise<string[]> {
    const {
      target,
      dryRun = false,
      validateChecksums: doValidate = true
    } = opts ?? {};

    const dbState = await this.detectDatabaseState();

    if (dbState !== DatabaseState.MIGRATION_TRACKED) {
      if (!dryRun) {
        await this.createTrackingTables();
      }
    }

    if (!dryRun) {
      await this.acquireLock();
    }

    try {
      if (dbState === DatabaseState.LEGACY_DATABASE && !dryRun) {
        await this.baselineMigrations();
      }

      if (doValidate && !dryRun) {
        await this.validateChecksums();
      }

      if (!dryRun) {
        await this.repairBaselinedAlterMigrations();
      }

      const applied = await this.getAppliedMigrations();
      const allMigrations = this.discoverMigrations();
      let pending = allMigrations.filter((m) => !applied.has(m.version));

      if (target) {
        pending = pending.filter((m) => m.version <= target);
      }

      if (pending.length === 0) {
        return [];
      }

      const appliedVersions: string[] = [];
      for (const migration of pending) {
        if (dryRun) {
          appliedVersions.push(migration.version);
        } else {
          await this.applyMigration(migration);
          appliedVersions.push(migration.version);
        }
      }

      return appliedVersions;
    } finally {
      if (!dryRun) {
        await this.releaseLock();
      }
    }
  }

  private async applyMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();

    try {
      await migration.up(this.adapter);
      await this.adapter.commit();
      const executionTimeMs = Date.now() - startTime;
      await this.recordMigration(migration, executionTimeMs);
    } catch (e) {
      await this.adapter.rollback();
      throw new MigrationError(
        `Migration ${migration.version} failed: ${e}`,
        migration.version
      );
    }
  }

  // ── Repair incorrectly baselined migrations ────────────────────────

  private async repairBaselinedAlterMigrations(): Promise<void> {
    const applied = await this.getAppliedMigrations();
    const migrationsMap = new Map(
      this.discoverMigrations().map((m) => [m.version, m])
    );

    for (const [version, appliedMigration] of applied) {
      if (!appliedMigration.baselined) continue;

      const migration = migrationsMap.get(version);
      if (!migration) continue;
      if (migration.modifiesTables.length === 0) continue;

      try {
        await migration.up(this.adapter);
        await this.adapter.commit();

        await this.adapter.execute(
          `UPDATE ${MIGRATION_TRACKING_TABLE}
           SET baselined = 0, applied_at = ?
           WHERE version = ?`,
          [new Date().toISOString(), migration.version]
        );
        await this.adapter.commit();
      } catch (e) {
        await this.adapter.rollback();
        console.error(`Failed to repair migration ${migration.version}: ${e}`);
      }
    }
  }

  // ── Baselining ─────────────────────────────────────────────────────

  private async baselineMigrations(): Promise<void> {
    const allMigrations = this.discoverMigrations();

    for (const migration of allMigrations) {
      let shouldBaseline = false;

      if (migration.createsTables.length > 0) {
        let allExist = true;
        for (const table of migration.createsTables) {
          if (!(await this.adapter.tableExists(table))) {
            allExist = false;
            break;
          }
        }
        shouldBaseline = allExist;
      }

      if (shouldBaseline) {
        await this.recordMigration(migration, 0, true);
      } else {
        await this.applyMigration(migration);
      }
    }
  }

  async baseline(force = false): Promise<number> {
    const hasTracking = await this.adapter.tableExists(
      MIGRATION_TRACKING_TABLE
    );

    if (hasTracking && !force) {
      throw new BaselineError(
        "Migration tracking already exists. Use force to re-baseline."
      );
    }

    if (!hasTracking) {
      await this.createTrackingTables();
    }

    await this.acquireLock();

    try {
      if (force && hasTracking) {
        await this.adapter.execute(`DELETE FROM ${MIGRATION_TRACKING_TABLE}`);
        await this.adapter.commit();
      }

      const allMigrations = this.discoverMigrations();
      let baselined = 0;

      for (const migration of allMigrations) {
        let shouldBaseline = false;

        if (migration.createsTables.length > 0) {
          let allExist = true;
          for (const table of migration.createsTables) {
            if (!(await this.adapter.tableExists(table))) {
              allExist = false;
              break;
            }
          }
          shouldBaseline = allExist;
        }

        if (shouldBaseline) {
          await this.recordMigration(migration, 0, true);
          baselined++;
        } else {
          await this.applyMigration(migration);
        }
      }

      return baselined;
    } finally {
      await this.releaseLock();
    }
  }

  // ── Rollback ───────────────────────────────────────────────────────

  async rollback(steps = 1): Promise<string[]> {
    await this.acquireLock();

    try {
      const applied = await this.getAppliedMigrations();
      const migrationsMap = new Map(
        this.discoverMigrations().map((m) => [m.version, m])
      );

      const versionsToRollback = [...applied.keys()]
        .sort()
        .reverse()
        .slice(0, steps);

      if (versionsToRollback.length === 0) {
        return [];
      }

      const rolledBack: string[] = [];

      for (const version of versionsToRollback) {
        const appliedMigration = applied.get(version)!;

        if (appliedMigration.baselined) {
          await this.removeMigrationRecord(version);
          rolledBack.push(version);
          continue;
        }

        const migration = migrationsMap.get(version);
        if (!migration) {
          throw new RollbackError(
            `Migration ${version} not found in migrations. Cannot rollback.`,
            version
          );
        }

        await this.rollbackMigration(migration);
        rolledBack.push(version);
      }

      return rolledBack;
    } finally {
      await this.releaseLock();
    }
  }

  private async rollbackMigration(migration: Migration): Promise<void> {
    try {
      await migration.down(this.adapter);
      await this.adapter.commit();
      await this.removeMigrationRecord(migration.version);
    } catch (e) {
      await this.adapter.rollback();
      throw new RollbackError(
        `Rollback of migration ${migration.version} failed: ${e}`,
        migration.version
      );
    }
  }

  // ── Status and info ────────────────────────────────────────────────

  async status(): Promise<MigrationStatus> {
    const dbState = await this.detectDatabaseState();

    if (dbState === DatabaseState.FRESH_INSTALL) {
      return {
        state: dbState,
        currentVersion: null,
        applied: [],
        pending: this.discoverMigrations().map((m) => ({
          version: m.version,
          name: m.name
        }))
      };
    }

    const applied = await this.getAppliedMigrations();
    const allMigrations = this.discoverMigrations();
    const pending = allMigrations.filter((m) => !applied.has(m.version));

    const versions = [...applied.keys()];
    const currentVersion = versions.length > 0 ? versions.sort().pop()! : null;

    return {
      state: dbState,
      currentVersion,
      applied: [...applied.values()].map((m) => ({
        version: m.version,
        name: m.name,
        appliedAt: m.appliedAt,
        executionTimeMs: m.executionTimeMs,
        baselined: m.baselined
      })),
      pending: pending.map((m) => ({
        version: m.version,
        name: m.name
      }))
    };
  }

  async getCurrentVersion(): Promise<string | null> {
    const applied = await this.getAppliedMigrations();
    if (applied.size === 0) return null;
    return [...applied.keys()].sort().pop()!;
  }
}
