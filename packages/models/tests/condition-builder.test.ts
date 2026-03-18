import { describe, it, expect } from "vitest";
import {
  Operator,
  LogicalOperator,
  Variable,
  Condition,
  ConditionGroup,
  ConditionBuilder,
  Field,
  field,
} from "../src/condition-builder.js";

describe("ConditionBuilder", () => {
  // ── Field helper ───────────────────────────────────────────────────

  describe("field() factory", () => {
    it("creates a Field instance", () => {
      const f = field("age");
      expect(f).toBeInstanceOf(Field);
      expect(f.name).toBe("age");
    });
  });

  // ── Single conditions ──────────────────────────────────────────────

  describe("single conditions", () => {
    it("creates an equals condition", () => {
      const cond = field("status").equals("active");
      const root = cond.build();
      expect(root.conditions).toHaveLength(1);
      const c = root.conditions[0] as Condition;
      expect(c.field).toBe("status");
      expect(c.operator).toBe(Operator.EQ);
      expect(c.value).toBe("active");
    });

    it("creates a notEquals condition", () => {
      const c = field("role").notEquals("admin").build().conditions[0] as Condition;
      expect(c.operator).toBe(Operator.NE);
    });

    it("creates greaterThan / lessThan", () => {
      const gt = field("age").greaterThan(18).build().conditions[0] as Condition;
      expect(gt.operator).toBe(Operator.GT);
      expect(gt.value).toBe(18);

      const lt = field("score").lessThan(50).build().conditions[0] as Condition;
      expect(lt.operator).toBe(Operator.LT);
    });

    it("creates gte / lte", () => {
      const gte = field("age").greaterThanOrEqual(21).build().conditions[0] as Condition;
      expect(gte.operator).toBe(Operator.GTE);

      const lte = field("age").lessThanOrEqual(65).build().conditions[0] as Condition;
      expect(lte.operator).toBe(Operator.LTE);
    });

    it("creates an IN condition", () => {
      const c = field("status").inList(["active", "pending"]).build()
        .conditions[0] as Condition;
      expect(c.operator).toBe(Operator.IN);
      expect(c.value).toEqual(["active", "pending"]);
    });

    it("creates a LIKE condition", () => {
      const c = field("name").like("%John%").build().conditions[0] as Condition;
      expect(c.operator).toBe(Operator.LIKE);
      expect(c.value).toBe("%John%");
    });
  });

  // ── Chaining ───────────────────────────────────────────────────────

  describe("chaining with and/or", () => {
    it("combines two conditions with AND", () => {
      const cond = field("age")
        .greaterThan(18)
        .and(field("status").equals("active"));
      const root = cond.build();
      expect(root.operator).toBe(LogicalOperator.AND);
      expect(root.conditions).toHaveLength(2);
    });

    it("combines two conditions with OR", () => {
      const cond = field("role")
        .equals("admin")
        .or(field("role").equals("superadmin"));
      const root = cond.build();
      expect(root.operator).toBe(LogicalOperator.OR);
      expect(root.conditions).toHaveLength(2);
    });

    it("chains three conditions", () => {
      const cond = field("a")
        .equals(1)
        .and(field("b").equals(2))
        .and(field("c").equals(3));
      const root = cond.build();
      // Should form a nested tree
      expect(root.operator).toBe(LogicalOperator.AND);
    });
  });

  // ── Variables ──────────────────────────────────────────────────────

  describe("variables", () => {
    it("tracks variables used in conditions", () => {
      const cond = field("age")
        .greaterThan(new Variable("min_age"))
        .and(field("status").equals("active"))
        .or(field("priority").inList([new Variable("high_priority"), "critical"]));
      const vars = cond.getVariables();
      expect(Object.keys(vars)).toContain("min_age");
      expect(Object.keys(vars)).toContain("high_priority");
    });

    it("returns empty when no variables", () => {
      const vars = field("x").equals(1).getVariables();
      expect(Object.keys(vars)).toHaveLength(0);
    });
  });

  // ── ConditionGroup ─────────────────────────────────────────────────

  describe("ConditionGroup", () => {
    it("auto-builds nested ConditionBuilders", () => {
      const builder = field("x").equals(1);
      const group = new ConditionGroup([builder], LogicalOperator.AND);
      // The builder should be built() into a ConditionGroup
      expect(group.conditions[0]).toBeInstanceOf(ConditionGroup);
    });
  });

  // ── ConditionBuilder constructor with ConditionGroup ──────────────

  describe("ConditionBuilder constructor", () => {
    it("accepts a ConditionGroup directly", () => {
      const group = new ConditionGroup(
        [new Condition("x", Operator.EQ, 1)],
        LogicalOperator.OR,
      );
      const builder = new ConditionBuilder(group);
      expect(builder.root).toBe(group);
      expect(builder.root.operator).toBe(LogicalOperator.OR);
    });
  });

  // ── _add method branches ──────────────────────────────────────────

  describe("_add method branches", () => {
    it("otherIsSingle but selfIsNotSingle (line 144-148)", () => {
      // Build a multi-condition self (not single)
      const self = field("a").equals(1).and(field("b").equals(2));
      // Build a single other
      const other = field("c").equals(3);
      // Chain: selfIsNotSingle AND otherIsSingle
      const result = self.and(other);
      const root = result.build();
      expect(root.operator).toBe(LogicalOperator.AND);
      expect(root.conditions).toHaveLength(2);
      // The second condition should be a Condition (unwrapped from single)
      expect(root.conditions[1]).toBeInstanceOf(Condition);
    });

    it("neither self nor other is single (line 150-151)", () => {
      // Build multi-condition self
      const self = field("a").equals(1).and(field("b").equals(2));
      // Build multi-condition other
      const other = field("c").equals(3).and(field("d").equals(4));
      // Chain: both are groups
      const result = self.and(other);
      const root = result.build();
      expect(root.operator).toBe(LogicalOperator.AND);
      expect(root.conditions).toHaveLength(2);
      // Both conditions should be ConditionGroups
      expect(root.conditions[0]).toBeInstanceOf(ConditionGroup);
      expect(root.conditions[1]).toBeInstanceOf(ConditionGroup);
    });

    it("selfIsSingle with other being a non-single group (line 137-143 otherCond = other.root)", () => {
      // Self is single
      const self = field("a").equals(1);
      // Other is a multi-condition group (not single)
      const other = field("b").equals(2).and(field("c").equals(3));
      const result = self.and(other);
      const root = result.build();
      expect(root.operator).toBe(LogicalOperator.AND);
      expect(root.conditions).toHaveLength(2);
      // First is the single Condition, second is the ConditionGroup from other.root
      expect(root.conditions[0]).toBeInstanceOf(Condition);
      expect(root.conditions[1]).toBeInstanceOf(ConditionGroup);
    });
  });
});
