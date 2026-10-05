import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { closeDb, initPostgresDb } from "../src/db.js";
import { RUN_TRACES_DDL } from "../src/migrations/run-traces.js";
import { resolveRunReader, queryRunReaders, queryRunReaderSpans, queryRunReaderGenerationCosts, queryRunReaderAppContent, queryRunReaderAppContentPresent } from "../src/run-readers.js";
import { migrations } from "../src/migrations/versions.js";
import { PostgresJsMigrationAdapter } from "../src/migrations/db-adapter.js";
import { deleteRunTrace } from "../src/run-trace.js";
import { Job } from "../src/job.js";

const connectionUrl = process.env["NODETOOL_TEST_POSTGRES_URL"];
describe.skipIf(!connectionUrl)("run readers on actual PostgreSQL", () => {
  it("applies owner, compact parent, content projection and cursor queries in PostgreSQL", async () => {
    if (!connectionUrl) { throw new Error("PostgreSQL URL absent"); }
    const name = `run_readers_${randomBytes(6).toString("hex")}`; const admin = postgres(connectionUrl, { max: 1 }); let client: ReturnType<typeof postgres> | undefined;
    try {
      await admin.unsafe(`CREATE DATABASE ${name}`); const url = new URL(connectionUrl); url.pathname = `/${name}`;
      client = postgres(url.toString(), { max: 1 });
      for (const statement of RUN_TRACES_DDL) { await client.unsafe(statement); }
      await client.unsafe("CREATE TABLE nodetool_predictions (id text PRIMARY KEY,user_id text,job_id text,provider text,cost real,asset_ids text,status text)");
      await client.unsafe("CREATE TABLE nodetool_generation_attachments (generation_id text,target_type text,target_id text)");
      await client.unsafe("CREATE TABLE nodetool_assets (id text PRIMARY KEY,user_id text,content_type text)");
      await client.unsafe(`CREATE TABLE nodetool_jobs (
        id text PRIMARY KEY,user_id text,job_type text,workflow_id text,project_id text,status text,name text,
        graph text,params text,worker_id text,heartbeat_at text,started_at text,finished_at text,completed_at text,
        failed_at text,error text,error_message text,cost real,logs text,retry_count integer,max_retries integer,
        version integer,execution_strategy text,execution_id text,runner_instance text,metadata_json text,
        created_at text,updated_at text)`);
      await client.unsafe("CREATE TABLE application_invocations (id text PRIMARY KEY,user_id text,inputs text,outputs text,instance_id text,operation_id text,version integer,application_id text,actual_usd real,known_llm_usd real,status text,origin text,content_expired integer DEFAULT 0)");
      const runId = "1".repeat(32); const sourceId = "2".repeat(32); const parentId = "aabbccddeeff" + "3".repeat(20); const spanId = "4".repeat(16);
      await client.unsafe("INSERT INTO nodetool_run_traces (id,user_id,kind,source_id,canonical_root_id,trace_id,origin,started_at,parents) VALUES ($1,'owner','workflow',$2,$1,$1,'ui','2026-01-01T00:00:00.000Z',$3)", [runId, sourceId, JSON.stringify([{ kind: "workflow", id: parentId }])]);
      const record = { trace_id: runId, span_id: spanId, parent_span_id: null, name: "workflow.run", kind: "INTERNAL", start_time_ms: 0, end_time_ms: 1, duration_ms: 1, status: { code: "OK" }, attributes: {}, events: [], resource: {} };
      await client.unsafe("INSERT INTO nodetool_run_spans (id,user_id,run_id,trace_id,span_id,cursor,update_kind,metadata,content) VALUES ('span','owner',$1,$1,$2,1,'span_ended',$3,$4)", [runId,spanId,JSON.stringify(record),JSON.stringify({ attributes: { private: "Owner content" } })]);
      await client.unsafe("INSERT INTO nodetool_predictions (id,user_id,job_id,provider,cost) VALUES ('generation','owner',$1,'test',1.5)", [sourceId]);
      await client.unsafe("INSERT INTO nodetool_jobs (id,user_id) VALUES ($1,'owner'),($2,'foreign')", [sourceId, `${sourceId.slice(0, 12)}${"3".repeat(20)}`]);
      const marker = migrations.find((entry) => entry.version === "20261004_000003"); if (!marker) { throw new Error("Trace marker migration absent"); }
      const adapter = new PostgresJsMigrationAdapter(client); await marker.up(adapter); await adapter.commit(); await adapter.release();
      expect((await client.unsafe("SELECT has_run_trace FROM nodetool_jobs WHERE id=$1", [sourceId]))[0]?.has_run_trace).toBe(1);
      await closeDb(); await initPostgresDb(url.toString());
      expect((await Job.find("owner", sourceId.slice(0, 12)))?.id).toBe(sourceId);
      expect(await Job.find("foreign", sourceId)).toBeNull();
      const collisionId = `${sourceId.slice(0, 12)}${"4".repeat(20)}`;
      await client.unsafe("INSERT INTO nodetool_jobs (id,user_id) VALUES ($1,'owner')", [collisionId]);
      await expect(Job.find("owner", sourceId.slice(0, 12))).rejects.toThrow(/more than one row/);
      await client.unsafe("DELETE FROM nodetool_jobs WHERE id=$1", [collisionId]);
      const run = await resolveRunReader("owner", sourceId.slice(0, 12)); if (!run) { throw new Error("PostgreSQL fixture absent"); }
      expect(run.id).toBe(runId); expect(await resolveRunReader("foreign", sourceId)).toBeNull();
      expect(await queryRunReaders("owner", { workflow_id: parentId.slice(0, 12), kind: "workflow" })).toHaveLength(1);
      expect((await queryRunReaderSpans("owner", run))[0]).toMatchObject({ content: null, has_content: true, span_id: spanId });
      expect((await queryRunReaderSpans("owner", run, { includeContent: true, spanIds: [spanId] }))[0]?.content).toEqual({ attributes: { private: "Owner content" } });
      expect(await queryRunReaderSpans("owner", run, { cursor: 1 })).toEqual([]);
      expect(await queryRunReaderSpans("foreign", run, { includeContent: true })).toEqual([]);
      expect(await queryRunReaderGenerationCosts("owner", run, [])).toEqual([{ id: "generation", provider: "test", cost: 1.5 }]);
      await client.unsafe("INSERT INTO application_invocations (id,user_id,inputs,outputs) VALUES ('app-source','owner',$1,$2)", [JSON.stringify({ prompt: "Owner input" }), JSON.stringify({ answer: "Owner output" })]);
      const appRun = { ...run, kind: "app" as const, source_id: "app-source" };
      expect(await queryRunReaderAppContentPresent("owner", appRun)).toBe(true);
      expect(await queryRunReaderAppContent("owner", appRun)).toEqual({ inputs: { prompt: "Owner input" }, outputs: { answer: "Owner output" }, content_limited: false });
      expect(await queryRunReaderAppContent("foreign", appRun)).toEqual({ inputs: null, outputs: null, content_limited: false });
      expect(await queryRunReaderAppContent("owner", { ...appRun, origin: "public" })).toEqual({ inputs: null, outputs: null, content_limited: false });
      expect(await queryRunReaderAppContent("owner", { ...appRun, content_expired: 1 })).toEqual({ inputs: null, outputs: null, content_limited: false });
      await client.unsafe("UPDATE application_invocations SET inputs=$1,outputs=$2 WHERE id='app-source'", ["{" + "malformed oversized JSON ".repeat(5_000), JSON.stringify({ unicode: "🙂".repeat(9_000) })]);
      expect(await queryRunReaderAppContent("owner", appRun)).toEqual({ inputs: null, outputs: null, content_limited: true });
      await client.unsafe("UPDATE nodetool_jobs SET has_run_trace=0 WHERE id=$1", [sourceId]);
      await deleteRunTrace("owner", run.id);
      expect((await client.unsafe("SELECT has_run_trace FROM nodetool_jobs WHERE id=$1", [sourceId]))[0]?.has_run_trace).toBe(1);
    } finally {
      await closeDb(); if (client) { await client.end(); }
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end();
    }
  });
});
