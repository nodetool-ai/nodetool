// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Abs Array — lib.numpy.math.AbsArray
export interface AbsArrayInputs {
  values?: Connectable<unknown>;
}

export function absArray(inputs: AbsArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.math.AbsArray", inputs as Record<string, unknown>);
}

// Sine Array — lib.numpy.math.SineArray
export interface SineArrayInputs {
  angle_rad?: Connectable<number | unknown>;
}

export function sineArray(inputs: SineArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.math.SineArray", inputs as Record<string, unknown>);
}

// Cosine Array — lib.numpy.math.CosineArray
export interface CosineArrayInputs {
  angle_rad?: Connectable<number | unknown>;
}

export function cosineArray(inputs: CosineArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.math.CosineArray", inputs as Record<string, unknown>);
}

// Exp Array — lib.numpy.math.ExpArray
export interface ExpArrayInputs {
  values?: Connectable<unknown>;
}

export function expArray(inputs: ExpArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.math.ExpArray", inputs as Record<string, unknown>);
}

// Log Array — lib.numpy.math.LogArray
export interface LogArrayInputs {
  values?: Connectable<unknown>;
}

export function logArray(inputs: LogArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.math.LogArray", inputs as Record<string, unknown>);
}

// Sqrt Array — lib.numpy.math.SqrtArray
export interface SqrtArrayInputs {
  values?: Connectable<unknown>;
}

export function sqrtArray(inputs: SqrtArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.math.SqrtArray", inputs as Record<string, unknown>);
}

// Power Array — lib.numpy.math.PowerArray
export interface PowerArrayInputs {
  base?: Connectable<number | unknown>;
  exponent?: Connectable<number | unknown>;
}

export function powerArray(inputs: PowerArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.math.PowerArray", inputs as Record<string, unknown>);
}
