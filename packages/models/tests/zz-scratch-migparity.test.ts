import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { initDb, migrateSqliteDb, closeDb } from "../src/db.js";

type Col = { type: string; notNull: boolean; pk: boolean; dflt: string | null };

function dump(path: string) {
  const db = new Database(path, { readonly: true });
  const tables = (
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name);
  const out = new Map<
    string,
    { cols: Map<string, Col>; idx: Map<string, string>; fks: number }
  >();
  for (const t of tables) {
    const cols = new Map<string, Col>();
    for (const r of db
      .prepare(`SELECT name,type,"notnull" nn,dflt_value d,pk FROM pragma_table_info(?)`)
      .all(t) as Array<Record<string, never>>) {
      const row = r as unknown as {
        name: string; type: string; nn: number; d: string | null; pk: number;
      };
      cols.set(row.name, {
        type: row.type.toLowerCase(),
        notNull: row.nn === 1,
        pk: row.pk > 0,
        dflt: row.d
      });
    }
    const idx = new Map<string, string>();
    for (const r of db.prepare(`SELECT name,"unique" u FROM pragma_index_list(?)`).all(t) as Array<{ name: string; u: number }>) {
      if (r.name.startsWith("sqlite_autoindex")) continue;
      const cs = (db.prepare(`SELECT name FROM pragma_index_info(?)`).all(r.name) as Array<{ name: string }>).map((c) => c.name);
      idx.set(r.name, `${r.u}:${cs.join(",")}`);
    }
    const fks = (db.prepare(`SELECT * FROM pragma_foreign_key_list(?)`).all(t) as unknown[]).length;
    out.set(t, { cols, idx, fks });
  }
  db.close();
  return out;
}

describe("scratch", () => {
  it("measures drift", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nt-parity-"));
    const freshPath = join(dir, "fresh.sqlite3");
    const migPath = join(dir, "mig.sqlite3");

    await closeDb();
    initDb(freshPath);
    await closeDb();

    await migrateSqliteDb(migPath);
    const beforeRepair = dump(migPath);
    initDb(migPath);
    await closeDb();

    const fresh = dump(freshPath);
    const repaired: string[] = [];
    for (const [t, f] of fresh) {
      const b = beforeRepair.get(t);
      if (!b) { repaired.push(`TABLE ${t}`); continue; }
      for (const c of f.cols.keys()) if (!b.cols.has(c)) repaired.push(`COL ${t}.${c}`);
      for (const i of f.idx.keys()) if (!b.idx.has(i)) repaired.push(`IDX ${t}.${i}`);
    }
    (await import("node:fs")).writeFileSync("/tmp/parity-repaired.txt", repaired.join("\n"));
    const mig = dump(migPath);

    const diffs: string[] = [];
    for (const t of fresh.keys()) if (!mig.has(t)) diffs.push(`TABLE only-in-fresh ${t}`);
    for (const t of mig.keys()) if (!fresh.has(t)) diffs.push(`TABLE only-in-migrated ${t}`);
    for (const [t, f] of fresh) {
      const m = mig.get(t);
      if (!m) continue;
      for (const [c, fc] of f.cols) {
        const mc = m.cols.get(c);
        if (!mc) { diffs.push(`COL missing ${t}.${c}`); continue; }
        if (fc.type !== mc.type) diffs.push(`TYPE ${t}.${c} fresh=${fc.type} mig=${mc.type}`);
        if (fc.notNull !== mc.notNull) diffs.push(`NN ${t}.${c} fresh=${fc.notNull} mig=${mc.notNull}`);
        if (fc.pk !== mc.pk) diffs.push(`PK ${t}.${c} fresh=${fc.pk} mig=${mc.pk}`);
        if ((fc.dflt ?? null) !== (mc.dflt ?? null)) diffs.push(`DFLT ${t}.${c} fresh=${fc.dflt} mig=${mc.dflt}`);
      }
      for (const c of m.cols.keys()) if (!f.cols.has(c)) diffs.push(`COL extra ${t}.${c}`);
      for (const [i, v] of f.idx) {
        const mv = m.idx.get(i);
        if (mv === undefined) diffs.push(`IDX missing ${t}.${i}`);
        else if (mv !== v) diffs.push(`IDX ${t}.${i} fresh=${v} mig=${mv}`);
      }
      for (const i of m.idx.keys()) if (!f.idx.has(i)) diffs.push(`IDX extra ${t}.${i}`);
      if (f.fks !== m.fks) diffs.push(`FK ${t} fresh=${f.fks} mig=${m.fks}`);
    }
    (await import("node:fs")).writeFileSync("/tmp/parity-diff.txt", `${diffs.length}\n` + diffs.join("\n"));
    rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  }, 60000);
});
