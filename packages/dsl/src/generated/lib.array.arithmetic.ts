// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Add Array — lib.array.arithmetic.AddArray
export interface AddArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export interface AddArrayOutputs {
  output: number | unknown;
}

export function addArray(
  inputs: AddArrayInputs
): DslNode<AddArrayOutputs, "output"> {
  return createNode(
    "lib.array.arithmetic.AddArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Subtract Array — lib.array.arithmetic.SubtractArray
export interface SubtractArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export interface SubtractArrayOutputs {
  output: number | unknown;
}

export function subtractArray(
  inputs: SubtractArrayInputs
): DslNode<SubtractArrayOutputs, "output"> {
  return createNode(
    "lib.array.arithmetic.SubtractArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Multiply Array — lib.array.arithmetic.MultiplyArray
export interface MultiplyArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export interface MultiplyArrayOutputs {
  output: number | unknown;
}

export function multiplyArray(
  inputs: MultiplyArrayInputs
): DslNode<MultiplyArrayOutputs, "output"> {
  return createNode(
    "lib.array.arithmetic.MultiplyArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Divide Array — lib.array.arithmetic.DivideArray
export interface DivideArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export interface DivideArrayOutputs {
  output: number | unknown;
}

export function divideArray(
  inputs: DivideArrayInputs
): DslNode<DivideArrayOutputs, "output"> {
  return createNode(
    "lib.array.arithmetic.DivideArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Modulus Array — lib.array.arithmetic.ModulusArray
export interface ModulusArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export interface ModulusArrayOutputs {
  output: number | unknown;
}

export function modulusArray(
  inputs: ModulusArrayInputs
): DslNode<ModulusArrayOutputs, "output"> {
  return createNode(
    "lib.array.arithmetic.ModulusArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
