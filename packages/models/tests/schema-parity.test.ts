import Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { beforeAll, describe, expect, it } from "vitest";

import { TABLE_COLUMNS, getCreateSchemaSql } from "../src/db.js";
import * as schema from "../src/schema/index.js";

/**
 * The SQLite schema is stated in three places that no compiler relates:
 * the Drizzle tables in `src/schema/`, the bootstrap DDL in
 * `getCreateSchemaSql()` that a fresh database is created from, and
 * `TABLE_COLUMNS`, the map `addMissingColumns()` uses to repair a legacy
 * install. Drizzle is the source every query goes through, so it is the
 * reference here; the other two must agree with it.
 *
 * The bootstrap DDL is compared by executing it and reading the schema back
 * out of SQLite, not by parsing the string — that way a difference SQLite
 * ignores does not fail, and one it honors cannot pass.
 */

type ColumnFacts = {
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
};

type IndexFacts = { unique: boolean; columns: string[] };

/**
 * Two tables whose bootstrap DDL carries a backstop `DEFAULT` that the Drizzle
 * column does not declare. Harmless today because every insert goes through
 * Drizzle and supplies the value, but it is a real disagreement: closing it
 * means either dropping the SQL default or adding `.default()` to both the
 * SQLite and the PostgreSQL schema plus a PostgreSQL migration. Listed here so
 * the pair stays visible and any *new* default drift fails.
 */
const KNOWN_DEFAULT_DRIFT = new Set([
  "applications.description",
  "application_versions.released"
]);

