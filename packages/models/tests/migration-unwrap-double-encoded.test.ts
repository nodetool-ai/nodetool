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

  it("leaves message content alone", async () => {
    await seedMessage("text", JSON.stringify("Hi! How can I help?"), "2026-10-02T00:00:00Z");

    await unwrap.up(adapter);

    expect(await adapter.fetchall("SELECT content FROM nodetool_messages")).toEqual([
      { content: JSON.stringify("Hi! How can I help?") }
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

describe("reencode_raw_pg_message_content", () => {
  const reencode = migrations.find((entry) => entry.version === "20261003_000001")!;
  let adapter: SQLiteMigrationAdapter;

  beforeEach(async () => {
    const database = new Database(":memory:");
    await new MigrationRunner(new SQLiteMigrationAdapter(database)).migrate({
      target: UNWRAP
    });
    adapter = new PostgresReportingAdapter(database);
  });

  it("encodes raw text and keeps valid JSON content", async () => {
    const seed = (id: string, content: string, createdAt = "2026-10-03T12:00:00Z") =>
      adapter.execute(
        `INSERT INTO nodetool_messages (id, user_id, thread_id, role, content, created_at)
         VALUES (?, 'owner', 'thread', 'assistant', ?, ?)`,
        [id, content, createdAt]
      );
    await seed("raw", "Here is the plan");
    await seed("string", JSON.stringify("already encoded"));
    await seed("parts", JSON.stringify([{ type: "text", text: "hi" }]));
    await seed("old-raw", "untouched", "2026-09-01T00:00:00Z");

    await reencode.up(adapter);

    expect(
      await adapter.fetchall("SELECT id, content FROM nodetool_messages ORDER BY id")
    ).toEqual([
      { id: "old-raw", content: "untouched" },
      { id: "parts", content: JSON.stringify([{ type: "text", text: "hi" }]) },
      { id: "raw", content: JSON.stringify("Here is the plan") },
      { id: "string", content: JSON.stringify("already encoded") }
    ]);
  });
});
