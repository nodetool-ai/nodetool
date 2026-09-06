import Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateSqliteDb } from "../src/db.js";
import * as schema from "../src/schema/index.js";

/**
 * The migration chain in `src/migrations/versions.ts` is a fourth declaration
 * of the schema, beside the Drizzle tables, the bootstrap DDL and
 * `TABLE_COLUMNS` (those three are related by `schema-parity.test.ts`).
 *
 * On SQLite a gap here is invisible: `initDb` runs the bootstrap DDL and
 * `addMissingColumns` after the chain, so anything the chain missed is
 * repaired. On PostgreSQL nothing repairs it — `initPostgresDb` creates no
 * tables and runs no column repair, so the chain *is* the cloud schema, and a
 * column that only reaches SQLite is a cloud-only failure.
 *
 * The chain is applied to a real database here and read back with
 * `pragma_table_info`, so what is compared is the schema SQLite ended up with,
 * not the text of the migrations.
 */

/**
 * `nodetool_team_tasks` is created by the bootstrap DDL only. Nothing in the
 * repo reads or writes the table (see the entry in `personal-data-registry.ts`,
 * which classifies it `not-personal` for that reason), so it has never needed
 * to exist on a cloud deployment. A writer arriving is the point at which it
 * needs a migration.
 */
const TABLES_NOT_IN_THE_CHAIN = new Set(["nodetool_team_tasks"]);

/**
 * `nodetool_assets.size` was migrated in as `INTEGER` and later declared `real`
 * in Drizzle. SQLite stores either, and Postgres widens an integer column to
 * accept the value, so the two agree in practice; closing it needs a migration
 * that rewrites the column on both dialects.
 */
const KNOWN_TYPE_DRIFT = new Set(["nodetool_assets.size"]);

type ChainTable = Map<string, string>;

const drizzleTables = new Map<string, ReturnType<typeof getTableConfig>>();
for (const exported of Object.values(schema)) {
  if (!is(exported, SQLiteTable)) continue;
  const config = getTableConfig(exported);
  drizzleTables.set(config.name, config);
}

let dir: string;
let migrated: Database.Database;
let appliedCount = 0;

function chainColumns(tableName: string): ChainTable {
  const rows = migrated
    .prepare(`SELECT name, type FROM pragma_table_info(?)`)
    .all(tableName) as Array<{ name: string; type: string }>;
  return new Map(rows.map((row) => [row.name, row.type.toLowerCase()]));
}

describe("migration chain vs Drizzle schema", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "nodetool-migration-parity-"));
    const dbPath = join(dir, "migrated.sqlite3");
    appliedCount = (await migrateSqliteDb(dbPath)).length;
    migrated = new Database(dbPath, { readonly: true });
  }, 60_000);

  afterAll(() => {
    migrated?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("has a chain and a schema to compare", () => {
    // Both halves empty would satisfy every assertion below.
    expect(appliedCount).toBeGreaterThan(0);
    expect(drizzleTables.size).toBeGreaterThanOrEqual(40);
  });

  it("creates every Drizzle table", () => {
    const missing = [...drizzleTables.keys()].filter(
      (name) => !TABLES_NOT_IN_THE_CHAIN.has(name) && chainColumns(name).size === 0
    );
    expect(missing).toEqual([]);
  });

  it("gives every table it creates the columns and types Drizzle declares", () => {
    // Only this direction is asserted: the chain also carries columns the
    // schema has since dropped (`nodetool_assets.type`, the four
    // `nodetool_jobs.suspension_*`), which are inert residue on old rows.
    const disagreements: string[] = [];
    for (const [tableName, config] of drizzleTables) {
      const actual = chainColumns(tableName);
      if (actual.size === 0) continue;
      for (const column of config.columns) {
        const got = actual.get(column.name);
        if (got === undefined) {
          disagreements.push(`${tableName}.${column.name}: missing from the chain`);
          continue;
        }
        const want = column.getSQLType().toLowerCase();
        if (got !== want && !KNOWN_TYPE_DRIFT.has(`${tableName}.${column.name}`)) {
          disagreements.push(
            `${tableName}.${column.name}: type chain=${got} drizzle=${want}`
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
