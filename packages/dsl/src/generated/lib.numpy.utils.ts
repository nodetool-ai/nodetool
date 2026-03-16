// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Binary Operation — lib.numpy.utils.BinaryOperation
export interface BinaryOperationInputs {
  a?: Connectable<number | unknown>;
  b?: Connectable<number | unknown>;
}

export function binaryOperation(inputs: BinaryOperationInputs): DslNode<SingleOutput<number | unknown>> {
  return createNode("lib.numpy.utils.BinaryOperation", inputs as Record<string, unknown>);
}
