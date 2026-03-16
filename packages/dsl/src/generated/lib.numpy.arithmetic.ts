// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Add Array — lib.numpy.arithmetic.AddArray
export interface AddArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export function addArray(inputs: AddArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.arithmetic.AddArray", inputs as Record<string, unknown>);
}

// Subtract Array — lib.numpy.arithmetic.SubtractArray
export interface SubtractArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export function subtractArray(inputs: SubtractArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.arithmetic.SubtractArray", inputs as Record<string, unknown>);
}

// Multiply Array — lib.numpy.arithmetic.MultiplyArray
export interface MultiplyArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export function multiplyArray(inputs: MultiplyArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.arithmetic.MultiplyArray", inputs as Record<string, unknown>);
}

// Divide Array — lib.numpy.arithmetic.DivideArray
export interface DivideArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export function divideArray(inputs: DivideArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.arithmetic.DivideArray", inputs as Record<string, unknown>);
}

// Modulus Array — lib.numpy.arithmetic.ModulusArray
export interface ModulusArrayInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export function modulusArray(inputs: ModulusArrayInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.arithmetic.ModulusArray", inputs as Record<string, unknown>);
}
