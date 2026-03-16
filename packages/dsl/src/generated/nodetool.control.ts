// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// If — nodetool.control.If
export interface IfInputs {
  condition?: Connectable<boolean>;
  value?: Connectable<unknown>;
}

export interface IfOutputs {
  if_true: OutputHandle<unknown>;
  if_false: OutputHandle<unknown>;
}

export function if_(inputs: IfInputs): DslNode<IfOutputs> {
  return createNode("nodetool.control.If", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// For Each — nodetool.control.ForEach
export interface ForEachInputs {
  input_list?: Connectable<unknown[]>;
}

export interface ForEachOutputs {
  output: OutputHandle<unknown>;
  index: OutputHandle<number>;
}

export function forEach(inputs: ForEachInputs): DslNode<ForEachOutputs> {
  return createNode("nodetool.control.ForEach", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Collect — nodetool.control.Collect
export interface CollectInputs {
  input_item?: Connectable<unknown>;
}

export function collect(inputs: CollectInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.control.Collect", inputs as Record<string, unknown>);
}

// Reroute — nodetool.control.Reroute
export interface RerouteInputs {
  input_value?: Connectable<unknown>;
}

export function reroute(inputs: RerouteInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.control.Reroute", inputs as Record<string, unknown>, { streaming: true });
}
