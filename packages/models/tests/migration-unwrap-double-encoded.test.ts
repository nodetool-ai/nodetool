/**
 * The migration that repairs JSON text PostgreSQL stored encoded twice.
 *
 * Its SQL is portable, so it runs against SQLite here through an adapter that
 * reports the PostgreSQL dialect the migration is limited to.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

import {
  MigrationRunner,
  SQLiteMigrationAdapter,
  migrations
} from "../src/migrations/index.js";

const UNWRAP = "20261003_000000";

class PostgresReportingAdapter extends SQLiteMigrationAdapter {
  override get dbType(): string {
    return "postgres";
  }
}

const unwrap = migrations.find((entry) => entry.version === UNWRAP)!;
const migrateToBefore = (adapter: SQLiteMigrationAdapter) =>
  new MigrationRunner(adapter).migrate({
    target: migrations[migrations.indexOf(unwrap) - 1].version
  });
const document = JSON.stringify({ shots: [], entityIds: [] });

describe("unwrap_double_encoded_pg_json_text", () => {
  let adapter: SQLiteMigrationAdapter;

  beforeEach(async () => {
    // Earlier migrations branch on the dialect, so build the schema as SQLite.
    const database = new Database(":memory:");
    await migrateToBefore(new SQLiteMigrationAdapter(database));
    adapter = new PostgresReportingAdapter(database);
  });

  const seedBoard = (id: string, value: string): Promise<void> =>
    adapter.execute(
      `INSERT INTO storyboards (id, user_id, project_id, name, document, created_at, updated_at)
       VALUES (?, 'owner', 'default', 'Board', ?, '2026-10-02', '2026-10-02')`,
      [id, value]
    );

  const seedMessage = (id: string, content: string, createdAt: string) =>
    adapter.execute(
      `INSERT INTO nodetool_messages (id, user_id, thread_id, role, content, created_at)
       VALUES (?, 'owner', 'thread', 'user', ?, ?)`,
      [id, content, createdAt]
    );

  it("decodes double-encoded documents once and leaves valid ones alone", async () => {
    await seedBoard("broken", JSON.stringify(document));
    await seedBoard("valid", document);
    await seedBoard("quoted-text", JSON.stringify("not a document"));

    await unwrap.up(adapter);

    const rows = await adapter.fetchall(
      "SELECT id, document FROM storyboards ORDER BY id"
    );
    expect(rows).toEqual([
      { id: "broken", document },
      { id: "quoted-text", document: JSON.stringify("not a document") },
      { id: "valid", document }
    ]);
  });

  it("unwraps message text only from the affected window", async () => {
    await seedMessage("new", JSON.stringify("hello"), "2026-10-02T00:00:00Z");
    await seedMessage("old", '"quoted"', "2026-09-01T00:00:00Z");

    await unwrap.up(adapter);

    const rows = await adapter.fetchall(
      "SELECT id, content FROM nodetool_messages ORDER BY id"
    );
    expect(rows).toEqual([
      { id: "new", content: "hello" },
      { id: "old", content: '"quoted"' }
    ]);
  });

  it("does nothing on SQLite", async () => {
    const sqlite = new SQLiteMigrationAdapter(new Database(":memory:"));
    await migrateToBefore(sqlite);
    await sqlite.execute(
      `INSERT INTO storyboards (id, user_id, project_id, name, document, created_at, updated_at)
       VALUES ('b', 'owner', 'default', 'Board', ?, '2026-10-02', '2026-10-02')`,
      [JSON.stringify(document)]
    );
    await unwrap.up(sqlite);
    expect(await sqlite.fetchall("SELECT document FROM storyboards")).toEqual([
      { document: JSON.stringify(document) }
    ]);
  });
});
