import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig as sqliteConfig } from "drizzle-orm/sqlite-core";
import { PgTable, getTableConfig as pgConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as sq from "../src/schema/index.js";
import * as pg from "../src/schema-pg/index.js";
import { writeFileSync } from "node:fs";

describe("scratch pg", () => {
  it("measures", () => {
    const s = new Map<string, ReturnType<typeof sqliteConfig>>();
    for (const e of Object.values(sq)) if (is(e, SQLiteTable)) { const c = sqliteConfig(e); s.set(c.name, c); }
    const p = new Map<string, ReturnType<typeof pgConfig>>();
    for (const e of Object.values(pg)) if (is(e, PgTable)) { const c = pgConfig(e); p.set(c.name, c); }
    const out: string[] = [`sqlite=${s.size} pg=${p.size}`];
    for (const t of s.keys()) if (!p.has(t)) out.push(`TABLE only-sqlite ${t}`);
    for (const t of p.keys()) if (!s.has(t)) out.push(`TABLE only-pg ${t}`);
    for (const [t, sc] of s) {
      const pc = p.get(t); if (!pc) continue;
      const sm = new Map(sc.columns.map((c) => [c.name, c]));
      const pm = new Map(pc.columns.map((c) => [c.name, c]));
      for (const n of sm.keys()) if (!pm.has(n)) out.push(`COL only-sqlite ${t}.${n}`);
      for (const n of pm.keys()) if (!sm.has(n)) out.push(`COL only-pg ${t}.${n}`);
      for (const [n, scol] of sm) {
        const pcol = pm.get(n); if (!pcol) continue;
        if (scol.notNull !== pcol.notNull) out.push(`NN ${t}.${n} sqlite=${scol.notNull} pg=${pcol.notNull}`);
        if (scol.primary !== pcol.primary) out.push(`PK ${t}.${n} sqlite=${scol.primary} pg=${pcol.primary}`);
        if (scol.hasDefault !== pcol.hasDefault) out.push(`DFLT-has ${t}.${n} sqlite=${scol.hasDefault} pg=${pcol.hasDefault}`);
        else if (scol.hasDefault && String(scol.default) !== String(pcol.default)) out.push(`DFLT ${t}.${n} sqlite=${String(scol.default)} pg=${String(pcol.default)}`);
      }
      const si = new Set(sc.indexes.map((i) => i.config.name));
      const pi = new Set(pc.indexes.map((i) => i.config.name));
      for (const n of si) if (!pi.has(n)) out.push(`IDX only-sqlite ${t}.${n}`);
      for (const n of pi) if (!si.has(n)) out.push(`IDX only-pg ${t}.${n}`);
    }
    writeFileSync("/tmp/pg-parity.txt", out.join("\n"));
    expect(true).toBe(true);
  });
});
