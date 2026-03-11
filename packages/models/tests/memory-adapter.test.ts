import { describe, it, expect, beforeEach } from "vitest";
import { MemoryAdapter } from "../src/memory-adapter.js";
import { Condition, ConditionBuilder, ConditionGroup, LogicalOperator, Operator, Variable, field } from "../src/condition-builder.js";
import type { TableSchema } from "../src/database-adapter.js";

const SCHEMA: TableSchema = {
  table_name: "test_items",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    name: { type: "string" },
    age: { type: "number" },
    status: { type: "string" },
    created_at: { type: "datetime" },
  },
};

describe("MemoryAdapter", () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter(SCHEMA);
    await adapter.createTable();
  });

  // ── Basic CRUD ─────────────────────────────────────────────────────

  describe("CRUD", () => {
    it("save and get a row", async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      const row = await adapter.get("1");
      expect(row).not.toBeNull();
      expect(row!.name).toBe("Alice");
    });

    it("get returns null for missing key", async () => {
      const row = await adapter.get("nonexistent");
      expect(row).toBeNull();
    });

    it("save overwrites existing row (upsert)", async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      await adapter.save({ id: "1", name: "Alice Updated", age: 31, status: "active" });
      const row = await adapter.get("1");
      expect(row!.name).toBe("Alice Updated");
      expect(row!.age).toBe(31);
    });

    it("delete removes a row", async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      await adapter.delete("1");
      const row = await adapter.get("1");
      expect(row).toBeNull();
    });

    it("throws on save without primary key", async () => {
      await expect(adapter.save({ name: "No ID" })).rejects.toThrow(
        /Missing primary key/,
      );
    });
  });

  // ── Query ──────────────────────────────────────────────────────────

  describe("query", () => {
    beforeEach(async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active", created_at: "2024-01-01" });
      await adapter.save({ id: "2", name: "Bob", age: 25, status: "inactive", created_at: "2024-01-02" });
      await adapter.save({ id: "3", name: "Charlie", age: 35, status: "active", created_at: "2024-01-03" });
    });

    it("query all rows", async () => {
      const [rows, cursor] = await adapter.query();
      expect(rows).toHaveLength(3);
      expect(cursor).toBe("");
    });

    it("query with equality condition", async () => {
      const cond = field("status").equals("active");
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "active")).toBe(true);
    });

    it("query with greater-than condition", async () => {
      const cond = field("age").greaterThan(28);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("query with AND conditions", async () => {
      const cond = field("status").equals("active").and(field("age").greaterThan(30));
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Charlie");
    });

    it("query with OR conditions", async () => {
      const cond = field("name").equals("Alice").or(field("name").equals("Bob"));
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("query with IN condition", async () => {
      const cond = field("name").inList(["Alice", "Charlie"]);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("query with LIKE condition", async () => {
      const cond = field("name").like("Al%");
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("query with orderBy", async () => {
      const [rows] = await adapter.query({ orderBy: "age" });
      expect(rows[0].name).toBe("Bob");
      expect(rows[2].name).toBe("Charlie");
    });

    it("query with orderBy reversed", async () => {
      const [rows] = await adapter.query({ orderBy: "age", reverse: true });
      expect(rows[0].name).toBe("Charlie");
      expect(rows[2].name).toBe("Bob");
    });

    it("query with limit", async () => {
      const [rows, cursor] = await adapter.query({ limit: 2 });
      expect(rows).toHaveLength(2);
      expect(cursor).not.toBe("");
    });

    it("query with column projection", async () => {
      const [rows] = await adapter.query({ columns: ["id", "name"] });
      expect(rows).toHaveLength(3);
      expect(Object.keys(rows[0])).toEqual(["id", "name"]);
    });
  });

  // ── Indexes ────────────────────────────────────────────────────────

  describe("indexes", () => {
    it("create, list and drop indexes", async () => {
      await adapter.createIndex("idx_test_name", ["name"]);
      let indexes = await adapter.listIndexes();
      expect(indexes).toHaveLength(1);
      expect(indexes[0].name).toBe("idx_test_name");

      await adapter.dropIndex("idx_test_name");
      indexes = await adapter.listIndexes();
      expect(indexes).toHaveLength(0);
    });

    it("enforces unique index constraint", async () => {
      await adapter.createIndex("idx_unique_name", ["name"], true);
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      await expect(
        adapter.save({ id: "2", name: "Alice", age: 25, status: "inactive" }),
      ).rejects.toThrow(/Unique index/);
    });

    it("allows update of same row with unique index", async () => {
      await adapter.createIndex("idx_unique_name", ["name"], true);
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      // Update same row (same primary key) — should not violate
      await adapter.save({ id: "1", name: "Alice", age: 31, status: "active" });
      const row = await adapter.get("1");
      expect(row!.age).toBe(31);
    });
  });

  // ── CONTAINS and additional operator tests ─────────────────────────

  describe("additional operators", () => {
    beforeEach(async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active", created_at: "2024-01-01" });
      await adapter.save({ id: "2", name: "Bob", age: 25, status: "inactive", created_at: "2024-01-02" });
      await adapter.save({ id: "3", name: "Charlie", age: 35, status: "active", created_at: "2024-01-03" });
    });

    it("query with CONTAINS operator", async () => {
      const cond = new ConditionBuilder(
        new Condition("name", Operator.CONTAINS, ["Alice", "Bob"]),
      );
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.name).sort()).toEqual(["Alice", "Bob"]);
    });

    it("query with NE operator", async () => {
      const cond = field("name").notEquals("Alice");
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.name !== "Alice")).toBe(true);
    });

    it("query with LT operator", async () => {
      const cond = field("age").lessThan(30);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Bob");
    });

    it("query with GTE operator", async () => {
      const cond = field("age").greaterThanOrEqual(30);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("query with LTE operator", async () => {
      const cond = field("age").lessThanOrEqual(30);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("evaluateCondition with Variable value returns null comparison", async () => {
      const cond = new ConditionBuilder(
        new Condition("name", Operator.EQ, new Variable("some_var")),
      );
      const [rows] = await adapter.query({ condition: cond });
      // Variable resolves to null, so only rows where name === null match
      expect(rows).toHaveLength(0);
    });

    it("evaluateCondition returns false for unknown operator", async () => {
      const cond = new ConditionBuilder(
        new Condition("name", "UNKNOWN" as Operator, "Alice"),
      );
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(0);
    });

    it("evaluateGroup with OR logic across groups", async () => {
      const cond = field("name").equals("Alice").or(field("name").equals("Charlie"));
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("matchesCondition returns false for non-matching row", async () => {
      const cond = field("name").equals("Nonexistent");
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(0);
    });

    it("evaluateGroup with nested ConditionGroup (OR)", async () => {
      const innerGroup = new ConditionGroup(
        [
          new Condition("name", Operator.EQ, "Alice"),
          new Condition("name", Operator.EQ, "Bob"),
        ],
        LogicalOperator.OR,
      );
      const cond = new ConditionBuilder(innerGroup);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(2);
    });

    it("LIKE with non-string value returns false", async () => {
      // LIKE operator should return false when target or val is not a string
      const cond = new ConditionBuilder(
        new Condition("age", Operator.LIKE, "%30%"),
      );
      const [rows] = await adapter.query({ condition: cond });
      // age is a number, not a string, so LIKE should not match
      expect(rows).toHaveLength(0);
    });

    it("LIKE with non-string pattern returns false", async () => {
      const cond = new ConditionBuilder(
        new Condition("name", Operator.LIKE, 42),
      );
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(0);
    });

    it("evaluateGroup returns false from nested ConditionGroup path", async () => {
      // Test the else-if path for ConditionGroup inside evaluateGroup (line 63-64)
      const innerGroup = new ConditionGroup(
        [new Condition("name", Operator.EQ, "Nonexistent")],
        LogicalOperator.AND,
      );
      const outerGroup = new ConditionGroup(
        [innerGroup],
        LogicalOperator.AND,
      );
      const cond = new ConditionBuilder(outerGroup);
      const [rows] = await adapter.query({ condition: cond });
      expect(rows).toHaveLength(0);
    });
  });

  // ── Schema without explicit primary_key ─────────────────────────────

  describe("schema without primary_key", () => {
    it("defaults to 'id' when primary_key is not set", async () => {
      const schemaNoKey: TableSchema = {
        table_name: "no_pk",
        columns: {
          id: { type: "string" },
          name: { type: "string" },
        },
      } as any;
      const noPkAdapter = new MemoryAdapter(schemaNoKey);
      expect(noPkAdapter.getPrimaryKey()).toBe("id");

      await noPkAdapter.save({ id: "1", name: "Test" });
      const row = await noPkAdapter.get("1");
      expect(row).not.toBeNull();
      expect(row!.name).toBe("Test");
    });
  });

  // ── Table lifecycle ────────────────────────────────────────────────

  describe("table lifecycle", () => {
    it("dropTable clears all data and indexes", async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      await adapter.createIndex("idx_test", ["name"]);
      await adapter.dropTable();

      const [rows] = await adapter.query();
      expect(rows).toHaveLength(0);

      const indexes = await adapter.listIndexes();
      expect(indexes).toHaveLength(0);
    });
  });

  describe("nested ConditionGroup evaluation", () => {
    it("evaluates nested ConditionGroup within a query", async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });
      await adapter.save({ id: "2", name: "Bob", age: 25, status: "inactive" });
      await adapter.save({ id: "3", name: "Carol", age: 35, status: "active" });

      // Build a nested condition: (age > 20 AND (status = "active" OR name = "Bob"))
      const inner = new ConditionGroup([
        new Condition("status", Operator.EQ, "active"),
        new Condition("name", Operator.EQ, "Bob"),
      ], LogicalOperator.OR);
      const outer = new ConditionGroup([
        new Condition("age", Operator.GT, 20),
        inner,
      ], LogicalOperator.AND);
      const builder = new ConditionBuilder(outer);

      const [rows] = await adapter.query({ condition: builder });
      expect(rows).toHaveLength(3); // All three match
    });

    it("handles unknown condition type in group (returns false)", async () => {
      await adapter.save({ id: "1", name: "Alice", age: 30, status: "active" });

      // Create a group with an invalid condition type - we need to bypass
      // the ConditionGroup constructor's type checking by modifying after creation
      const group = new ConditionGroup([
        new Condition("name", Operator.EQ, "Alice"),
      ], LogicalOperator.AND);
      // Force an invalid condition into the array
      (group.conditions as any).push("not-a-condition");
      const builder = new ConditionBuilder(group);

      const [rows] = await adapter.query({ condition: builder });
      // The AND group requires all conditions to be true; the invalid one returns false
      expect(rows).toHaveLength(0);
    });
  });
});
