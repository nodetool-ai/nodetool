// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Slice Array — lib.array.manipulation.SliceArray
export interface SliceArrayInputs {
  values?: Connectable<unknown>;
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
  axis?: Connectable<number>;
}

export interface SliceArrayOutputs {
  output: unknown;
}

export function sliceArray(
  inputs: SliceArrayInputs
): DslNode<SliceArrayOutputs, "output"> {
  return createNode(
    "lib.array.manipulation.SliceArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Index Array — lib.array.manipulation.IndexArray
export interface IndexArrayInputs {
  values?: Connectable<unknown>;
  indices?: Connectable<string>;
  axis?: Connectable<number>;
}

export interface IndexArrayOutputs {
  output: unknown;
}

export function indexArray(
  inputs: IndexArrayInputs
): DslNode<IndexArrayOutputs, "output"> {
  return createNode(
    "lib.array.manipulation.IndexArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Transpose Array — lib.array.manipulation.TransposeArray
export interface TransposeArrayInputs {
  values?: Connectable<unknown>;
}

export interface TransposeArrayOutputs {
  output: unknown;
}

export function transposeArray(
  inputs: TransposeArrayInputs
): DslNode<TransposeArrayOutputs, "output"> {
  return createNode(
    "lib.array.manipulation.TransposeArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Mat Mul — lib.array.manipulation.MatMul
export interface MatMulInputs {
  a?: Connectable<unknown>;
  b?: Connectable<unknown>;
}

export interface MatMulOutputs {
  output: unknown;
}

export function matMul(inputs: MatMulInputs): DslNode<MatMulOutputs, "output"> {
  return createNode(
    "lib.array.manipulation.MatMul",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Stack — lib.array.manipulation.Stack
export interface StackInputs {
  arrays?: Connectable<unknown[]>;
  axis?: Connectable<number>;
}

export interface StackOutputs {
  output: unknown;
}

export function stack(inputs: StackInputs): DslNode<StackOutputs, "output"> {
  return createNode(
    "lib.array.manipulation.Stack",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Split Array — lib.array.manipulation.SplitArray
export interface SplitArrayInputs {
  values?: Connectable<unknown>;
  num_splits?: Connectable<number>;
  axis?: Connectable<number>;
}

export interface SplitArrayOutputs {
  output: unknown[];
}

export function splitArray(
  inputs: SplitArrayInputs
): DslNode<SplitArrayOutputs, "output"> {
  return createNode(
    "lib.array.manipulation.SplitArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
