import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { createPostgresRepositoryFromDatabase } from "../src/index.js";

describe("PostgreSQL repository on the real embedded PostgreSQL engine", () => {
  it("persists unavailable nodes, respects owner scopes, and supports encrypted secrets and integer booleans", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lean-pg-"));
    let engine = new PGlite(directory);
    let repository = await createPostgresRepositoryFromDatabase(drizzle(engine), () => engine.close());
    const graph = { nodes: [{ id: "node", type: "optional.Missing", properties: { preserve: [false, 0] } }], edges: [] };
    try {
      const workflow = await repository.put("workflows", "alice", { graph, name: "stored", receive_clipboard: false });
      expect(workflow.id).toMatch(/^[0-9a-f]{32}$/);
      await repository.close();
      engine = new PGlite(directory);
      repository = await createPostgresRepositoryFromDatabase(drizzle(engine), () => engine.close());
      expect(await repository.get("workflows", "alice", workflow.id.slice(0, 12))).toMatchObject({ id: workflow.id, graph, receive_clipboard: false });
      expect(await repository.get("workflows", "bob", workflow.id)).toBeNull();
      await expect(repository.put("workflows", "bob", { id: workflow.id, graph: { nodes: [], edges: [] } })).rejects.toThrow("already owned");
      expect(await repository.delete("workflows", "bob", workflow.id)).toBe(false);
      expect(await repository.get("workflows", "alice", workflow.id)).toMatchObject({ graph });
      const asset = await repository.put("assets", "alice", { name: "binary", metadata: { binary: true }, favorite: true });
      expect(await repository.get("assets", "alice", asset.id)).toMatchObject({ metadata: { binary: true }, favorite: true });
      const secret = await repository.put("secrets", "alice", { key: "OPENAI_API_KEY", encrypted_value: "ciphertext" });
      expect(await repository.get("secrets", "bob", secret.id)).toBeNull();
      const job = await repository.put("jobs", "alice", { workflow_id: workflow.id, status: "running" });
      expect(await repository.put("jobs", "alice", { id: job.id, status: "cancelled" })).toMatchObject({ workflow_id: workflow.id, status: "cancelled" });
    } finally { await repository.close(); rmSync(directory, { recursive: true, force: true }); }
  }, 30_000);

  it("repairs historical tables and rejects ambiguous compact IDs", async () => {
    const engine = new PGlite();
    await engine.exec(`CREATE TABLE nodetool_assets (id TEXT PRIMARY KEY, user_id TEXT, metadata TEXT, created_at TEXT);
      INSERT INTO nodetool_assets VALUES ('legacy', 'alice', '{"sketchDocumentId":"sketch"}', 'created');`);
    const repository = await createPostgresRepositoryFromDatabase(drizzle(engine), () => engine.close());
    try {
      expect(await repository.get("assets", "alice", "legacy")).toMatchObject({ updated_at: "created", sketch_document_id: "sketch", favorite: false, project_id: "default" });
      for (const id of ["abcdef12345600000000000000000000", "abcdef12345611111111111111111111"]) {
        await repository.put("workflows", "alice", { id, graph: { nodes: [], edges: [] } });
      }
      await expect(repository.get("workflows", "alice", "abcdef123456")).rejects.toMatchObject({ code: "AMBIGUOUS_RESOURCE_ID" });
      const tables = await engine.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
      expect(tables.rows.map(row => row.table_name)).toEqual(["_nodetool_core_migrations", "nodetool_assets", "nodetool_jobs", "nodetool_secrets", "nodetool_workflows"]);
    } finally { await repository.close(); }
  }, 30_000);
  it("backfills job trace provenance only from the same owner", async () => {
    const engine = new PGlite();
    await engine.exec(`CREATE TABLE nodetool_jobs (id TEXT PRIMARY KEY, user_id TEXT, workflow_id TEXT, created_at TEXT, updated_at TEXT);
      INSERT INTO nodetool_jobs VALUES ('owned-job', 'alice', 'workflow', 'created', 'updated'), ('other-trace-job', 'alice', 'workflow', 'created', 'updated');
      CREATE TABLE nodetool_run_traces (kind TEXT, source_id TEXT, user_id TEXT);
      INSERT INTO nodetool_run_traces VALUES ('workflow', 'owned-job', 'alice'), ('workflow', 'other-trace-job', 'bob');`);
    const repository = await createPostgresRepositoryFromDatabase(drizzle(engine), () => engine.close());
    try {
      expect(await repository.get("jobs", "alice", "owned-job")).toMatchObject({ has_run_trace: 1 });
      expect(await repository.get("jobs", "alice", "other-trace-job")).toMatchObject({ has_run_trace: 0 });
    } finally { await repository.close(); }
  }, 30_000);

});
