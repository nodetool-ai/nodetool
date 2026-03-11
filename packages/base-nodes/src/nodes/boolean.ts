import { BaseNode, prop } from "@nodetool/node-sdk";

type ComparisonOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";
type LogicalOperator = "and" | "or" | "xor" | "nand" | "nor";

export class ConditionalSwitchNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.ConditionalSwitch";
            static readonly title = "Conditional Switch";
            static readonly description = "Performs a conditional check on a boolean input and returns a value based on the result.\n    if, condition, flow-control, branch, true, false, switch, toggle\n\n    Use cases:\n    - Implement conditional logic in workflows\n    - Create dynamic branches in workflows\n    - Implement decision points in workflows";
        static readonly metadataOutputTypes = {
    output: "any"
  };
  
  @prop({ type: "bool", default: false, title: "Condition", description: "The condition to check" })
  declare condition: any;

  @prop({ type: "any", default: [], title: "If True", description: "The value to return if the condition is true" })
  declare if_true: any;

  @prop({ type: "any", default: [], title: "If False", description: "The value to return if the condition is false" })
  declare if_false: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const condition = Boolean(inputs.condition ?? this.condition ?? false);
    const ifTrue = inputs.if_true ?? this.if_true ?? null;
    const ifFalse = inputs.if_false ?? this.if_false ?? null;

    return { output: condition ? ifTrue : ifFalse };
  }
}

export class LogicalOperatorNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.LogicalOperator";
            static readonly title = "Logical Operator";
            static readonly description = "Performs logical operations on two boolean inputs.\n    boolean, logic, operator, condition, flow-control, branch, else, true, false, switch, toggle\n\n    Use cases:\n    - Combine multiple conditions in decision-making\n    - Implement complex logical rules in workflows\n    - Create advanced filters or triggers";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "bool", default: false, title: "A", description: "First boolean input" })
  declare a: any;

  @prop({ type: "bool", default: false, title: "B", description: "Second boolean input" })
  declare b: any;

  @prop({ type: "enum", default: "and", title: "Operation", description: "Logical operation to perform", values: [
  "and",
  "or",
  "xor",
  "nand",
  "nor"
] })
  declare operation: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = Boolean(inputs.a ?? this.a ?? false);
    const b = Boolean(inputs.b ?? this.b ?? false);
    const operation = String(
      inputs.operation ?? this.operation ?? "and"
    ) as LogicalOperator;

    switch (operation) {
      case "and":
        return { output: a && b };
      case "or":
        return { output: a || b };
      case "xor":
        return { output: a !== b };
      case "nand":
        return { output: !(a && b) };
      case "nor":
        return { output: !(a || b) };
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }
}

export class NotNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.Not";
            static readonly title = "Not";
            static readonly description = "Performs logical NOT operation on a boolean input.\n    boolean, logic, not, invert, !, negation, condition, else, true, false, switch, toggle, flow-control, branch\n\n    Use cases:\n    - Invert a condition's result\n    - Implement toggle functionality\n    - Create opposite logic branches";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "bool", default: false, title: "Value", description: "Boolean input to negate" })
  declare value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: !(inputs.value ?? this.value ?? false) };
  }
}

export class CompareNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.Compare";
            static readonly title = "Compare";
            static readonly description = "Compares two values using a specified comparison operator.\n    compare, condition, logic\n\n    Use cases:\n    - Implement decision points in workflows\n    - Filter data based on specific criteria\n    - Create dynamic thresholds or limits";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "union[int, float]", default: 0, title: "A", description: "First value to compare" })
  declare a: any;

  @prop({ type: "union[int, float]", default: 0, title: "B", description: "Second value to compare" })
  declare b: any;

  @prop({ type: "enum", default: "==", title: "Comparison", description: "Comparison operator to use", values: [
  "==",
  "!=",
  ">",
  "<",
  ">=",
  "<="
] })
  declare comparison: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = Number(inputs.a ?? this.a ?? 0);
    const b = Number(inputs.b ?? this.b ?? 0);
    const comparison = String(
      inputs.comparison ?? this.comparison ?? "=="
    ) as ComparisonOperator;

    switch (comparison) {
      case "==":
        return { output: a === b };
      case "!=":
        return { output: a !== b };
      case ">":
        return { output: a > b };
      case "<":
        return { output: a < b };
      case ">=":
        return { output: a >= b };
      case "<=":
        return { output: a <= b };
      default:
        throw new Error(`Unsupported comparison: ${comparison}`);
    }
  }
}

export class IsNoneNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.IsNone";
            static readonly title = "Is None";
            static readonly description = "Checks if a value is None.\n    null, none, check\n\n    Use cases:\n    - Validate input presence\n    - Handle optional parameters\n    - Implement null checks in data processing";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "any", default: null, title: "Value", description: "The value to check for None" })
  declare value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = inputs.value ?? this.value;
    return { output: value === null || value === undefined };
  }
}

export class IsInNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.IsIn";
            static readonly title = "Is In";
            static readonly description = "Checks if a value is present in a list of options.\n    membership, contains, check\n\n    Use cases:\n    - Validate input against a set of allowed values\n    - Implement category or group checks\n    - Filter data based on inclusion criteria";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "any", default: [], title: "Value", description: "The value to check for membership" })
  declare value: any;

  @prop({ type: "list[any]", default: [], title: "Options", description: "The list of options to check against" })
  declare options: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = inputs.value ?? this.value;
    const options = (inputs.options ?? this.options ?? []) as unknown[];
    return { output: Array.isArray(options) ? options.includes(value) : false };
  }
}

export class AllNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.All";
            static readonly title = "All";
            static readonly description = "Checks if all boolean values in a list are True.\n    boolean, all, check, logic, condition, flow-control, branch\n\n\n    Use cases:\n    - Ensure all conditions in a set are met\n    - Implement comprehensive checks\n    - Validate multiple criteria simultaneously";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "list[bool]", default: [], title: "Values", description: "List of boolean values to check" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    return { output: values.every((v) => Boolean(v)) };
  }
}

export class SomeNode extends BaseNode {
  static readonly nodeType = "nodetool.boolean.Some";
            static readonly title = "Some";
            static readonly description = "Checks if any boolean value in a list is True.\n    boolean, any, check, logic, condition, flow-control, branch\n\n    Use cases:\n    - Check if at least one condition in a set is met\n    - Implement optional criteria checks\n    - Create flexible validation rules";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
  
  @prop({ type: "list[bool]", default: [], title: "Values", description: "List of boolean values to check" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    return { output: values.some((v) => Boolean(v)) };
  }
}

export const BOOLEAN_NODES = [
  ConditionalSwitchNode,
  LogicalOperatorNode,
  NotNode,
  CompareNode,
  IsNoneNode,
  IsInNode,
  AllNode,
  SomeNode,
] as const;
