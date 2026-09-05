import { is } from "drizzle-orm";
import { PgTable, getTableConfig as pgTableConfig } from "drizzle-orm/pg-core";
import {
  SQLiteTable,
  getTableConfig as sqliteTableConfig
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import * as pgSchema from "../src/schema-pg/index.js";
import * as sqliteSchema from "../src/schema/index.js";

/**
 * `src/schema/` and `src/schema-pg/` declare the same tables twice, once per
 * dialect. Only the SQLite set is imported by the model layer, so a query runs
 * off it on both connections; the PostgreSQL set is what `initPostgresDb`
 * hands Drizzle, and therefore what the relational API (`db.query.<table>`,
 * used by `packages/websocket/src/triggers/stores.ts`) resolves against on a
 * cloud deployment. A table or column missing from it is invisible there.
 *
 * Nothing else relates the two, so this test does.
 */

/**
 * The local worker pool (profiles and provisioned instances) is declared for
 * SQLite only. The migration that creates the two tables is dialect-agnostic
 * so they exist on PostgreSQL as well, but no code reaches them through the
 * relational API, and mirroring them would add a second declaration of each
 * for nothing. Adding a `db.query.workerProfiles` caller is the point at which
 * they need the PostgreSQL declaration.
 */
const SQLITE_ONLY_TABLES = new Set(["worker_profiles", "worker_instances"]);

type ColumnFacts = {
  notNull: boolean;
  primary: boolean;
  hasDefault: boolean;
  defaultValue: string | null;
};

/** SQLite spells a boolean default `false`, PostgreSQL `0`. */
function normalizeDefault(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function facts(column: {
  notNull: boolean;
  primary: boolean;
  hasDefault: boolean;
  default: unknown;
}): ColumnFacts {
  return {
    notNull: column.notNull,
    primary: column.primary,
    hasDefault: column.hasDefault,
    defaultValue: column.hasDefault ? normalizeDefault(column.default) : null
  };
}

const sqliteTables = new Map<
  string,
  { columns: Map<string, ColumnFacts>; indexes: Set<string> }
>();
for (const exported of Object.values(sqliteSchema)) {
  if (!is(exported, SQLiteTable)) continue;
  const config = sqliteTableConfig(exported);
  sqliteTables.set(config.name, {
    columns: new Map(config.columns.map((c) => [c.name, facts(c)])),
    indexes: new Set(config.indexes.map((i) => i.config.name))
  });
}

const pgTables = new Map<
  string,
  { columns: Map<string, ColumnFacts>; indexes: Set<string> }
>();
for (const exported of Object.values(pgSchema)) {
  if (!is(exported, PgTable)) continue;
  const config = pgTableConfig(exported);
  pgTables.set(config.name, {
    columns: new Map(config.columns.map((c) => [c.name, facts(c)])),
    indexes: new Set(config.indexes.map((i) => i.config.name))
  });
}

describe("SQLite and PostgreSQL schema parity", () => {
  it("has both schemas to compare", () => {
    // Two empty sets would satisfy every assertion below.
    expect(sqliteTables.size).toBeGreaterThanOrEqual(40);
    expect(pgTables.size).toBeGreaterThanOrEqual(40);
  });

  it("declares the same tables in both dialects", () => {
    const missingFromPg = [...sqliteTables.keys()].filter(
      (name) => !SQLITE_ONLY_TABLES.has(name) && !pgTables.has(name)
    );
    const missingFromSqlite = [...pgTables.keys()].filter(
      (name) => !sqliteTables.has(name)
    );
    expect({ missingFromPg, missingFromSqlite }).toEqual({
      missingFromPg: [],
      missingFromSqlite: []
    });
  });

  it("gives every shared table the same columns", () => {
    const disagreements: string[] = [];
    for (const [name, sqlite] of sqliteTables) {
      const pg = pgTables.get(name);
      if (!pg) continue;
      for (const column of sqlite.columns.keys()) {
        if (!pg.columns.has(column)) {
          disagreements.push(`${name}.${column}: missing from schema-pg`);
        }
      }
      for (const column of pg.columns.keys()) {
        if (!sqlite.columns.has(column)) {
          disagreements.push(`${name}.${column}: missing from schema`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("gives every shared column the same constraints and default", () => {
    const disagreements: string[] = [];
    for (const [name, sqlite] of sqliteTables) {
      const pg = pgTables.get(name);
      if (!pg) continue;
      for (const [column, want] of sqlite.columns) {
        const got = pg.columns.get(column);
        if (!got) continue;
        for (const key of [
          "notNull",
          "primary",
          "hasDefault",
          "defaultValue"
        ] as const) {
          if (got[key] !== want[key]) {
            disagreements.push(
              `${name}.${column}: ${key} sqlite=${want[key]} pg=${got[key]}`
            );
          }
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("declares the same indexes on every shared table", () => {
    const disagreements: string[] = [];
    for (const [name, sqlite] of sqliteTables) {
      const pg = pgTables.get(name);
      if (!pg) continue;
      for (const index of sqlite.indexes) {
        if (!pg.indexes.has(index)) {
          disagreements.push(`${name}: index ${index} missing from schema-pg`);
        }
      }
      for (const index of pg.indexes) {
        if (!sqlite.indexes.has(index)) {
          disagreements.push(`${name}: index ${index} missing from schema`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
