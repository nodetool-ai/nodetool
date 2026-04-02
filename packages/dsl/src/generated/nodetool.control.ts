// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// If — nodetool.control.If
export interface IfInputs {
  condition?: Connectable<boolean>;
  value?: Connectable<unknown>;
}

export interface IfOutputs {
  if_true: unknown;
  if_false: unknown;
}

export function if_(inputs: IfInputs): DslNode<IfOutputs> {
  return createNode("nodetool.control.If", inputs as Record<string, unknown>, {
    outputNames: ["if_true", "if_false"],
    streaming: true
  });
}

// For Each — nodetool.control.ForEach
export interface ForEachInputs {
  input_list?: Connectable<unknown[]>;
}

export interface ForEachOutputs {
  output: unknown;
  index: number;
}

export function forEach(inputs: ForEachInputs): DslNode<ForEachOutputs> {
  return createNode(
    "nodetool.control.ForEach",
    inputs as Record<string, unknown>,
    { outputNames: ["output", "index"], streaming: true }
  );
}

// Collect — nodetool.control.Collect
export interface CollectInputs {
  input_item?: Connectable<unknown>;
}

export interface CollectOutputs {
  output: unknown[];
}

export function collect(
  inputs: CollectInputs
): DslNode<CollectOutputs, "output"> {
  return createNode(
    "nodetool.control.Collect",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Reroute — nodetool.control.Reroute
export interface RerouteInputs {
  input_value?: Connectable<unknown>;
}

export interface RerouteOutputs {
  output: unknown;
}

export function reroute(
  inputs: RerouteInputs
): DslNode<RerouteOutputs, "output"> {
  return createNode(
    "nodetool.control.Reroute",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output", streaming: true }
  );
}
