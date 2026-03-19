// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Add — lib.math.Add
export interface AddInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export interface AddOutputs {
  output: number;
}

export function add(inputs: AddInputs): DslNode<AddOutputs, "output"> {
  return createNode("lib.math.Add", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Subtract — lib.math.Subtract
export interface SubtractInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export interface SubtractOutputs {
  output: number;
}

export function subtract(inputs: SubtractInputs): DslNode<SubtractOutputs, "output"> {
  return createNode("lib.math.Subtract", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Multiply — lib.math.Multiply
export interface MultiplyInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export interface MultiplyOutputs {
  output: number;
}

export function multiply(inputs: MultiplyInputs): DslNode<MultiplyOutputs, "output"> {
  return createNode("lib.math.Multiply", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Divide — lib.math.Divide
export interface DivideInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export interface DivideOutputs {
  output: number;
}

export function divide(inputs: DivideInputs): DslNode<DivideOutputs, "output"> {
  return createNode("lib.math.Divide", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Modulus — lib.math.Modulus
export interface ModulusInputs {
  a?: Connectable<number>;
  b?: Connectable<number>;
}

export interface ModulusOutputs {
  output: number;
}

export function modulus(inputs: ModulusInputs): DslNode<ModulusOutputs, "output"> {
  return createNode("lib.math.Modulus", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Math Function — lib.math.MathFunction
export interface MathFunctionInputs {
  input?: Connectable<number>;
  operation?: Connectable<unknown>;
}

export interface MathFunctionOutputs {
  output: number;
}

export function mathFunction(inputs: MathFunctionInputs): DslNode<MathFunctionOutputs, "output"> {
  return createNode("lib.math.MathFunction", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Sine — lib.math.Sine
export interface SineInputs {
  angle_rad?: Connectable<number>;
}

export interface SineOutputs {
  output: number;
}

export function sine(inputs: SineInputs): DslNode<SineOutputs, "output"> {
  return createNode("lib.math.Sine", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Cosine — lib.math.Cosine
export interface CosineInputs {
  angle_rad?: Connectable<number>;
}

export interface CosineOutputs {
  output: number;
}

export function cosine(inputs: CosineInputs): DslNode<CosineOutputs, "output"> {
  return createNode("lib.math.Cosine", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Power — lib.math.Power
export interface PowerInputs {
  base?: Connectable<number>;
  exponent?: Connectable<number>;
}

export interface PowerOutputs {
  output: number;
}

export function power(inputs: PowerInputs): DslNode<PowerOutputs, "output"> {
  return createNode("lib.math.Power", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Sqrt — lib.math.Sqrt
export interface SqrtInputs {
  x?: Connectable<number>;
}

export interface SqrtOutputs {
  output: number;
}

export function sqrt(inputs: SqrtInputs): DslNode<SqrtOutputs, "output"> {
  return createNode("lib.math.Sqrt", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
