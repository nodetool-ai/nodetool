// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Code — nodetool.code.Code
export interface CodeInputs {
  code?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface CodeOutputs {
}

export function code(inputs: CodeInputs): DslNode<CodeOutputs> {
  return createNode("nodetool.code.Code", inputs as Record<string, unknown>, { outputNames: [], streaming: true });
}
