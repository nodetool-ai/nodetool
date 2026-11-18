import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateMessageBranches, migrateMessageTurnContext } from "../../native/graph-runner/guest/host/models-baseline.cjs";

describe("native message branch migration", () => {
  it.each([
    { present: [] }, { present: ["branch_id"] }, { present: ["branch_after"] },
    { present: ["branch_id", "branch_after"] }
  ])(
    "preserves existing columns and messages when upgrading $present",
    ({ present }) => {
      const database = new Database(":memory:");
      try {
        database.exec("CREATE TABLE nodetool_messages (id TEXT PRIMARY KEY, content TEXT NOT NULL)");
        database.prepare("INSERT INTO nodetool_messages VALUES (?, ?)").run("message", "Original answer");
        for (const name of present) {
          database.exec(`ALTER TABLE nodetool_messages ADD COLUMN ${name} TEXT`);
          database.prepare(`UPDATE nodetool_messages SET ${name} = ?`).run(`existing-${name}`);
        }
        if (present.length === 0) {
          expect(() => database.prepare("SELECT branch_id, branch_after FROM nodetool_messages").get())
            .toThrow(/no such column/);
        }
        for (let repetition = 0; repetition < 2; repetition++) {
          database.transaction(() => migrateMessageBranches(database))();
          expect(database.prepare("SELECT * FROM nodetool_messages").get()).toEqual({
            id: "message", content: "Original answer",
            branch_id: present.includes("branch_id") ? "existing-branch_id" : null,
            branch_after: present.includes("branch_after") ? "existing-branch_after" : null
          });
        }
      } finally {
        database.close();
      }
    }
  );
});

describe("native message turn context migration", () => {
  it.each([{ present: false }, { present: true }])(
    "adds turn_context once and keeps existing values (present: $present)",
    ({ present }) => {
      const database = new Database(":memory:");
      try {
        database.exec("CREATE TABLE nodetool_messages (id TEXT PRIMARY KEY, content TEXT NOT NULL)");
        database.prepare("INSERT INTO nodetool_messages VALUES (?, ?)").run("message", "Question");
        if (present) {
          database.exec("ALTER TABLE nodetool_messages ADD COLUMN turn_context TEXT");
          database.prepare("UPDATE nodetool_messages SET turn_context = ?").run("existing");
        } else {
          expect(() => database.prepare("SELECT turn_context FROM nodetool_messages").get())
            .toThrow(/no such column/);
        }
        for (let repetition = 0; repetition < 2; repetition++) {
          database.transaction(() => migrateMessageTurnContext(database))();
          expect(database.prepare("SELECT * FROM nodetool_messages").get()).toEqual({
            id: "message", content: "Question", turn_context: present ? "existing" : null
          });
        }
      } finally {
        database.close();
      }
    }
  );
});
