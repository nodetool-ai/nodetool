import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { migrateSqliteDb, closeDb } from "../src/db.js";
import * as schema from "../src/schema/index.js";

describe("scratch chain", () => {
  it("measures", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nt-chain-"));
    const p = join(dir, "m.sqlite3");
    await closeDb();
    const applied = await migrateSqliteDb(p);
    const db = new Database(p, { readonly: true });
    const out: string[] = [`applied=${applied.length}`];
    const tables = new Map<string, ReturnType<typeof getTableConfig>>();
    for (const e of Object.values(schema)) if (is(e, SQLiteTable)) { const c = getTableConfig(e); tables.set(c.name, c); }
    out.push(`drizzleTables=${tables.size}`);
    for (const [t, cfg] of tables) {
      const rows = db.prepare(`SELECT name,type FROM pragma_table_info(?)`).all(t) as Array<{name:string;type:string}>;
      if (rows.length === 0) { out.push(`TABLE missing-from-chain ${t}`); continue; }
      const have = new Map(rows.map((r) => [r.name, r.type.toLowerCase()]));
      for (const c of cfg.columns) {
        const got = have.get(c.name);
        if (got === undefined) out.push(`COL missing-from-chain ${t}.${c.name}`);
        else if (got !== c.getSQLType().toLowerCase()) out.push(`TYPE ${t}.${c.name} chain=${got} drizzle=${c.getSQLType().toLowerCase()}`);
      }
      for (const n of have.keys()) if (!cfg.columns.some((c) => c.name === n)) out.push(`COL extra-in-chain ${t}.${n}`);
    }
    db.close();
    writeFileSync("/tmp/chain-parity.txt", out.join("\n"));
    rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  }, 60000);
});
