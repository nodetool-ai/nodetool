/**
 * The thread_memories → memories rename must carry the rows over.
 *
 * A rename that loses data is silent: the app comes up, the sidebar is empty,
 * and nothing errors. So this walks a real legacy database through the real
 * migration list and asserts the row is still there afterwards, under the new
 * name, with the new index behind it.
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import {
  SQLiteMigrationAdapter,
  MigrationRunner,
  migrations
} from "../src/migrations/index.js";

const RENAME_VERSION = "20260827_000001";

/** A database as it stood before the rename: the old table, with a row in it. */
function legacyDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE nodetool_thread_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      resources TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_thread_memory_thread_created
      ON nodetool_thread_memories (thread_id, created_at);
    CREATE INDEX idx_thread_memory_user
      ON nodetool_thread_memories (user_id);
    INSERT INTO nodetool_thread_memories
      (id, user_id, thread_id, kind, title, content, created_at, updated_at)
    VALUES
      ('m1', 'u1', 't1', 'decision', 'Brand colour',
       'We settled on viridian.', '2026-08-01', '2026-08-01');
  `);
  return db;
}

const renameMigration = migrations.find((m) => m.version === RENAME_VERSION);

function tableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function indexNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe("rename_thread_memories_to_memories", () => {
  it("is in the built-in migration list", () => {
    expect(renameMigration).toBeDefined();
    expect(renameMigration?.name).toBe("rename_thread_memories_to_memories");
  });

  it("carries every row from the old table to the new one", async () => {
    const db = legacyDb();
    await renameMigration!.up(new SQLiteMigrationAdapter(db));

    expect(tableNames(db)).toContain("nodetool_memories");
    expect(tableNames(db)).not.toContain("nodetool_thread_memories");

    const row = db
      .prepare("SELECT * FROM nodetool_memories WHERE id = 'm1'")
      .get() as Record<string, string>;
    expect(row.content).toBe("We settled on viridian.");
    // The origin thread survives as provenance.
    expect(row.thread_id).toBe("t1");
  });

  it("moves the hot index to (user_id, created_at)", async () => {
    const db = legacyDb();
    await renameMigration!.up(new SQLiteMigrationAdapter(db));
    const indexes = indexNames(db);
    expect(indexes).toContain("idx_memory_user_created");
    expect(indexes).toContain("idx_memory_thread_created");
    expect(indexes).not.toContain("idx_thread_memory_user");
  });

  it("merges instead of failing when both tables exist", async () => {
    // A database created from today's DDL that also carries the old table.
    const db = legacyDb();
    db.exec(`
      CREATE TABLE nodetool_memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        thread_id TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'note',
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        resources TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO nodetool_memories
        (id, user_id, thread_id, content, created_at, updated_at)
      VALUES ('m2', 'u1', 't2', 'Already here.', '2026-08-02', '2026-08-02');
    `);

    await renameMigration!.up(new SQLiteMigrationAdapter(db));

    const ids = (
      db.prepare("SELECT id FROM nodetool_memories ORDER BY id").all() as Array<{
        id: string;
      }>
    ).map((r) => r.id);
    expect(ids).toEqual(["m1", "m2"]);
    expect(tableNames(db)).not.toContain("nodetool_thread_memories");
  });

  it("is a no-op on a database that never had the old table", async () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE nodetool_memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        thread_id TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'note',
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        resources TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await expect(
      renameMigration!.up(new SQLiteMigrationAdapter(db))
    ).resolves.toBeUndefined();
    expect(indexNames(db)).toContain("idx_memory_user_created");
  });

  it("survives the whole migration list applied in order", async () => {
    const db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    const runner = new MigrationRunner(new SQLiteMigrationAdapter(db));
    await runner.migrate(migrations);
    expect(tableNames(db)).toContain("nodetool_memories");
    expect(tableNames(db)).not.toContain("nodetool_thread_memories");
  });
});
