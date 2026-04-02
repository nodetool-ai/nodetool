import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeRegistry, makeRunnerWithContext, nd } from "./helpers.js";

let tmpDir: string;
let registry: ReturnType<typeof makeRegistry>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-sqlite-e2e-"));
  registry = makeRegistry();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const TABLE_COLUMNS = {
  columns: [
    { name: "id", data_type: "int" },
    { name: "name", data_type: "string" },
    { name: "age", data_type: "int" }
  ]
};

describe("sqlite e2e", () => {
  it("CreateTable creates a table successfully", async () => {
    const runner = makeRunnerWithContext(registry, tmpDir);
    const result = await runner.run(
      { job_id: "create-1" },
      {
        nodes: [
          nd("create", "lib.sqlite.CreateTable", {
            name: "out",
            properties: {
              database_name: "test.db",
              table_name: "items",
              columns: TABLE_COLUMNS,
              add_primary_key: true,
              if_not_exists: true
            }
          })
        ],
        edges: []
      }
    );
    expect(result.status).toBe("completed");
    // CreateTable returns { database_name, table_name, columns } — each value is a separate entry
    expect(result.outputs.out).toContain("items");
  });

  it("CreateTable + Insert + Query round-trip", async () => {
    // Create table
    const r1 = makeRunnerWithContext(registry, tmpDir);
    await r1.run(
      { job_id: "create-2" },
      {
        nodes: [
          nd("create", "lib.sqlite.CreateTable", {
            properties: {
              database_name: "test.db",
              table_name: "people",
              columns: TABLE_COLUMNS,
              add_primary_key: true,
              if_not_exists: true
            }
          })
        ],
        edges: []
      }
    );

    // Insert Alice
    const r2 = makeRunnerWithContext(registry, tmpDir);
    const insertResult = await r2.run(
      { job_id: "insert-1" },
      {
        nodes: [
          nd("ins", "lib.sqlite.Insert", {
            name: "out",
            properties: {
              database_name: "test.db",
              table_name: "people",
              data: { name: "Alice", age: 30 }
            }
          })
        ],
        edges: []
      }
    );
    expect(insertResult.status).toBe("completed");
    // Insert returns { row_id, rows_affected, message } — each value is a separate entry
    expect(insertResult.outputs.out).toContain(1); // rows_affected = 1

    // Insert Bob
    const r3 = makeRunnerWithContext(registry, tmpDir);
    await r3.run(
      { job_id: "insert-2" },
      {
        nodes: [
          nd("ins", "lib.sqlite.Insert", {
            properties: {
              database_name: "test.db",
              table_name: "people",
              data: { name: "Bob", age: 25 }
            }
          })
        ],
        edges: []
      }
    );

    // Query all
    const r4 = makeRunnerWithContext(registry, tmpDir);
    const queryResult = await r4.run(
      { job_id: "query-1" },
      {
        nodes: [
          nd("q", "lib.sqlite.Query", {
            name: "out",
            properties: {
              database_name: "test.db",
              table_name: "people"
            }
          })
        ],
        edges: []
      }
    );
    expect(queryResult.status).toBe("completed");
    const rows = queryResult.outputs.out[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Alice", age: 30 }),
        expect.objectContaining({ name: "Bob", age: 25 })
      ])
    );
  });

  it("ExecuteSQL for DDL + DML + SELECT", async () => {
    // Create table via ExecuteSQL
    const r1 = makeRunnerWithContext(registry, tmpDir);
    const createResult = await r1.run(
      { job_id: "exec-1" },
      {
        nodes: [
          nd("exec", "lib.sqlite.ExecuteSQL", {
            name: "out",
            properties: {
              database_name: "exec.db",
              sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT)"
            }
          })
        ],
        edges: []
      }
    );
    expect(createResult.status).toBe("completed");

    // Insert via ExecuteSQL
    const r2 = makeRunnerWithContext(registry, tmpDir);
    const insertResult = await r2.run(
      { job_id: "exec-2" },
      {
        nodes: [
          nd("exec", "lib.sqlite.ExecuteSQL", {
            name: "out",
            properties: {
              database_name: "exec.db",
              sql: "INSERT INTO notes (title, body) VALUES (?, ?)",
              parameters: ["My Note", "Hello world"]
            }
          })
        ],
        edges: []
      }
    );
    expect(insertResult.status).toBe("completed");
    // ExecuteSQL DML returns { rows_affected, last_row_id, message } — each value separate
    expect(insertResult.outputs.out).toContain(1); // rows_affected = 1

    // SELECT via ExecuteSQL
    const r3 = makeRunnerWithContext(registry, tmpDir);
    const selectResult = await r3.run(
      { job_id: "exec-3" },
      {
        nodes: [
          nd("exec", "lib.sqlite.ExecuteSQL", {
            name: "out",
            properties: {
              database_name: "exec.db",
              sql: "SELECT * FROM notes"
            }
          })
        ],
        edges: []
      }
    );
    expect(selectResult.status).toBe("completed");
    // ExecuteSQL SELECT returns { rows, count, message } — each value separate
    // out[0] = rows array, out[1] = count, out[2] = message
    const selRows = selectResult.outputs.out[0] as Record<string, unknown>[];
    expect(selectResult.outputs.out[1]).toBe(1); // count
    expect(selRows[0]).toEqual(
      expect.objectContaining({ title: "My Note", body: "Hello world" })
    );
  });

  it("Delete removes records", async () => {
    // Setup: create table and insert
    const r1 = makeRunnerWithContext(registry, tmpDir);
    await r1.run(
      { job_id: "del-setup-1" },
      {
        nodes: [
          nd("create", "lib.sqlite.CreateTable", {
            properties: {
              database_name: "del.db",
              table_name: "items",
              columns: {
                columns: [
                  { name: "id", data_type: "int" },
                  { name: "val", data_type: "string" }
                ]
              },
              add_primary_key: true,
              if_not_exists: true
            }
          })
        ],
        edges: []
      }
    );

    const r2 = makeRunnerWithContext(registry, tmpDir);
    await r2.run(
      { job_id: "del-setup-2" },
      {
        nodes: [
          nd("ins", "lib.sqlite.Insert", {
            properties: {
              database_name: "del.db",
              table_name: "items",
              data: { val: "to-delete" }
            }
          })
        ],
        edges: []
      }
    );

    // Delete
    const r3 = makeRunnerWithContext(registry, tmpDir);
    const delResult = await r3.run(
      { job_id: "del-1" },
      {
        nodes: [
          nd("del", "lib.sqlite.Delete", {
            name: "out",
            properties: {
              database_name: "del.db",
              table_name: "items",
              where: "val = 'to-delete'"
            }
          })
        ],
        edges: []
      }
    );
    expect(delResult.status).toBe("completed");
    // Delete returns { rows_affected, message } — each value separate; [0] = rows_affected
    expect(delResult.outputs.out[0]).toBe(1);

    // Query to verify empty
    const r4 = makeRunnerWithContext(registry, tmpDir);
    const queryResult = await r4.run(
      { job_id: "del-verify" },
      {
        nodes: [
          nd("q", "lib.sqlite.Query", {
            name: "out",
            properties: {
              database_name: "del.db",
              table_name: "items"
            }
          })
        ],
        edges: []
      }
    );
    expect(queryResult.status).toBe("completed");
    const rows = queryResult.outputs.out[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(0);
  });

  it("Update modifies records", async () => {
    // Setup
    const r1 = makeRunnerWithContext(registry, tmpDir);
    await r1.run(
      { job_id: "upd-setup-1" },
      {
        nodes: [
          nd("create", "lib.sqlite.CreateTable", {
            properties: {
              database_name: "upd.db",
              table_name: "users",
              columns: TABLE_COLUMNS,
              add_primary_key: true,
              if_not_exists: true
            }
          })
        ],
        edges: []
      }
    );

    const r2 = makeRunnerWithContext(registry, tmpDir);
    await r2.run(
      { job_id: "upd-setup-2" },
      {
        nodes: [
          nd("ins", "lib.sqlite.Insert", {
            properties: {
              database_name: "upd.db",
              table_name: "users",
              data: { name: "Alice", age: 30 }
            }
          })
        ],
        edges: []
      }
    );

    // Update age
    const r3 = makeRunnerWithContext(registry, tmpDir);
    const updResult = await r3.run(
      { job_id: "upd-1" },
      {
        nodes: [
          nd("upd", "lib.sqlite.Update", {
            name: "out",
            properties: {
              database_name: "upd.db",
              table_name: "users",
              data: { age: 31 },
              where: "name = 'Alice'"
            }
          })
        ],
        edges: []
      }
    );
    expect(updResult.status).toBe("completed");
    // Update returns { rows_affected, message } — each value separate; [0] = rows_affected
    expect(updResult.outputs.out[0]).toBe(1);

    // Verify
    const r4 = makeRunnerWithContext(registry, tmpDir);
    const queryResult = await r4.run(
      { job_id: "upd-verify" },
      {
        nodes: [
          nd("q", "lib.sqlite.Query", {
            name: "out",
            properties: {
              database_name: "upd.db",
              table_name: "users"
            }
          })
        ],
        edges: []
      }
    );
    expect(queryResult.status).toBe("completed");
    const rows = queryResult.outputs.out[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ name: "Alice", age: 31 })
    );
  });

  it("Query with where and limit", async () => {
    // Setup
    const r1 = makeRunnerWithContext(registry, tmpDir);
    await r1.run(
      { job_id: "ql-setup-1" },
      {
        nodes: [
          nd("create", "lib.sqlite.CreateTable", {
            properties: {
              database_name: "ql.db",
              table_name: "scores",
              columns: {
                columns: [
                  { name: "id", data_type: "int" },
                  { name: "player", data_type: "string" },
                  { name: "score", data_type: "int" }
                ]
              },
              add_primary_key: true,
              if_not_exists: true
            }
          })
        ],
        edges: []
      }
    );

    // Insert multiple
    for (const [i, [player, score]] of [
      ["Alice", 100],
      ["Bob", 200],
      ["Carol", 150]
    ].entries()) {
      const r = makeRunnerWithContext(registry, tmpDir);
      await r.run(
        { job_id: `ql-ins-${i}` },
        {
          nodes: [
            nd("ins", "lib.sqlite.Insert", {
              properties: {
                database_name: "ql.db",
                table_name: "scores",
                data: { player, score }
              }
            })
          ],
          edges: []
        }
      );
    }

    // Query with where
    const r2 = makeRunnerWithContext(registry, tmpDir);
    const filtered = await r2.run(
      { job_id: "ql-where" },
      {
        nodes: [
          nd("q", "lib.sqlite.Query", {
            name: "out",
            properties: {
              database_name: "ql.db",
              table_name: "scores",
              where: "score >= 150",
              order_by: "score DESC"
            }
          })
        ],
        edges: []
      }
    );
    expect(filtered.status).toBe("completed");
    const rows = filtered.outputs.out[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({ player: "Bob", score: 200 })
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({ player: "Carol", score: 150 })
    );

    // Query with limit
    const r3 = makeRunnerWithContext(registry, tmpDir);
    const limited = await r3.run(
      { job_id: "ql-limit" },
      {
        nodes: [
          nd("q", "lib.sqlite.Query", {
            name: "out",
            properties: {
              database_name: "ql.db",
              table_name: "scores",
              order_by: "score DESC",
              limit: 1
            }
          })
        ],
        edges: []
      }
    );
    expect(limited.status).toBe("completed");
    const limitedRows = limited.outputs.out[0] as Record<string, unknown>[];
    expect(limitedRows).toHaveLength(1);
    expect(limitedRows[0]).toEqual(expect.objectContaining({ player: "Bob" }));
  });
});