function sqlLiteral(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

/** Strip SQLite's quoting so `'manual'` and `manual` compare equal. */
function normalizeDefault(value: unknown): string | null {
  const raw = sqlLiteral(value);
  if (raw === null) return null;
  return raw.replace(/^'(.*)'$/s, "$1");
}

function drizzleTables(): Map<string, ReturnType<typeof getTableConfig>> {
  const tables = new Map<string, ReturnType<typeof getTableConfig>>();
  for (const exported of Object.values(schema)) {
    if (!is(exported, SQLiteTable)) continue;
    const config = getTableConfig(exported);
    tables.set(config.name, config);
  }
  return tables;
}

function drizzleColumns(
  config: ReturnType<typeof getTableConfig>
): Map<string, ColumnFacts> {
  return new Map(
    config.columns.map((column) => [
      column.name,
      {
        type: column.getSQLType().toLowerCase(),
        notNull: column.notNull,
        primaryKey: column.primary,
        defaultValue: column.hasDefault
          ? normalizeDefault(column.default)
          : null
      }
    ])
  );
}

const tables = drizzleTables();

let bootstrapped: Database.Database;

function bootstrapColumns(tableName: string): Map<string, ColumnFacts> {
  const rows = bootstrapped
    .prepare(
      `SELECT name, type, "notnull" AS not_null, dflt_value, pk
         FROM pragma_table_info(?)`
    )
    .all(tableName) as Array<{
    name: string;
    type: string;
    not_null: number;
    dflt_value: string | null;
    pk: number;
  }>;
  return new Map(
    rows.map((row) => [
      row.name,
      {
        type: row.type.toLowerCase(),
        notNull: row.not_null === 1,
        primaryKey: row.pk > 0,
        defaultValue: normalizeDefault(row.dflt_value)
      }
    ])
  );
}

function bootstrapIndexes(tableName: string): Map<string, IndexFacts> {
  const rows = bootstrapped
    .prepare(`SELECT name, "unique" AS uniq FROM pragma_index_list(?)`)
    .all(tableName) as Array<{ name: string; uniq: number }>;
  return new Map(
    rows
      .filter((row) => !row.name.startsWith("sqlite_autoindex"))
      .map((row) => [
        row.name,
        {
          unique: row.uniq === 1,
          columns: (
            bootstrapped
              .prepare(`SELECT name FROM pragma_index_info(?)`)
              .all(row.name) as Array<{ name: string }>
          ).map((c) => c.name)
        }
      ])
  );
}

describe("SQLite schema parity", () => {
  beforeAll(() => {
    bootstrapped = new Database(":memory:");
    bootstrapped.exec(getCreateSchemaSql());
  });

  it("finds the schema tables it is supposed to compare", () => {
    // A parity check that matched nothing would pass every assertion below.
    expect(tables.size).toBeGreaterThanOrEqual(40);
    expect(tables.has("nodetool_workflows")).toBe(true);
  });

  it("creates every Drizzle table in the bootstrap DDL", () => {
    const missing = [...tables.keys()].filter(
      (name) => bootstrapColumns(name).size === 0
    );
    expect(missing).toEqual([]);
  });

  it("gives every bootstrapped column the shape its Drizzle column declares", () => {
    const disagreements: string[] = [];
    for (const [tableName, config] of tables) {
      const actual = bootstrapColumns(tableName);
      const expected = drizzleColumns(config);

      for (const name of actual.keys()) {
        if (!expected.has(name)) {
          disagreements.push(`${tableName}.${name}: in DDL, not in Drizzle`);
        }
      }
      for (const [name, want] of expected) {
        const got = actual.get(name);
        if (!got) {
          disagreements.push(`${tableName}.${name}: in Drizzle, not in DDL`);
          continue;
        }
        if (got.type !== want.type) {
          disagreements.push(
            `${tableName}.${name}: type ddl=${got.type} drizzle=${want.type}`
          );
        }
        if (got.notNull !== want.notNull) {
          disagreements.push(
            `${tableName}.${name}: notNull ddl=${got.notNull} drizzle=${want.notNull}`
          );
        }
        if (got.primaryKey !== want.primaryKey) {
          disagreements.push(
            `${tableName}.${name}: primaryKey ddl=${got.primaryKey} drizzle=${want.primaryKey}`
          );
        }
        if (
          got.defaultValue !== want.defaultValue &&
          !KNOWN_DEFAULT_DRIFT.has(`${tableName}.${name}`)
        ) {
          disagreements.push(
            `${tableName}.${name}: default ddl=${got.defaultValue} drizzle=${want.defaultValue}`
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("creates every Drizzle index in the bootstrap DDL", () => {
    const disagreements: string[] = [];
    for (const [tableName, config] of tables) {
      const actual = bootstrapIndexes(tableName);
      for (const index of config.indexes) {
        const name = index.config.name;
        const got = actual.get(name);
        if (!got) {
          disagreements.push(`${tableName}: index ${name} missing from DDL`);
          continue;
        }
        const wantColumns = index.config.columns.map((column) =>
          "name" in column ? String(column.name) : String(column)
        );
        if (got.columns.join(",") !== wantColumns.join(",")) {
          disagreements.push(
            `${tableName}.${name}: columns ddl=${got.columns.join(",")} drizzle=${wantColumns.join(",")}`
          );
        }
        if (got.unique !== Boolean(index.config.unique)) {
          disagreements.push(
            `${tableName}.${name}: unique ddl=${got.unique} drizzle=${Boolean(index.config.unique)}`
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("creates every Drizzle foreign key in the bootstrap DDL", () => {
    const disagreements: string[] = [];
    for (const [tableName, config] of tables) {
      const actual = bootstrapped
        .prepare(`SELECT * FROM pragma_foreign_key_list(?)`)
        .all(tableName) as unknown[];
      if (actual.length !== config.foreignKeys.length) {
        disagreements.push(
          `${tableName}: ${actual.length} foreign keys in DDL, ${config.foreignKeys.length} in Drizzle`
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("lists every Drizzle table in TABLE_COLUMNS", () => {
    // A table absent here gets no additive column repair, so a legacy SQLite
    // install that predates one of its columns never gains it.
    const missing = [...tables.keys()].filter(
      (name) => !(name in TABLE_COLUMNS)
    );
    expect(missing).toEqual([]);
  });

  it("adds every TABLE_COLUMNS column to a legacy table that has rows", () => {
    // `addMissingColumns` splices each entry into `ALTER TABLE … ADD COLUMN`.
    // SQLite rejects a NOT NULL addition without a constant default and
    // rejects a malformed type, so running every fragment against a table
    // that already holds a row is what proves the fragments are usable.
    for (const [tableName, columns] of Object.entries(TABLE_COLUMNS)) {
      const config = tables.get(tableName);
      if (!config) continue;
      const primaryKey = config.columns.find((column) => column.primary);
      if (!primaryKey) continue;

      const legacy = new Database(":memory:");
      legacy.exec(
        `CREATE TABLE "${tableName}" ("${primaryKey.name}" ${primaryKey.getSQLType()} PRIMARY KEY NOT NULL)`
      );
      legacy
        .prepare(`INSERT INTO "${tableName}" ("${primaryKey.name}") VALUES (?)`)
        .run("legacy-row");

      for (const [name, ddl] of Object.entries(columns)) {
        if (name === primaryKey.name) continue;
        legacy.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${name}" ${ddl}`);
      }

      const added = new Set(
        (
          legacy
            .prepare(`SELECT name FROM pragma_table_info(?)`)
            .all(tableName) as Array<{ name: string }>
        ).map((row) => row.name)
      );
      expect([...Object.keys(columns)].filter((c) => !added.has(c))).toEqual([]);
      legacy.close();
    }
  });

  it("gives TABLE_COLUMNS the same columns and types as the Drizzle tables", () => {
    const disagreements: string[] = [];
    for (const [tableName, expectedColumns] of Object.entries(TABLE_COLUMNS)) {
      const config = tables.get(tableName);
      if (!config) {
        disagreements.push(`${tableName}: in TABLE_COLUMNS, not in Drizzle`);
        continue;
      }
      const declared = drizzleColumns(config);
      for (const name of declared.keys()) {
        if (!(name in expectedColumns)) {
          disagreements.push(`${tableName}.${name}: missing from TABLE_COLUMNS`);
        }
      }
      for (const [name, ddl] of Object.entries(expectedColumns)) {
        const want = declared.get(name);
        if (!want) {
          disagreements.push(`${tableName}.${name}: not a Drizzle column`);
          continue;
        }
        // The map's value is spliced into `ALTER TABLE … ADD COLUMN "x" <ddl>`,
        // so it is a type optionally followed by NOT NULL/DEFAULT.
        const [type] = ddl.split(/\s+/);
        if (type.toLowerCase() !== want.type) {
          disagreements.push(
            `${tableName}.${name}: type map=${type} drizzle=${want.type}`
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
