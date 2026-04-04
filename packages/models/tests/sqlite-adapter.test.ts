import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SQLiteAdapter, SQLiteAdapterFactory } from "../src/sqlite-adapter.js";
import {
  Condition,
  ConditionBuilder,
  ConditionGroup,
  LogicalOperator,
  Operator,
  Variable,
  field
} from "../src/condition-builder.js";
import type { TableSchema } from "../src/database-adapter.js";

// ── Test Schema ───────────────────────────────────────────────────────

const testSchema: TableSchema = {
  table_name: "test_items",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    name: { type: "string" },
    age: { type: "number" },
    active: { type: "boolean" },
    metadata: { type: "json" },
    created_at: { type: "datetime" }
  }
};

// ── Helpers ───────────────────────────────────────────────────────────

function createAdapter(): [Database.Database, SQLiteAdapter] {
  const db = new Database(":memory:");
  const adapter = new SQLiteAdapter(db, testSchema);
  return [db, adapter];
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("SQLiteAdapter", () => {
  let db: Database.Database;
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    [db, adapter] = createAdapter();
    await adapter.createTable();
  });

  afterEach(() => {
    db.close();
  });

  // ── Table operations ──────────────────────────────────────────────

  it("should create table", async () => {
    // Table was already created in beforeEach; verify it exists
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_items'"
      )
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe("test_items");
  });

  it("should drop table", async () => {
    await adapter.dropTable();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_items'"
      )
      .get();
    expect(row).toBeUndefined();
  });

  // ── Save / Get ────────────────────────────────────────────────────

  it("should save and get an item", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: { role: "admin" },
      created_at: "2024-01-01T00:00:00Z"
    });

    const item = await adapter.get("1");
    expect(item).not.toBeNull();
    expect(item!.id).toBe("1");
    expect(item!.name).toBe("Alice");
    expect(item!.age).toBe(30);
  });

  it("should return null for missing item", async () => {
    const item = await adapter.get("nonexistent");
    expect(item).toBeNull();
  });

  it("should throw on missing primary key", async () => {
    await expect(adapter.save({ name: "No ID" })).rejects.toThrow(
      'Missing primary key "id"'
    );
  });

  // ── Upsert ────────────────────────────────────────────────────────

  it("should upsert (save same key twice)", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: {},
      created_at: ""
    });
    await adapter.save({
      id: "1",
      name: "Alice Updated",
      age: 31,
      active: false,
      metadata: {},
      created_at: ""
    });

    const item = await adapter.get("1");
    expect(item!.name).toBe("Alice Updated");
    expect(item!.age).toBe(31);
  });

  // ── Delete ────────────────────────────────────────────────────────

  it("should delete an item", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: {},
      created_at: ""
    });
    await adapter.delete("1");
    const item = await adapter.get("1");
    expect(item).toBeNull();
  });

  it("should not throw when deleting nonexistent item", async () => {
    await expect(adapter.delete("nonexistent")).resolves.toBeUndefined();
  });

  // ── Boolean handling ──────────────────────────────────────────────

  it("should round-trip boolean true", async () => {
    await adapter.save({
      id: "1",
      name: "A",
      age: 0,
      active: true,
      metadata: {},
      created_at: ""
    });
    const item = await adapter.get("1");
    expect(item!.active).toBe(true);
  });

  it("should round-trip boolean false", async () => {
    await adapter.save({
      id: "2",
      name: "B",
      age: 0,
      active: false,
      metadata: {},
      created_at: ""
    });
    const item = await adapter.get("2");
    expect(item!.active).toBe(false);
  });

  // ── JSON field round-trip ─────────────────────────────────────────

  it("should round-trip JSON objects", async () => {
    const meta = { tags: ["a", "b"], nested: { x: 1 } };
    await adapter.save({
      id: "1",
      name: "A",
      age: 0,
      active: true,
      metadata: meta,
      created_at: ""
    });
    const item = await adapter.get("1");
    expect(item!.metadata).toEqual(meta);
  });

  it("should round-trip JSON arrays", async () => {
    const meta = [1, 2, 3];
    await adapter.save({
      id: "1",
      name: "A",
      age: 0,
      active: true,
      metadata: meta,
      created_at: ""
    });
    const item = await adapter.get("1");
    expect(item!.metadata).toEqual(meta);
  });

  // ── Query with conditions ─────────────────────────────────────────

  describe("query", () => {
    beforeEach(async () => {
      await adapter.save({
        id: "1",
        name: "Alice",
        age: 30,
        active: true,
        metadata: {},
        created_at: "2024-01-01"
      });
      await adapter.save({
        id: "2",
        name: "Bob",
        age: 25,
        active: false,
        metadata: {},
        created_at: "2024-01-02"
      });
      await adapter.save({
        id: "3",
        name: "Charlie",
        age: 35,
        active: true,
        metadata: {},
        created_at: "2024-01-03"
      });
      await adapter.save({
        id: "4",
        name: "Diana",
        age: 28,
        active: false,
        metadata: {},
        created_at: "2024-01-04"
      });
    });

    it("should return all rows without conditions", async () => {
      const [rows, cursor] = await adapter.query();
      expect(rows).toHaveLength(4);
      expect(cursor).toBe("");
    });

    it("should filter with EQ", async () => {
      const [rows] = await adapter.query({
        condition: field("name").equals("Alice")
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("should filter with NE", async () => {
      const [rows] = await adapter.query({
        condition: field("name").notEquals("Alice")
      });
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.name !== "Alice")).toBe(true);
    });

    it("should filter with GT", async () => {
      const [rows] = await adapter.query({
        condition: field("age").greaterThan(30)
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Charlie");
    });

    it("should filter with LT", async () => {
      const [rows] = await adapter.query({
        condition: field("age").lessThan(28)
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Bob");
    });

    it("should filter with GTE", async () => {
      const [rows] = await adapter.query({
        condition: field("age").greaterThanOrEqual(30)
      });
      expect(rows).toHaveLength(2);
    });

    it("should filter with LTE", async () => {
      const [rows] = await adapter.query({
        condition: field("age").lessThanOrEqual(28)
      });
      expect(rows).toHaveLength(2);
    });

    it("should filter with IN", async () => {
      const [rows] = await adapter.query({
        condition: field("name").inList(["Alice", "Charlie"])
      });
      expect(rows).toHaveLength(2);
    });

    it("should filter with LIKE", async () => {
      const [rows] = await adapter.query({
        condition: field("name").like("A%")
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("should combine with AND", async () => {
      const [rows] = await adapter.query({
        condition: field("age").greaterThan(25).and(field("active").equals(1))
      });
      // active is stored as INTEGER; Alice (30, true→1) and Charlie (35, true→1)
      expect(rows).toHaveLength(2);
    });

    it("should combine with OR", async () => {
      const [rows] = await adapter.query({
        condition: field("name").equals("Alice").or(field("name").equals("Bob"))
      });
      expect(rows).toHaveLength(2);
    });

    it("should order by column", async () => {
      const [rows] = await adapter.query({ orderBy: "age" });
      expect(rows[0].name).toBe("Bob");
      expect(rows[rows.length - 1].name).toBe("Charlie");
    });

    it("should order by column in reverse", async () => {
      const [rows] = await adapter.query({ orderBy: "age", reverse: true });
      expect(rows[0].name).toBe("Charlie");
      expect(rows[rows.length - 1].name).toBe("Bob");
    });

    it("should limit results", async () => {
      const [rows, cursor] = await adapter.query({ limit: 2 });
      expect(rows).toHaveLength(2);
      expect(cursor).not.toBe("");
    });

    it("should return empty cursor when no more results", async () => {
      const [rows, cursor] = await adapter.query({ limit: 10 });
      expect(rows).toHaveLength(4);
      expect(cursor).toBe("");
    });

    it("should support column projection", async () => {
      const [rows] = await adapter.query({ columns: ["id", "name"] });
      expect(rows).toHaveLength(4);
      // Only projected columns should be present
      for (const row of rows) {
        expect(row.id).toBeDefined();
        expect(row.name).toBeDefined();
      }
    });
  });

  // ── Indexes ───────────────────────────────────────────────────────

  describe("indexes", () => {
    it("should create an index", async () => {
      await adapter.createIndex("idx_name", ["name"]);
      const indexes = await adapter.listIndexes();
      expect(indexes.some((i) => i.name === "idx_name")).toBe(true);
    });

    it("should create a unique index", async () => {
      await adapter.createIndex("idx_name_unique", ["name"], true);
      const indexes = await adapter.listIndexes();
      const idx = indexes.find((i) => i.name === "idx_name_unique");
      expect(idx).toBeDefined();
      expect(idx!.unique).toBe(true);
    });

    it("should list indexes", async () => {
      await adapter.createIndex("idx_a", ["name"]);
      await adapter.createIndex("idx_b", ["age"], true);
      const indexes = await adapter.listIndexes();
      expect(indexes.length).toBeGreaterThanOrEqual(2);
    });

    it("should drop an index", async () => {
      await adapter.createIndex("idx_drop_me", ["name"]);
      await adapter.dropIndex("idx_drop_me");
      const indexes = await adapter.listIndexes();
      expect(indexes.some((i) => i.name === "idx_drop_me")).toBe(false);
    });
  });

  // ── Column name validation ────────────────────────────────────────

  it("should reject invalid column names", () => {
    expect(() => {
      adapter._buildCondition(
        new Condition("robert'; DROP TABLE students;--", Operator.EQ, "x")
      );
    }).toThrow("Invalid column name");
  });

  // ── Variable condition ──────────────────────────────────────────────

  it("should return 1=1 for Variable value in condition", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: {},
      created_at: "2024-01-01"
    });
    await adapter.save({
      id: "2",
      name: "Bob",
      age: 25,
      active: false,
      metadata: {},
      created_at: "2024-01-02"
    });

    const cond = new ConditionBuilder(
      new Condition("name", Operator.EQ, new Variable("some_var"))
    );
    const [rows] = await adapter.query({ condition: cond });
    // Variable conditions resolve to "1=1", so all rows match
    expect(rows).toHaveLength(2);
  });

  // ── Empty ConditionGroup ─────────────────────────────────────────────

  it("should return 1=1 for empty ConditionGroup", () => {
    const emptyGroup = new ConditionGroup([], LogicalOperator.AND);
    const [sql, params] = adapter._buildCondition(emptyGroup);
    expect(sql).toBe("1=1");
    expect(params).toEqual([]);
  });

  // ── Default case in operator switch ──────────────────────────────────

  it("should return 1=1 for unknown operator in _buildCondition", () => {
    // Force an unknown operator by casting
    const cond = new Condition("name", "UNKNOWN_OP" as Operator, "x");
    const [sql, params] = adapter._buildCondition(cond);
    expect(sql).toBe("1=1");
    expect(params).toEqual([]);
  });

  // ── CONTAINS operator in SQL ─────────────────────────────────────────

  it("should handle CONTAINS operator as IN", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: {},
      created_at: "2024-01-01"
    });
    await adapter.save({
      id: "2",
      name: "Bob",
      age: 25,
      active: false,
      metadata: {},
      created_at: "2024-01-02"
    });

    const cond = new ConditionBuilder(
      new Condition("name", Operator.CONTAINS, ["Alice"])
    );
    const [rows] = await adapter.query({ condition: cond });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
  });

  // ── IN/CONTAINS with non-array value ─────────────────────────────────

  it("should handle IN operator with non-array value (wraps in array)", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: {},
      created_at: "2024-01-01"
    });
    await adapter.save({
      id: "2",
      name: "Bob",
      age: 25,
      active: false,
      metadata: {},
      created_at: "2024-01-02"
    });

    const cond = new ConditionBuilder(
      new Condition("name", Operator.IN, "Alice")
    );
    const [rows] = await adapter.query({ condition: cond });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
  });

  // ── Column wildcard * in query ───────────────────────────────────────

  it("should handle * in column projection", async () => {
    await adapter.save({
      id: "1",
      name: "Alice",
      age: 30,
      active: true,
      metadata: {},
      created_at: "2024-01-01"
    });

    const [rows] = await adapter.query({ columns: ["*"] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
  });

  // ── Deserialization edge cases ───────────────────────────────────────

  it("should handle malformed JSON by returning raw string", async () => {
    // Insert a row with invalid JSON directly via raw SQL
    db.prepare(
      'INSERT INTO "test_items" (id, name, age, active, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run("bad_json", "Test", 0, 1, "not{valid}json", "2024-01-01");

    const item = await adapter.get("bad_json");
    expect(item).not.toBeNull();
    // Should return the raw string since JSON.parse fails
    expect(item!.metadata).toBe("not{valid}json");
  });

  it("should handle non-string JSON value (already parsed)", async () => {
    // Insert a row where metadata is a number (not a string) in raw SQL
    db.prepare(
      'INSERT INTO "test_items" (id, name, age, active, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run("num_json", "Test", 0, 1, 42, "2024-01-01");

    const item = await adapter.get("num_json");
    expect(item).not.toBeNull();
    // Should return the number as-is
    expect(item!.metadata).toBe(42);
  });

  it("should handle extra columns not in schema (deserializeRow else branch)", async () => {
    // Insert a row with an extra column via raw SQL
    db.exec('ALTER TABLE "test_items" ADD COLUMN extra_col TEXT');
    db.prepare(
      'INSERT INTO "test_items" (id, name, age, active, metadata, created_at, extra_col) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run("extra", "Test", 0, 1, "{}", "2024-01-01", "extra_value");

    const item = await adapter.get("extra");
    expect(item).not.toBeNull();
    // The extra column should be preserved as-is
    expect(item!.extra_col).toBe("extra_value");
  });

  it("should handle number field with string value (Number conversion)", async () => {
    // Insert a row where age is a string via raw SQL
    db.prepare(
      'INSERT INTO "test_items" (id, name, age, active, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run("str_num", "Test", "42", 1, "{}", "2024-01-01");

    const item = await adapter.get("str_num");
    expect(item).not.toBeNull();
    // Should convert string to number
    expect(item!.age).toBe(42);
  });

  // ── Default branches in sqliteType/serializeValue/deserializeValue ──

  it("should handle unknown field type in schema", async () => {
    const customSchema: TableSchema = {
      table_name: "custom_items",
      primary_key: "id",
      columns: {
        id: { type: "string" },
        data: { type: "custom_type" as any }
      }
    };
    const customAdapter = new SQLiteAdapter(db, customSchema);
    await customAdapter.createTable();

    await customAdapter.save({ id: "1", data: "hello" });
    const item = await customAdapter.get("1");
    expect(item).not.toBeNull();
    expect(item!.data).toBe("hello");
  });

  // ── Schema without explicit primary_key ───────────────────────────

  it("should default to 'id' when primary_key is not set", async () => {
    const schemaNoKey: TableSchema = {
      table_name: "no_pk_items",
      columns: {
        id: { type: "string" },
        name: { type: "string" }
      }
    } as any;
    const noPkAdapter = new SQLiteAdapter(db, schemaNoKey);
    expect(noPkAdapter.getPrimaryKey()).toBe("id");

    await noPkAdapter.createTable();
    await noPkAdapter.save({ id: "1", name: "Test" });
    const item = await noPkAdapter.get("1");
    expect(item).not.toBeNull();
    expect(item!.name).toBe("Test");
  });
});

// ── SQLiteAdapterFactory ──────────────────────────────────────────────

describe("SQLiteAdapterFactory", () => {
  it("should create and cache adapters", () => {
    const factory = new SQLiteAdapterFactory(":memory:");
    const a1 = factory.getAdapter(testSchema);
    const a2 = factory.getAdapter(testSchema);
    expect(a1).toBe(a2);
    factory.close();
  });

  it("should return different adapters for different schemas", () => {
    const factory = new SQLiteAdapterFactory(":memory:");
    const schema2: TableSchema = {
      table_name: "other_table",
      primary_key: "id",
      columns: { id: { type: "string" } }
    };
    const a1 = factory.getAdapter(testSchema);
    const a2 = factory.getAdapter(schema2);
    expect(a1).not.toBe(a2);
    factory.close();
  });
});

describe("SQLiteAdapter – castValue for json column with non-string value", () => {
  let db: Database.Database;
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    db = new Database(":memory:");
    adapter = new SQLiteAdapter(db, testSchema);
    await adapter.createTable();
  });

  afterEach(() => {
    db.close();
  });

  it("returns null metadata when stored as null in json column", async () => {
    // Insert a row with null metadata (json column)
    await adapter.save({
      id: "1",
      name: "Test",
      age: 25,
      active: true,
      metadata: null,
      created_at: new Date().toISOString()
    });

    const row = await adapter.get("1");
    expect(row).not.toBeNull();
    expect(row!.metadata).toBeNull();
  });
});
