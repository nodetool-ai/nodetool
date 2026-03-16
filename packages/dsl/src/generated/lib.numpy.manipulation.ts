// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Slice Array — lib.numpy.manipulation.SliceArray
export interface SliceArrayInputs {
  values?: Connectable<unknown>;
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
  axis?: Connectable<number>;
}

export function sliceArray(inputs: SliceArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.manipulation.SliceArray", inputs as Record<string, unknown>);
}

// Index Array — lib.numpy.manipulation.IndexArray
export interface IndexArrayInputs {
  values?: Connectable<unknown>;
  indices?: Connectable<string>;
  axis?: Connectable<number>;
}

export function indexArray(inputs: IndexArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.manipulation.IndexArray", inputs as Record<string, unknown>);
}

// Transpose Array — lib.numpy.manipulation.TransposeArray
export interface TransposeArrayInputs {
  values?: Connectable<unknown>;
}

export function transposeArray(inputs: TransposeArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.manipulation.TransposeArray", inputs as Record<string, unknown>);
}

// Mat Mul — lib.numpy.manipulation.MatMul
export interface MatMulInputs {
  a?: Connectable<unknown>;
  b?: Connectable<unknown>;
}

export function matMul(inputs: MatMulInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.manipulation.MatMul", inputs as Record<string, unknown>);
}

// Stack — lib.numpy.manipulation.Stack
export interface StackInputs {
  arrays?: Connectable<unknown[]>;
  axis?: Connectable<number>;
}

export function stack(inputs: StackInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.manipulation.Stack", inputs as Record<string, unknown>);
}

// Split Array — lib.numpy.manipulation.SplitArray
export interface SplitArrayInputs {
  values?: Connectable<unknown>;
  num_splits?: Connectable<number>;
  axis?: Connectable<number>;
}

export function splitArray(inputs: SplitArrayInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("lib.numpy.manipulation.SplitArray", inputs as Record<string, unknown>);
}
