/**
 * Condition Builder – fluent API for constructing query filter trees.
 *
 * Port of Python's `nodetool.models.condition_builder`.
 *
 * Example:
 * ```ts
 * const cond = field("age").greaterThan(18)
 *   .and(field("status").equals("active"))
 *   .or(field("priority").inList(["high", "critical"]));
 * ```
 */

// ── Enums ────────────────────────────────────────────────────────────

export enum Operator {
  EQ = "=",
  NE = "!=",
  GT = ">",
  LT = "<",
  GTE = ">=",
  LTE = "<=",
  IN = "IN",
  LIKE = "LIKE",
  CONTAINS = "CONTAINS",
  IS_NULL = "IS NULL",
  IS_NOT_NULL = "IS NOT NULL",
}

export enum LogicalOperator {
  AND = "AND",
  OR = "OR",
}

// ── Value Types ──────────────────────────────────────────────────────

/** A named placeholder that can be resolved at evaluation time. */
export class Variable {
  constructor(public readonly name: string) {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConditionValue = any;

// ── Condition Nodes ──────────────────────────────────────────────────

/** A single comparison (e.g. `age > 18`). */
export class Condition {
  constructor(
    public readonly field: string,
    public readonly operator: Operator,
    public readonly value: ConditionValue,
  ) {}
}

/** A group of conditions joined by a logical operator. */
export class ConditionGroup {
  public readonly conditions: Array<Condition | ConditionGroup>;
  public readonly operator: LogicalOperator;

  constructor(
    conditions: Array<Condition | ConditionGroup | ConditionBuilder>,
    operator: LogicalOperator,
  ) {
    this.operator = operator;
    this.conditions = conditions.map((c) =>
      c instanceof ConditionBuilder ? c.build() : c,
    );
  }
}

// ── Field (fluent entry-point) ───────────────────────────────────────

export class Field {
  constructor(public readonly name: string) {}

  private _cond(op: Operator, value: ConditionValue): ConditionBuilder {
    return new ConditionBuilder(new Condition(this.name, op, value));
  }

  equals(value: ConditionValue): ConditionBuilder {
    return this._cond(Operator.EQ, value);
  }
  notEquals(value: ConditionValue): ConditionBuilder {
    return this._cond(Operator.NE, value);
  }
  greaterThan(value: ConditionValue): ConditionBuilder {
    return this._cond(Operator.GT, value);
  }
  lessThan(value: ConditionValue): ConditionBuilder {
    return this._cond(Operator.LT, value);
  }
  greaterThanOrEqual(value: ConditionValue): ConditionBuilder {
    return this._cond(Operator.GTE, value);
  }
  lessThanOrEqual(value: ConditionValue): ConditionBuilder {
    return this._cond(Operator.LTE, value);
  }
  inList(values: ConditionValue[] | Variable): ConditionBuilder {
    return this._cond(Operator.IN, values);
  }
  like(pattern: string | Variable): ConditionBuilder {
    return this._cond(Operator.LIKE, pattern);
  }
  isNull(): ConditionBuilder {
    return this._cond(Operator.IS_NULL, null);
  }
  isNotNull(): ConditionBuilder {
    return this._cond(Operator.IS_NOT_NULL, null);
  }
}

/** Convenience factory: `field("age").greaterThan(18)` */
export function field(name: string): Field {
  return new Field(name);
}

// ── Condition Builder (chaining) ─────────────────────────────────────

export class ConditionBuilder {
  public root: ConditionGroup;

  constructor(condition: Condition | ConditionGroup) {
    if (condition instanceof Condition) {
      this.root = new ConditionGroup([condition], LogicalOperator.AND);
    } else {
      this.root = condition;
    }
  }

  private _add(
    other: ConditionBuilder,
    op: LogicalOperator,
  ): ConditionBuilder {
    const selfIsSingle =
      this.root.conditions.length === 1 &&
      this.root.conditions[0] instanceof Condition &&
      this.root.operator === LogicalOperator.AND;

    const otherIsSingle =
      other.root.conditions.length === 1 &&
      other.root.operator === LogicalOperator.AND;

    if (selfIsSingle) {
      const otherCond = otherIsSingle
        ? other.root.conditions[0]
        : other.root;
      this.root = new ConditionGroup(
        [this.root.conditions[0], otherCond],
        op,
      );
    } else if (otherIsSingle) {
      this.root = new ConditionGroup(
        [this.root, other.root.conditions[0]],
        op,
      );
    } else {
      this.root = new ConditionGroup([this.root, other.root], op);
    }
    return this;
  }

  and(other: ConditionBuilder): ConditionBuilder {
    return this._add(other, LogicalOperator.AND);
  }

  or(other: ConditionBuilder): ConditionBuilder {
    return this._add(other, LogicalOperator.OR);
  }

  build(): ConditionGroup {
    return this.root;
  }

  /** Extract all Variable names used in the tree. */
  getVariables(): Record<string, null> {
    const vars: Record<string, null> = {};
    this._collectVars(this.root, vars);
    return vars;
  }

  private _collectVars(
    node: Condition | ConditionGroup,
    vars: Record<string, null>,
  ): void {
    if (node instanceof Condition) {
      if (node.value instanceof Variable) {
        vars[node.value.name] = null;
      } else if (Array.isArray(node.value)) {
        for (const v of node.value) {
          if (v instanceof Variable) vars[v.name] = null;
        }
      }
    } else if (node instanceof ConditionGroup) {
      for (const c of node.conditions) {
        this._collectVars(c, vars);
      }
    }
  }
}
