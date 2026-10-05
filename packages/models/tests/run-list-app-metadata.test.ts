import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getPortableDb, initTestDb } from "../src/db.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";
import { applicationInvocations } from "../src/schema/application-budgets.js";
import { runTraces } from "../src/schema/run-traces.js";
import { queryRunReaders, queryRunReaderAppMetadata } from "../src/run-readers.js";

for (const dialect of ["sqlite", "postgres"] as const) {
  describe(`app list metadata on ${dialect}`, () => {
    beforeEach(async () => { if (dialect === "sqlite") { initTestDb(); } else { await initPgliteTestDb(); } });
    afterEach(async () => { await closeDb(); });
    it("projects only owned invocation metadata and filters exact operation ids", async () => {
      const db = getPortableDb();
      const started = "2026-01-01T00:00:00.000Z";
      await db.insert(applicationInvocations).values([
        { id: "owned-source", user_id: "owner", invocation_id: "owned", operation_id: "abcdef012345", created_at: started, version: 4 },
        { id: "foreign-source", user_id: "foreign", invocation_id: "foreign", operation_id: "abcdef012345", created_at: started }
      ]);
      for (const [id, source_id] of [["a".repeat(32), "owned-source"], ["b".repeat(32), "foreign-source"], ["c".repeat(32), "legacy-source"]]) {
        await db.insert(runTraces).values({ id, user_id: "owner", kind: "app", source_id, canonical_root_id: id, trace_id: id, origin: "ui", started_at: started, parents: [] });
      }
      await db.update(applicationInvocations).set({ inputs: sql`'invalid JSON'`, outputs: sql`'invalid JSON'`, snapshot: sql`'invalid JSON'` });
      const rows = await queryRunReaders("owner", { kind: "app", operation_id: "abcdef012345", limit: 1 });
      expect(rows).toHaveLength(1);
      const run = rows[0]; if (!run) { throw new Error("Missing fixture"); }
      expect(run.app).toEqual({ instance_id: null, operation_id: "abcdef012345", application_id: null, app_version: 4 });
      expect(run.app).toEqual(await queryRunReaderAppMetadata("owner", run));
      expect(await queryRunReaders("owner", { operation_id: "abcdef01234" })).toEqual([]);
      expect(await queryRunReaders("foreign", { operation_id: "abcdef012345" })).toEqual([]);
      const all = await queryRunReaders("owner", {});
      expect(all.filter((row) => row.app === undefined)).toHaveLength(2);
      expect(JSON.stringify(all)).not.toContain("inputs");
    });
  });
}
