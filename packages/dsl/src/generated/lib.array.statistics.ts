// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Sum Array — lib.array.statistics.SumArray
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
    "lib.array.statistics.SumArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Mean Array — lib.array.statistics.MeanArray
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
    "lib.array.statistics.MeanArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Min Array — lib.array.statistics.MinArray
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
    "lib.array.statistics.MinArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Max Array — lib.array.statistics.MaxArray
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
    "lib.array.statistics.MaxArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Arg Min Array — lib.array.statistics.ArgMinArray
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
    "lib.array.statistics.ArgMinArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Arg Max Array — lib.array.statistics.ArgMaxArray
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
    "lib.array.statistics.ArgMaxArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
