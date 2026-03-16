// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Sum Array — lib.numpy.statistics.SumArray
export interface SumArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export function sumArray(inputs: SumArrayInputs): DslNode<SingleOutput<unknown | number>> {
  return createNode("lib.numpy.statistics.SumArray", inputs as Record<string, unknown>);
}

// Mean Array — lib.numpy.statistics.MeanArray
export interface MeanArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export function meanArray(inputs: MeanArrayInputs): DslNode<SingleOutput<unknown | number>> {
  return createNode("lib.numpy.statistics.MeanArray", inputs as Record<string, unknown>);
}

// Min Array — lib.numpy.statistics.MinArray
export interface MinArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export function minArray(inputs: MinArrayInputs): DslNode<SingleOutput<unknown | number>> {
  return createNode("lib.numpy.statistics.MinArray", inputs as Record<string, unknown>);
}

// Max Array — lib.numpy.statistics.MaxArray
export interface MaxArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export function maxArray(inputs: MaxArrayInputs): DslNode<SingleOutput<unknown | number>> {
  return createNode("lib.numpy.statistics.MaxArray", inputs as Record<string, unknown>);
}

// Arg Min Array — lib.numpy.statistics.ArgMinArray
export interface ArgMinArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export function argMinArray(inputs: ArgMinArrayInputs): DslNode<SingleOutput<unknown | number>> {
  return createNode("lib.numpy.statistics.ArgMinArray", inputs as Record<string, unknown>);
}

// Arg Max Array — lib.numpy.statistics.ArgMaxArray
export interface ArgMaxArrayInputs {
  values?: Connectable<unknown>;
  axis?: Connectable<number>;
}

export function argMaxArray(inputs: ArgMaxArrayInputs): DslNode<SingleOutput<unknown | number>> {
  return createNode("lib.numpy.statistics.ArgMaxArray", inputs as Record<string, unknown>);
}
