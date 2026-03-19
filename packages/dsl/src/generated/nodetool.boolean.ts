// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Conditional Switch — nodetool.boolean.ConditionalSwitch
export interface ConditionalSwitchInputs {
  condition?: Connectable<boolean>;
  if_true?: Connectable<unknown>;
  if_false?: Connectable<unknown>;
}

export interface ConditionalSwitchOutputs {
  output: unknown;
}

export function conditionalSwitch(inputs: ConditionalSwitchInputs): DslNode<ConditionalSwitchOutputs, "output"> {
  return createNode("nodetool.boolean.ConditionalSwitch", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Logical Operator — nodetool.boolean.LogicalOperator
export interface LogicalOperatorInputs {
  a?: Connectable<boolean>;
  b?: Connectable<boolean>;
  operation?: Connectable<unknown>;
}

export interface LogicalOperatorOutputs {
  output: boolean;
}

export function logicalOperator(inputs: LogicalOperatorInputs): DslNode<LogicalOperatorOutputs, "output"> {
  return createNode("nodetool.boolean.LogicalOperator", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Not — nodetool.boolean.Not
export interface NotInputs {
  value?: Connectable<boolean>;
}

export interface NotOutputs {
  output: boolean;
}

export function not(inputs: NotInputs): DslNode<NotOutputs, "output"> {
  return createNode("nodetool.boolean.Not", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Compare — nodetool.boolean.Compare
export interface CompareInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
  comparison?: Connectable<unknown>;
}

export interface CompareOutputs {
  output: boolean;
}

export function compare(inputs: CompareInputs): DslNode<CompareOutputs, "output"> {
  return createNode("nodetool.boolean.Compare", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Is None — nodetool.boolean.IsNone
export interface IsNoneInputs {
  value?: Connectable<unknown>;
}

export interface IsNoneOutputs {
  output: boolean;
}

export function isNone(inputs: IsNoneInputs): DslNode<IsNoneOutputs, "output"> {
  return createNode("nodetool.boolean.IsNone", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Is In — nodetool.boolean.IsIn
export interface IsInInputs {
  value?: Connectable<unknown>;
  options?: Connectable<unknown[]>;
}

export interface IsInOutputs {
  output: boolean;
}

export function isIn(inputs: IsInInputs): DslNode<IsInOutputs, "output"> {
  return createNode("nodetool.boolean.IsIn", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// All — nodetool.boolean.All
export interface AllInputs {
  values?: Connectable<boolean[]>;
}

export interface AllOutputs {
  output: boolean;
}

export function all(inputs: AllInputs): DslNode<AllOutputs, "output"> {
  return createNode("nodetool.boolean.All", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Some — nodetool.boolean.Some
export interface SomeInputs {
  values?: Connectable<boolean[]>;
}

export interface SomeOutputs {
  output: boolean;
}

export function some(inputs: SomeInputs): DslNode<SomeOutputs, "output"> {
  return createNode("nodetool.boolean.Some", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
