// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Binary Operation — lib.numpy.utils.BinaryOperation
export interface BinaryOperationInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export interface BinaryOperationOutputs {
  output: number | unknown;
}

export function binaryOperation(
  inputs: BinaryOperationInputs
): DslNode<BinaryOperationOutputs, "output"> {
  return createNode(
    "lib.numpy.utils.BinaryOperation",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
