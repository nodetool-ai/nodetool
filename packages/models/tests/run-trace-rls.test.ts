import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { PostgresJsMigrationAdapter } from "../src/migrations/db-adapter.js";
import { closeDb, initPostgresDb } from "../src/db.js";
import { writeRunTraceUpdate, listRunTraceRecords, registerRunTraceParents, eraseRunTraceParentContent, deleteRunTrace, pruneRunTraces } from "../src/run-trace.js";
import { migrations } from "../src/migrations/versions.js";
import { threadHasTraceContentTools } from "../src/trace-provenance.js";
import { pruneAppRuns } from "../src/app-instance.js";

const connectionUrl = process.env["NODETOOL_TEST_POSTGRES_URL"];
const owner = "11111111-1111-1111-1111-111111111111";
const foreign = "22222222-2222-2222-2222-222222222222";

describe.skipIf(!connectionUrl)("run trace migration PostgreSQL RLS", () => {
  it("grants only owner reads and rejects anonymous and client writes under non-bypass roles", async () => {
    if (!connectionUrl) { throw new Error("NODETOOL_TEST_POSTGRES_URL is required"); }
    const database = `nodetool_trace_test_${randomBytes(6).toString("hex")}`;
    const admin = postgres(connectionUrl, { max: 1 });
    let client: ReturnType<typeof postgres> | undefined;
    let adapter: PostgresJsMigrationAdapter | undefined;
    try {
      await admin.unsafe(`CREATE DATABASE ${database}`);
      const url = new URL(connectionUrl); url.pathname = `/${database}`;
      client = postgres(url.toString(), { max: 2 });
      await client.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
      END $$`);
      const roles = await client.unsafe("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('authenticated','anon')");
      expect(roles).toHaveLength(2); expect(roles.every((role) => !role.rolsuper && !role.rolbypassrls)).toBe(true);
      await client.unsafe("CREATE SCHEMA auth");
      await client.unsafe("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$");
      await client.unsafe("GRANT USAGE ON SCHEMA auth, public TO authenticated, anon");
      adapter = new PostgresJsMigrationAdapter(client);
      const migration = migrations.find((entry) => entry.version === "20261004_000001");
      expect(migration).toBeDefined(); if (!migration) { throw new Error("Trace migration absent"); }
      await migration.up(adapter); await adapter.commit(); await adapter.release(); adapter = undefined;
      for (const [index, userId] of [owner, foreign].entries()) {
        const id = String(index).padStart(32, "a"); const traceId = String(index).padStart(32, "b");
        await client.unsafe("INSERT INTO nodetool_run_traces (id,user_id,kind,source_id,canonical_root_id,trace_id,origin,started_at,parents) VALUES ($1,$2,'workflow',$1,$1,$3,'ui','2020-01-01','[]')", [id,userId,traceId]);
        await client.unsafe("INSERT INTO nodetool_run_spans (id,user_id,run_id,trace_id,span_id,cursor,update_kind,metadata,content) VALUES ($1,$2,$1,$3,$4,1,'span_ended','{}','{\"prompt\":\"owner only\"}')", [id,userId,traceId,String(index).padStart(16,"c")]);
      }
      const tables = ["nodetool_run_traces", "nodetool_run_spans"];
      for (const table of tables) {
        const readOwner = await client.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE authenticated"); await tx.unsafe("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
          return tx.unsafe(`SELECT user_id FROM ${table}`);
        });
        expect(readOwner.map((row) => row.user_id)).toEqual([owner]);
        const readForeign = await client.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE authenticated"); await tx.unsafe("SELECT set_config('request.jwt.claim.sub',$1,true)", [foreign]);
          return tx.unsafe(`SELECT user_id FROM ${table}`);
        });
        expect(readForeign.map((row) => row.user_id)).toEqual([foreign]);
        await expect(client.begin(async (tx) => { await tx.unsafe("SET LOCAL ROLE anon"); return tx.unsafe(`SELECT * FROM ${table}`); })).rejects.toMatchObject({ code: "42501" });
        for (const statement of [`DELETE FROM ${table}`, `UPDATE ${table} SET user_id = '${foreign}'`, `INSERT INTO ${table} (id) VALUES ('denied')`]) {
          await expect(client.begin(async (tx) => { await tx.unsafe("SET LOCAL ROLE authenticated"); await tx.unsafe("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]); return tx.unsafe(statement); })).rejects.toMatchObject({ code: "42501" });
        }
      }
      const enabled = await client.unsafe("SELECT relrowsecurity FROM pg_class WHERE relname IN ('nodetool_run_traces','nodetool_run_spans')");
      expect(enabled).toHaveLength(2); expect(enabled.every((row) => row.relrowsecurity)).toBe(true);
      await client.unsafe("CREATE TABLE nodetool_jobs (id text PRIMARY KEY, user_id text NOT NULL, has_run_trace integer NOT NULL DEFAULT 0)");
      await client.unsafe("CREATE TABLE nodetool_messages (id text PRIMARY KEY, user_id text NOT NULL, thread_id text, name text, tool_calls text, content text, created_at text, tools text, execution_event_type text)");
      await client.unsafe("CREATE TABLE nodetool_workflows (id text PRIMARY KEY, user_id text NOT NULL)");
      await client.unsafe("INSERT INTO nodetool_jobs (id,user_id) SELECT source_id,user_id FROM nodetool_run_traces");
      await client.unsafe("INSERT INTO nodetool_messages (id,user_id) VALUES ('copied-message',$1)", [owner]);
      await closeDb(); await initPostgresDb(url.toString());
      const provenanceCases = [
        { name: "email", calls: null, expected: true },
        { name: "email.search", calls: [{ name: "google-extra" }], expected: false },
        { name: null, calls: [{ name: "email" }], expected: true },
        { name: null, calls: [{ function: { name: "browser" } }], expected: true },
        { name: null, calls: [null, "email", 1, false, ["email"], { function: "email" }], expected: false },
        { name: null, calls: [null, "email", { function: { name: "google" } }], expected: true }
      ];
      for (const [index, entry] of provenanceCases.entries()) {
        const threadId = `provenance-${index}`;
        await client.unsafe("INSERT INTO nodetool_messages (id,user_id,thread_id,name,tool_calls,content,created_at) VALUES ($1,$2,$3,$4,$5,'email google browser','2020-01-01')", [threadId, owner, threadId, entry.name, entry.calls === null ? null : JSON.stringify(entry.calls)]);
        await client.unsafe("INSERT INTO nodetool_messages (id,user_id,thread_id,content,created_at) VALUES ($1,$2,$3,'Recent compacted summary','2026-01-01')", [`${threadId}-recent`, owner, threadId]);
        expect(await threadHasTraceContentTools(owner, threadId, ["email", "google", "browser"])).toBe(entry.expected);
        expect(await threadHasTraceContentTools(foreign, threadId, ["email", "google", "browser"])).toBe(false);
      }
      expect(await threadHasTraceContentTools(owner, "provenance-0", [])).toBe(false);
      await client.unsafe("INSERT INTO nodetool_messages (id,user_id,thread_id,name) VALUES ('deleted-tool',$1,'compacted','email')", [owner]);
      await client.unsafe("INSERT INTO nodetool_messages (id,user_id,thread_id,content,tools,execution_event_type) VALUES ('compacted',$1,'compacted','Third-party summary','[\"email\"]','compaction')", [owner]);
      await client.unsafe("DELETE FROM nodetool_messages WHERE id = 'deleted-tool'");
      expect(await threadHasTraceContentTools(owner, "compacted", ["email"])).toBe(true);
      expect(await threadHasTraceContentTools(foreign, "compacted", ["email"])).toBe(false);
      expect(await threadHasTraceContentTools(owner, "compacted", ["email.search"])).toBe(false);
      await client.unsafe("INSERT INTO nodetool_messages (id,user_id,thread_id,tools) VALUES ('ordinary',$1,'ordinary','[\"email\"]')", [owner]);
      expect(await threadHasTraceContentTools(owner, "ordinary", ["email"])).toBe(false);
      const runId = "0".padStart(32, "a"); const traceId = "0".padStart(32, "b");
      await client.unsafe("DELETE FROM nodetool_run_spans");
      const update = { kind: "span_ended" as const, record: {
        trace_id: traceId, span_id: "1234567890abcdef", parent_span_id: null, name: "workflow.run", kind: "INTERNAL" as const,
        start_time_ms: 1, end_time_ms: 4, duration_ms: 3, status: { code: "OK" as const },
        attributes: { "llm.request.messages": "stored PostgreSQL prompt" }, events: [{ id: "event:1", name: "log", time_ms: 2, attributes: { "log.message": "stored log" } }], resource: {}
      } };
      await writeRunTraceUpdate(owner, runId, update, { isRoot: true });
      await writeRunTraceUpdate(owner, runId, update);
      const stored = await listRunTraceRecords(owner, runId);
      expect(stored.records).toHaveLength(1); expect(stored.records[0]?.record.events).toHaveLength(1);
      expect(stored.records[0]?.record.attributes["llm.request.messages"]).toBe("stored PostgreSQL prompt");
      await client.unsafe("INSERT INTO nodetool_workflows (id,user_id) VALUES ('shared-workflow',$1)", [foreign]);
      await registerRunTraceParents(owner, runId, [{ kind: "workflow", id: "shared-workflow" }]);
      const beforeDeletion = (await listRunTraceRecords(owner, runId)).cursor;
      const pending = await client.begin(async (tx) => {
        await tx.unsafe("SELECT id FROM nodetool_run_traces WHERE id = $1 FOR UPDATE", [runId]);
        const writing = writeRunTraceUpdate(owner, runId, { ...update, record: { ...update.record, span_id: "2234567890abcdef" } });
        await tx.unsafe("DELETE FROM nodetool_workflows WHERE id = 'shared-workflow'");
        return { writing };
      });
      await pending.writing;
      const afterDeletion = await listRunTraceRecords(owner, runId, { cursor: beforeDeletion });
      expect(afterDeletion.records).toHaveLength(2);
      expect(afterDeletion.records.every((record) => record.content_expired)).toBe(true);
      expect(JSON.stringify(afterDeletion)).not.toContain("stored PostgreSQL prompt");
      await registerRunTraceParents(owner, runId, [{ kind: "message", id: "copied-message" }]);
      await eraseRunTraceParentContent(owner, { kind: "message", id: "copied-message" });
      expect((await listRunTraceRecords(owner, runId)).records[0]?.content_expired).toBe(true);
      await writeRunTraceUpdate(owner, runId, update);
      expect((await listRunTraceRecords(owner, runId)).records[0]?.record.attributes["llm.request.messages"]).toBeUndefined();
      await deleteRunTrace(owner, runId);
      expect(await client.unsafe("SELECT id FROM nodetool_run_spans WHERE user_id = $1", [owner])).toHaveLength(0);
      const stuckId = "d".repeat(32); const stuckTraceId = "e".repeat(32);
      await client.unsafe("INSERT INTO nodetool_jobs (id,user_id) VALUES ($1,$2)", [stuckId, owner]);
      await client.unsafe("INSERT INTO nodetool_run_traces (id,user_id,kind,source_id,canonical_root_id,trace_id,origin,started_at,parents) VALUES ($1,$2,'workflow',$1,$1,$3,'ui','2020-01-01','[]')", [stuckId,owner,stuckTraceId]);
      await writeRunTraceUpdate(owner, stuckId, { ...update, record: { ...update.record, trace_id: stuckTraceId } });
      await pruneRunTraces(owner, "2021-01-01", "2021-01-01");
      expect((await listRunTraceRecords(owner, stuckId)).records[0]?.content_expired).toBe(true);
      expect(await client.unsafe("SELECT status FROM nodetool_run_traces WHERE id = $1", [stuckId])).toEqual([{ status: "running" }]);
      await client.unsafe("CREATE TABLE application_invocations (id text PRIMARY KEY,user_id text,application_id text,instance_id text,created_at text,settled_at text,status text,snapshot text,inputs text,outputs text,documents text,content_expired integer DEFAULT 0)");
      await client.unsafe("INSERT INTO application_invocations (id,user_id,instance_id,created_at,status,snapshot,inputs,outputs,documents) VALUES ('stuck-app',$1,'instance','2020-01-01','running','{}','{}','{}','[]')", [owner]);
      await pruneAppRuns(owner, "2021-01-01", "2021-01-01");
      expect(await client.unsafe("SELECT status,snapshot,inputs,outputs,documents,content_expired FROM application_invocations WHERE id = 'stuck-app'")).toEqual([{ status: "running", snapshot: null, inputs: null, outputs: null, documents: null, content_expired: 1 }]);

    } finally {
      await closeDb(); await adapter?.release(); await client?.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${database}`); await admin.end();
    }
  }, 30_000);
});
