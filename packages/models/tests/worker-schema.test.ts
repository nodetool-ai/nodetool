import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, migrateSqliteDb } from "../src/db.js";

/**
 * Task B1 — the worker_profiles and worker_instances tables must be created by
 * the package's migration routine, with the columns defined in spec §5.
 */
describe("worker tables migration", () => {
  let tempDir: string | null = null;

  beforeEach(async () => {
    await closeDb();
  });

  afterEach(async () => {
    await closeDb();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function columnNames(sqlite: Database.Database, table: string): string[] {
    return (
      sqlite.pragma(`table_info("${table}")`) as Array<{ name: string }>
    ).map((row) => row.name);
  }

  it("creates worker_profiles and worker_instances with the spec columns", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-workers-"));
    const dbPath = join(tempDir, "workers.sqlite");

    await migrateSqliteDb(dbPath);

    const sqlite = new Database(dbPath);
    try {
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('worker_profiles', 'worker_instances')"
        )
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name).sort();
      expect(tableNames).toEqual(["worker_instances", "worker_profiles"]);

      const profileCols = columnNames(sqlite, "worker_profiles");
      for (const col of [
        "id",
        "name",
        "target",
        "image",
        "spec",
        "token_policy",
        "idle_timeout_minutes",
        "max_lifetime_minutes",
        "created_at",
        "updated_at"
      ]) {
        expect(profileCols).toContain(col);
      }

      const instanceCols = columnNames(sqlite, "worker_instances");
      for (const col of [
        "id",
        "profile_name",
        "target",
        "provider_ref",
        "ws_url",
        "encrypted_token",
        "status",
        "attached_to",
        "created_at",
        "last_activity_at",
        "estimated_cost_usd"
      ]) {
        expect(instanceCols).toContain(col);
      }
    } finally {
      sqlite.close();
    }
  });

  it("enforces a unique name on worker_profiles", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-workers-unique-"));
    const dbPath = join(tempDir, "workers.sqlite");

    await migrateSqliteDb(dbPath);

    const sqlite = new Database(dbPath);
    try {
      const insert = sqlite.prepare(
        `INSERT INTO worker_profiles
          (id, name, target, image, spec, token_policy, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const now = new Date().toISOString();
      insert.run("p1", "dup", "runpod", "img", "{}", "generate", now, now);
      expect(() =>
        insert.run("p2", "dup", "runpod", "img", "{}", "generate", now, now)
      ).toThrow(/UNIQUE/i);
    } finally {
      sqlite.close();
    }
  });
});
