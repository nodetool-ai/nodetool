// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Conditional Switch — nodetool.boolean.ConditionalSwitch
export interface ConditionalSwitchInputs {
  condition?: Connectable<boolean>;
  if_true?: Connectable<unknown>;
  if_false?: Connectable<unknown>;
}

export function conditionalSwitch(inputs: ConditionalSwitchInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.boolean.ConditionalSwitch", inputs as Record<string, unknown>);
}

// Logical Operator — nodetool.boolean.LogicalOperator
export interface LogicalOperatorInputs {
  a?: Connectable<boolean>;
  b?: Connectable<boolean>;
  operation?: Connectable<unknown>;
}

export function logicalOperator(inputs: LogicalOperatorInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.LogicalOperator", inputs as Record<string, unknown>);
}

// Not — nodetool.boolean.Not
export interface NotInputs {
  value?: Connectable<boolean>;
}

export function not(inputs: NotInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.Not", inputs as Record<string, unknown>);
}

// Compare — nodetool.boolean.Compare
export interface CompareInputs {
  a?: Connectable<number | number>;
  b?: Connectable<number | number>;
  comparison?: Connectable<unknown>;
}

export function compare(inputs: CompareInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.Compare", inputs as Record<string, unknown>);
}

// Is None — nodetool.boolean.IsNone
export interface IsNoneInputs {
  value?: Connectable<unknown>;
}

export function isNone(inputs: IsNoneInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.IsNone", inputs as Record<string, unknown>);
}

// Is In — nodetool.boolean.IsIn
export interface IsInInputs {
  value?: Connectable<unknown>;
  options?: Connectable<unknown[]>;
}

export function isIn(inputs: IsInInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.IsIn", inputs as Record<string, unknown>);
}

// All — nodetool.boolean.All
export interface AllInputs {
  values?: Connectable<boolean[]>;
}

export function all(inputs: AllInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.All", inputs as Record<string, unknown>);
}

// Some — nodetool.boolean.Some
export interface SomeInputs {
  values?: Connectable<boolean[]>;
}

export function some(inputs: SomeInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.boolean.Some", inputs as Record<string, unknown>);
}
