import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getPortableDb, initTestDb } from "../src/db.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";
import { applicationInvocations } from "../src/schema/application-budgets.js";
import { runTraces } from "../src/schema/run-traces.js";
import { queryRunReaders, queryRunReaderAppMetadata, queryRunReaderDocuments } from "../src/run-readers.js";
import { predictions } from "../src/schema/predictions.js";
import { assets } from "../src/schema/assets.js";
import { generationAttachments } from "../src/schema/generation-attachments.js";
import { generationAttempts } from "../src/schema/generation-attempts.js";
import { generationOutputs } from "../src/schema/generation-outputs.js";
import { runSpans } from "../src/schema/run-traces.js";

for (const dialect of ["sqlite", "postgres"] as const) {
  describe(`app list metadata on ${dialect}`, () => {
    beforeEach(async () => { if (dialect === "sqlite") { initTestDb(); } else { await initPgliteTestDb(); } }, 60_000);
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
      expect(run.app).toMatchObject({ instance_id: null, operation_id: "abcdef012345", application_id: null, app_version: 4 });
      expect(run.app).toEqual(await queryRunReaderAppMetadata("owner", run));
      expect(await queryRunReaders("owner", { operation_id: "abcdef01234" })).toEqual([]);
      expect(await queryRunReaders("foreign", { operation_id: "abcdef012345" })).toEqual([]);
      const all = await queryRunReaders("owner", {});
      expect(all.filter((row) => row.app === undefined)).toHaveLength(2);
      expect(JSON.stringify(all)).not.toContain("inputs");
    });
    it("refreshes settled cost and media while excluding foreign, visitor, expired and restricted content", async () => {
      const db = getPortableDb(); const started = "2026-01-01T00:00:00.000Z"; const id = "d".repeat(32);
      await db.insert(applicationInvocations).values({ id: "source", user_id: "owner", invocation_id: "history", operation_id: "run", status: "completed", known_llm_usd: 0, created_at: started, documents: Array.from({ length: 150 }, (_, i) => ({kind: "storyboard",id:`document-${i}`})) });
      await db.insert(runTraces).values({ id, user_id: "owner", kind: "app", source_id: "source", canonical_root_id: id, trace_id: id, origin: "ui", started_at: started, parents: [] });
      await db.insert(predictions).values({ id: "generation", user_id: "owner", status: "pending", asset_ids: ["foreign", "owned"] });
      await db.insert(assets).values([{ id: "foreign", user_id: "foreign", content_type: "image/png", created_at: started, updated_at: started }, { id: "owned", user_id: "owner", content_type: "image/png", created_at: started, updated_at: started }]);
      await db.insert(generationAttempts).values({ id: "attempt", generation_id: "generation", provider: "test", created_at: started, updated_at: started });
      await db.insert(generationOutputs).values({ id: "output", generation_id: "generation", attempt_id: "attempt", output_key: "result", asset_id: "owned", created_at: started, updated_at: started });
      await db.insert(generationAttachments).values({ id: "attachment", generation_id: "generation", output_id: "output", target_type: "app_run", target_id: "source", status: "attached", created_at: started, updated_at: started });
      const read = async () => { const row = (await queryRunReaders("owner", { operation_id: "run" }))[0]; if (!row) { throw new Error("Fixture absent"); } return row; };
      expect((await read()).app).toMatchObject({ actual_usd: null, cost_state: "unsettled", result_reference: null });
      await db.update(predictions).set({ status: "completed" });
      await db.update(applicationInvocations).set({ actual_usd: 0 });
      expect((await read()).app).toMatchObject({ actual_usd: 0, cost_state: "settled", result_reference: { type: "image", asset_id: "owned" } });
      const run = await read(); expect(await queryRunReaderDocuments("owner", run)).toHaveLength(101);
      expect((await queryRunReaderDocuments("owner", run))[0]).toEqual({ kind: "storyboard", id: "document-0" });
      for (const patch of [{ origin: "public" }, { origin: "ui", content_expired: 1 }]) {
        await db.update(applicationInvocations).set(patch);
        expect((await read()).app?.result_reference).toBeNull();
        expect(await queryRunReaderDocuments("owner", run)).toEqual([]);
      }
      await db.update(applicationInvocations).set({ origin: "ui", content_expired: 0, actual_usd: null, known_llm_usd: null });
      for (const patch of [{ origin: "public" }, { origin: "ui", content_expired: 1 }]) {
        await db.update(runTraces).set(patch);
        const hidden = await read(); expect(hidden.app?.result_reference).toBeNull();
        expect(await queryRunReaderDocuments("owner", hidden)).toEqual([]);
      }
      await db.update(runTraces).set({ origin: "ui", content_expired: 0 });
      expect((await read()).app?.cost_state).toBe("unavailable");
      await db.insert(runSpans).values({ id: "restricted", user_id: "owner", run_id: id, trace_id: id, span_id: "1".repeat(16), cursor: 1, update_kind: "span_ended", metadata: { trace_id: id, span_id: "1".repeat(16), parent_span_id: null, name: "tool.call", kind: "INTERNAL", start_time_ms: 0, end_time_ms: 1, duration_ms: 1, status: { code: "OK" }, attributes: { "tool.module": "email" }, events: [], resource: {} } });
      expect((await read()).app?.result_reference).toBeNull();
      expect(await queryRunReaderDocuments("owner", run)).toEqual([]);
      await db.delete(runSpans).where(eq(runSpans.id, "restricted"));
      await db.update(predictions).set({ user_id: "foreign" });
      expect((await read()).app?.result_reference).toBeNull();
    });
  });
}
