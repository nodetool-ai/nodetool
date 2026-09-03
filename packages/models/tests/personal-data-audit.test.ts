/**
 * The personal-data registry is only worth what this audit proves.
 *
 * A hand-written "tables to delete on an erasure request" list rots on the
 * first PR that adds a table, and the failure is silent: someone's data stays
 * behind and nothing complains. So this reads the schema instead of trusting
 * prose. It walks every table exported from `src/schema/index.ts`, resolves
 * its real name and columns through Drizzle, and requires the registry to
 * classify all of them — with the strictest rule reserved for the case that
 * actually happens: a new table carrying `user_id`.
 *
 * It asserts it *found* tables before it asserts anything about them. A
 * broken walk would otherwise pass by classifying an empty set, which is the
 * exact failure mode AGENTS.md § Claims, Checks, and Measurements names.
 */
import { describe, expect, it } from "vitest";
import { Table, getTableColumns, getTableName, is } from "drizzle-orm";

import * as schema from "../src/schema/index.js";
import {
  PERSONAL_DATA_REGISTRY,
  isActionable,
  type PersonalDataEntry
} from "../src/personal-data-registry.js";
import {
  ERASURE_HANDLED_TABLES,
  EXPORT_HANDLERS
} from "../src/personal-data.js";

interface SchemaTable {
  /** Export name in `src/schema/index.ts`. */
  schemaExport: string;
  /** Physical table name. */
  table: string;
  columns: string[];
}

/** Every table the schema barrel exports, read from Drizzle, not from a list. */
function schemaTables(): SchemaTable[] {
  const out: SchemaTable[] = [];
  for (const [schemaExport, value] of Object.entries(schema)) {
    if (!is(value as object, Table)) continue;
    const table = value as unknown as Table;
    out.push({
      schemaExport,
      table: getTableName(table),
      columns: Object.values(getTableColumns(table)).map(
        (column) => (column as { name: string }).name
      )
    });
  }
  return out.sort((a, b) => a.table.localeCompare(b.table));
}

const tables = schemaTables();
const byTable = new Map(tables.map((t) => [t.table, t]));
const userKeyed = tables.filter((t) => t.columns.includes("user_id"));

const entries = new Map<string, PersonalDataEntry>();
const duplicates: string[] = [];
for (const entry of PERSONAL_DATA_REGISTRY) {
  if (entries.has(entry.table)) duplicates.push(entry.table);
  entries.set(entry.table, entry);
}

