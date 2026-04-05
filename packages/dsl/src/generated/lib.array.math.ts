// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Abs Array — lib.array.math.AbsArray
export interface AbsArrayInputs {
  values?: Connectable<unknown>;
}

export interface AbsArrayOutputs {
  output: unknown;
}

export function absArray(
  inputs: AbsArrayInputs
): DslNode<AbsArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.AbsArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sine Array — lib.array.math.SineArray
export interface SineArrayInputs {
  angle_rad?: Connectable<number | unknown>;
}

export interface SineArrayOutputs {
  output: number | unknown;
}

export function sineArray(
  inputs: SineArrayInputs
): DslNode<SineArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.SineArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Cosine Array — lib.array.math.CosineArray
export interface CosineArrayInputs {
  angle_rad?: Connectable<number | unknown>;
}

export interface CosineArrayOutputs {
  output: number | unknown;
}

export function cosineArray(
  inputs: CosineArrayInputs
): DslNode<CosineArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.CosineArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Exp Array — lib.array.math.ExpArray
export interface ExpArrayInputs {
  values?: Connectable<unknown>;
}

export interface ExpArrayOutputs {
  output: number | unknown;
}

export function expArray(
  inputs: ExpArrayInputs
): DslNode<ExpArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.ExpArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Log Array — lib.array.math.LogArray
export interface LogArrayInputs {
  values?: Connectable<unknown>;
}

export interface LogArrayOutputs {
  output: number | unknown;
}

export function logArray(
  inputs: LogArrayInputs
): DslNode<LogArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.LogArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sqrt Array — lib.array.math.SqrtArray
export interface SqrtArrayInputs {
  values?: Connectable<unknown>;
}

export interface SqrtArrayOutputs {
  output: number | unknown;
}

export function sqrtArray(
  inputs: SqrtArrayInputs
): DslNode<SqrtArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.SqrtArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Power Array — lib.array.math.PowerArray
export interface PowerArrayInputs {
  base?: Connectable<number | unknown>;
  exponent?: Connectable<number | unknown>;
}

export interface PowerArrayOutputs {
  output: number | unknown;
}

export function powerArray(
  inputs: PowerArrayInputs
): DslNode<PowerArrayOutputs, "output"> {
  return createNode(
    "lib.array.math.PowerArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
