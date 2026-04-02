// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Sum Array — lib.numpy.statistics.SumArray
export interface SumArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export interface SumArrayOutputs {
  output: unknown | number;
}

export function sumArray(
  inputs: SumArrayInputs
): DslNode<SumArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.statistics.SumArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Mean Array — lib.numpy.statistics.MeanArray
export interface MeanArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export interface MeanArrayOutputs {
  output: unknown | number;
}

export function meanArray(
  inputs: MeanArrayInputs
): DslNode<MeanArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.statistics.MeanArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Min Array — lib.numpy.statistics.MinArray
export interface MinArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export interface MinArrayOutputs {
  output: unknown | number;
}

export function minArray(
  inputs: MinArrayInputs
): DslNode<MinArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.statistics.MinArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Max Array — lib.numpy.statistics.MaxArray
export interface MaxArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export interface MaxArrayOutputs {
  output: unknown | number;
}

export function maxArray(
  inputs: MaxArrayInputs
): DslNode<MaxArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.statistics.MaxArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Arg Min Array — lib.numpy.statistics.ArgMinArray
export interface ArgMinArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export interface ArgMinArrayOutputs {
  output: unknown | number;
}

export function argMinArray(
  inputs: ArgMinArrayInputs
): DslNode<ArgMinArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.statistics.ArgMinArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Arg Max Array — lib.numpy.statistics.ArgMaxArray
export interface ArgMaxArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export interface ArgMaxArrayOutputs {
  output: unknown | number;
}

export function argMaxArray(
  inputs: ArgMaxArrayInputs
): DslNode<ArgMaxArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.statistics.ArgMaxArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
