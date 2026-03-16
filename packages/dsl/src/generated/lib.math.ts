// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Add — lib.math.Add
export interface AddInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export function add(inputs: AddInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Add", inputs as Record<string, unknown>);
}

// Subtract — lib.math.Subtract
export interface SubtractInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export function subtract(inputs: SubtractInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Subtract", inputs as Record<string, unknown>);
}

// Multiply — lib.math.Multiply
export interface MultiplyInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export function multiply(inputs: MultiplyInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Multiply", inputs as Record<string, unknown>);
}

// Divide — lib.math.Divide
export interface DivideInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export function divide(inputs: DivideInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Divide", inputs as Record<string, unknown>);
}

// Modulus — lib.math.Modulus
export interface ModulusInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export function modulus(inputs: ModulusInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Modulus", inputs as Record<string, unknown>);
}

// Math Function — lib.math.MathFunction
export interface MathFunctionInputs {
  input?: Connectable<number>;
  operation?: Connectable<unknown>;
}

export function mathFunction(inputs: MathFunctionInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.MathFunction", inputs as Record<string, unknown>);
}

// Sine — lib.math.Sine
export interface SineInputs {
  angle_rad?: Connectable<number>;
}

export function sine(inputs: SineInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Sine", inputs as Record<string, unknown>);
}

// Cosine — lib.math.Cosine
export interface CosineInputs {
  angle_rad?: Connectable<number>;
}

export function cosine(inputs: CosineInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Cosine", inputs as Record<string, unknown>);
}

// Power — lib.math.Power
export interface PowerInputs {
  base?: Connectable<number>;
  exponent?: Connectable<number>;
}

export function power(inputs: PowerInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Power", inputs as Record<string, unknown>);
}

// Sqrt — lib.math.Sqrt
export interface SqrtInputs {
  x?: Connectable<number>;
}

export function sqrt(inputs: SqrtInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.math.Sqrt", inputs as Record<string, unknown>);
}