describe("personal data registry audit", () => {
  it("reads a real schema and finds user-keyed tables in it", () => {
    // The positive control. Every assertion below is vacuous if this walk
    // stops finding tables, so prove it found them first.
    expect(tables.length).toBeGreaterThanOrEqual(40);
    expect(userKeyed.length).toBeGreaterThanOrEqual(30);
    expect(PERSONAL_DATA_REGISTRY.length).toBeGreaterThanOrEqual(40);
    expect(tables.every((t) => t.columns.length > 0)).toBe(true);
  });

  it("classifies every table in the schema", () => {
    // The ratchet. A new table with no registry entry fails here, by name.
    const unregistered = tables
      .filter((t) => !entries.has(t.table))
      .map((t) => `${t.table} (schema export: ${t.schemaExport})`);
    expect(unregistered).toEqual([]);
  });

  it("has no stale or duplicated entries", () => {
    const stale = PERSONAL_DATA_REGISTRY.filter(
      (entry) => !byTable.has(entry.table)
    ).map((entry) => entry.table);
    expect(stale).toEqual([]);
    expect(duplicates).toEqual([]);
  });

  it("names the right schema export for every entry", () => {
    const wrong = PERSONAL_DATA_REGISTRY.filter((entry) => {
      const table = byTable.get(entry.table);
      return !table || table.schemaExport !== entry.schemaExport;
    }).map((entry) => `${entry.table} -> ${entry.schemaExport}`);
    expect(wrong).toEqual([]);
  });

  it("reaches every user_id table directly by user_id", () => {
    // The rule that catches the realistic mistake: a new user-keyed table
    // filed as infrastructure, or reached through a join it does not need.
    const wrong = userKeyed
      .map((t) => ({ t, entry: entries.get(t.table) }))
      .filter(
        ({ entry }) =>
          !entry ||
          entry.disposition === "not-personal" ||
          entry.reach.kind !== "direct" ||
          entry.reach.column !== "user_id"
      )
      .map(({ t }) => t.table);
    expect(wrong).toEqual([]);
  });

  it("points every reach at a column that exists", () => {
    const broken: string[] = [];
    for (const entry of PERSONAL_DATA_REGISTRY) {
      const table = byTable.get(entry.table);
      if (!table) continue;
      if (entry.reach.kind === "none") continue;
      if (!table.columns.includes(entry.reach.column)) {
        broken.push(`${entry.table}.${entry.reach.column}`);
      }
      if (entry.reach.kind === "indirect" && !byTable.has(entry.reach.parent)) {
        broken.push(`${entry.table} -> missing parent ${entry.reach.parent}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("names real columns in every redaction and every withholding", () => {
    const broken: string[] = [];
    for (const entry of PERSONAL_DATA_REGISTRY) {
      const table = byTable.get(entry.table);
      if (!table) continue;
      const named = [
        ...(entry.redactedColumns ?? []),
        ...(entry.withheldColumns ?? [])
      ];
      for (const column of named) {
        if (!table.columns.includes(column)) {
          broken.push(`${entry.table}.${column}`);
        }
      }
      if (entry.disposition === "redact" && !entry.redactedColumns?.length) {
        broken.push(`${entry.table}: redact with no redactedColumns`);
      }
      if (entry.disposition !== "redact" && entry.redactedColumns?.length) {
        broken.push(`${entry.table}: redactedColumns on a ${entry.disposition}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("writes a justification somebody could defend", () => {
    // Short enough to be a label rather than a reason is the failure mode.
    const thin = PERSONAL_DATA_REGISTRY.filter(
      (entry) => entry.justification.trim().length < 40
    ).map((entry) => entry.table);
    expect(thin).toEqual([]);
  });

  it("wires every actionable entry into erasure", () => {
    // A registry entry nobody implemented is worse than no entry: it reads
    // like coverage. This is what makes the registry self-enforcing.
    const handled = new Set(ERASURE_HANDLED_TABLES);
    const missing = PERSONAL_DATA_REGISTRY.filter(
      (entry) => isActionable(entry) && !handled.has(entry.table)
    ).map((entry) => entry.table);
    expect(missing).toEqual([]);
  });

  it("erases nothing the registry did not register as actionable", () => {
    const actionable = new Set(
      PERSONAL_DATA_REGISTRY.filter(isActionable).map((entry) => entry.table)
    );
    const unregistered = ERASURE_HANDLED_TABLES.filter(
      (table) => !actionable.has(table)
    );
    expect(unregistered).toEqual([]);
    expect(new Set(ERASURE_HANDLED_TABLES).size).toBe(
      ERASURE_HANDLED_TABLES.length
    );
  });

  it("wires every exported entry into the export, and nothing else", () => {
    const exported = PERSONAL_DATA_REGISTRY.filter((entry) => entry.exported)
      .map((entry) => entry.table)
      .sort();
    expect(Object.keys(EXPORT_HANDLERS).sort()).toEqual(exported);
    expect(exported.length).toBeGreaterThanOrEqual(30);
  });

  it("never exports a table it classified as holding no personal data", () => {
    const wrong = PERSONAL_DATA_REGISTRY.filter(
      (entry) => entry.disposition === "not-personal" && entry.exported
    ).map((entry) => entry.table);
    expect(wrong).toEqual([]);
  });
});
