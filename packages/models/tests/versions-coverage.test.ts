import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  SQLiteMigrationAdapter,
  MigrationRunner,
  migrations
} from "../src/migrations/index.js";

function createAdapter(): SQLiteMigrationAdapter {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  return new SQLiteMigrationAdapter(db);
}

describe("built-in migration versions", () => {
  let adapter: SQLiteMigrationAdapter;

  beforeEach(() => {
    adapter = createAdapter();
  });

  it("every migration re-runs its up() idempotently against a migrated DB", async () => {
    const runner = new MigrationRunner(adapter);
    await runner.migrate();

    // Re-invoking each up() directly must not throw — this drives the
    // "column/table/index already exists" guard branches (the false side of
    // the `if (!columnExists/…)` checks and the try/catch swallow blocks).
    for (const migration of migrations) {
      await expect(migration.up(adapter)).resolves.toBeUndefined();
    }

    // Core tables still present after the repeated ups.
    expect(await adapter.tableExists("nodetool_workflows")).toBe(true);
    expect(await adapter.tableExists("nodetool_settings")).toBe(true);
  });

  it("rolls back every migration via down(), dropping created tables", async () => {
    const runner = new MigrationRunner(adapter);
    await runner.migrate();

    const rolledBack = await runner.rollback(migrations.length);
    expect(rolledBack.length).toBe(migrations.length);

    // Tables created by migrations with a real down() are gone.
    for (const table of [
      "nodetool_workflows",
      "nodetool_assets",
      "nodetool_threads",
      "nodetool_messages",
      "nodetool_jobs",
      "nodetool_predictions",
      "nodetool_secrets",
      "nodetool_settings",
      "run_state",
      "run_events",
      "run_leases",
      "timeline_sequences",
      "image_documents",
      "worker_profiles",
      "worker_instances",
      "trigger_registrations"
    ]) {
      expect(await adapter.tableExists(table)).toBe(false);
    }
  });

  it("individual down() calls are safe to invoke directly on an empty DB", async () => {
    // Most down() bodies are DROP INDEX/TABLE IF EXISTS or no-ops, so calling
    // them without the tables present must not throw.
    for (const migration of migrations) {
      await expect(migration.down(adapter)).resolves.toBeUndefined();
    }
  });

  it("re-migrating after a full rollback rebuilds the schema", async () => {
    const runner = new MigrationRunner(adapter);
    await runner.migrate();
    await runner.rollback(migrations.length);

    const secondApply = await runner.migrate();
    expect(secondApply.length).toBe(migrations.length);
    expect(await adapter.tableExists("nodetool_settings")).toBe(true);
  });

  it("downgrades app runs without losing saved-app billing or media", async () => {
    const runner = new MigrationRunner(adapter);
    await runner.migrate();
    await adapter.execute(`INSERT INTO applications
      (id,user_id,project_id,name,document,created_at,updated_at)
      VALUES ('app','u1','p1','App','{}','old','old')`);
    await adapter.execute(`INSERT INTO app_instances
      (id,user_id,application_id,source_id,name,snapshot,variables,created_at,updated_at)
      VALUES ('instance','u1','app','app','Default','{}','{}','old','old')`);
    await adapter.execute(`INSERT INTO application_invocations
      (id,application_id,user_id,invocation_id,estimated_usd,actual_usd,status,created_at,settled_at,instance_id,inputs)
      VALUES ('saved','app','u1','inv-saved',3,2,'completed','old','new','instance','{"prompt":"private"}'),
             ('inline',NULL,'u1','inv-inline',1,NULL,'running','old',NULL,'instance','{}')`);
    await adapter.execute("INSERT INTO nodetool_assets (id,user_id) VALUES ('asset','u1')");
    await adapter.execute("INSERT INTO nodetool_predictions (id,user_id) VALUES ('generation','u1')");
    await adapter.execute(`INSERT INTO nodetool_generation_attempts
      (id,generation_id,provider,created_at,updated_at) VALUES ('attempt','generation','test','old','old')`);
    await adapter.execute(`INSERT INTO nodetool_generation_outputs
      (id,generation_id,attempt_id,output_key,asset_id,created_at,updated_at)
      VALUES ('output','generation','attempt','result','asset','old','old')`);
    await adapter.execute(`INSERT INTO nodetool_generation_attachments
      (id,generation_id,output_id,target_type,target_id,created_at,updated_at)
      VALUES ('attachment','generation','output','app_run','saved','old','old')`);
    const migration = migrations.find((item) => item.version === "20261004_000000")!;
    await migration.up(adapter);
    expect(await adapter.fetchone("SELECT inputs FROM application_invocations WHERE id='saved'"))
      .toEqual({ inputs: '{"prompt":"private"}' });
    await migration.down(adapter);
    expect(await adapter.tableExists("app_instances")).toBe(false);
    expect(await adapter.columnExists("application_invocations", "inputs")).toBe(false);
    expect(await adapter.fetchall("SELECT id,actual_usd,estimated_usd,status FROM application_invocations"))
      .toEqual([{ id: "saved", actual_usd: 2, estimated_usd: 3, status: "completed" }]);
    expect(await adapter.fetchall("SELECT id FROM nodetool_generation_attachments")).toEqual([]);
    for (const table of ["nodetool_assets", "nodetool_predictions", "nodetool_generation_outputs"]) {
      expect(await adapter.fetchone(`SELECT count(*) AS n FROM ${table}`)).toEqual({ n: 1 });
    }
    await expect(adapter.execute(`INSERT INTO application_invocations
      (id,application_id,invocation_id,created_at) VALUES ('rejected',NULL,'inv','old')`)).rejects.toThrow();
    await migration.up(adapter);
    expect(await adapter.fetchone("SELECT actual_usd FROM application_invocations WHERE id='saved'"))
      .toEqual({ actual_usd: 2 });
    expect(await adapter.columnExists("application_invocations", "instance_id")).toBe(true);
  });

  it("backfills sketch_document_id from legacy metadata JSON", async () => {
    // Apply migrations up to (but not including) the sketch backfill so we can
    // seed a legacy row, then run that migration's up() to exercise the
    // json_extract backfill branch.
    const runner = new MigrationRunner(adapter);
    const backfill = migrations.find(
      (m) => m.name === "add_sketch_document_id_to_assets"
    )!;
    await runner.migrate({ target: "20260601_000001" });

    // Seed a row whose metadata carries the legacy sketchDocumentId key.
    await adapter.execute(
      "INSERT INTO nodetool_assets (id, user_id, metadata) VALUES (?, ?, ?)",
      ["a1", "u1", JSON.stringify({ sketchDocumentId: "sketch-123" })]
    );
    // And one with no sketch id in metadata.
    await adapter.execute(
      "INSERT INTO nodetool_assets (id, user_id, metadata) VALUES (?, ?, ?)",
      ["a2", "u2", JSON.stringify({ other: "x" })]
    );

    await backfill.up(adapter);

    const row1 = await adapter.fetchone(
      "SELECT sketch_document_id FROM nodetool_assets WHERE id = ?",
      ["a1"]
    );
    const row2 = await adapter.fetchone(
      "SELECT sketch_document_id FROM nodetool_assets WHERE id = ?",
      ["a2"]
    );
    expect(row1?.sketch_document_id).toBe("sketch-123");
    expect(row2?.sketch_document_id ?? null).toBeNull();
  });

  it("add_run_mode_to_workflows adds the column only when missing", async () => {
    const runner = new MigrationRunner(adapter);
    await runner.migrate({ target: "20250428_212009_006" });

    expect(await adapter.columnExists("nodetool_workflows", "run_mode")).toBe(
      false
    );
    const runMode = migrations.find(
      (m) => m.name === "add_run_mode_to_workflows"
    )!;
    await runMode.up(adapter);
    expect(await adapter.columnExists("nodetool_workflows", "run_mode")).toBe(
      true
    );
    // Second call takes the guard's false branch and is a no-op.
    await expect(runMode.up(adapter)).resolves.toBeUndefined();
  });

  it("add_storyboard_id_to_scripts adds the column only when missing", async () => {
    const runner = new MigrationRunner(adapter);
    await runner.migrate({ target: "20260812_000001" });

    expect(await adapter.columnExists("scripts", "storyboard_id")).toBe(false);
    const backPointer = migrations.find(
      (m) => m.name === "add_storyboard_id_to_scripts"
    )!;
    await backPointer.up(adapter);
    expect(await adapter.columnExists("scripts", "storyboard_id")).toBe(true);
    // Second call takes the guard's false branch and is a no-op.
    await expect(backPointer.up(adapter)).resolves.toBeUndefined();
  });

  it("column-guarded prediction migrations early-return when the table is absent", async () => {
    // On a totally empty DB (no nodetool_predictions), the tableExists guard
    // must short-circuit these ups without throwing.
    const guarded = migrations.filter((m) =>
      [
        "add_prediction_billing_fields",
        "add_prediction_node_type",
        "add_prediction_provider_request_id"
      ].includes(m.name)
    );
    expect(guarded.length).toBe(3);
    for (const m of guarded) {
      await expect(m.up(adapter)).resolves.toBeUndefined();
    }
    expect(await adapter.tableExists("nodetool_predictions")).toBe(false);
  });

  it("every migration def carries a version, name and table metadata arrays", () => {
    for (const m of migrations) {
      expect(typeof m.version).toBe("string");
      expect(m.version.length).toBeGreaterThan(0);
      expect(typeof m.name).toBe("string");
      expect(Array.isArray(m.createsTables)).toBe(true);
      expect(Array.isArray(m.modifiesTables)).toBe(true);
    }
  });
});
