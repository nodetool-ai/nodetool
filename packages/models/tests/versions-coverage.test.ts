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
