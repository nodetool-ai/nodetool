// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Slice Array — lib.numpy.manipulation.SliceArray
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
    "lib.numpy.manipulation.SliceArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Index Array — lib.numpy.manipulation.IndexArray
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
    "lib.numpy.manipulation.IndexArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Transpose Array — lib.numpy.manipulation.TransposeArray
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
    "lib.numpy.manipulation.TransposeArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Mat Mul — lib.numpy.manipulation.MatMul
export interface MatMulInputs {
  a?: Connectable<unknown>;
  b?: Connectable<unknown>;
}

export interface MatMulOutputs {
  output: unknown;
}

export function matMul(inputs: MatMulInputs): DslNode<MatMulOutputs, "output"> {
  return createNode(
    "lib.numpy.manipulation.MatMul",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Stack — lib.numpy.manipulation.Stack
export interface StackInputs {
  arrays?: Connectable<unknown[]>;
  axis?: Connectable<number>;
}

export interface StackOutputs {
  output: unknown;
}

export function stack(inputs: StackInputs): DslNode<StackOutputs, "output"> {
  return createNode(
    "lib.numpy.manipulation.Stack",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Split Array — lib.numpy.manipulation.SplitArray
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
    "lib.numpy.manipulation.SplitArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
