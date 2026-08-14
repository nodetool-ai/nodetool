// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Code — nodetool.code.Code
export type CodeInputs = {
  code?: Connectable<string>;
  packages?: Connectable<Record<string, unknown>[]>;
  secrets?: Connectable<string[]>;
  script?: Connectable<Record<string, unknown>>;
  timeout?: Connectable<number>;
  max_response_mb?: Connectable<number>;
  allow_local_network?: Connectable<boolean>;
  allow_host_filesystem?: Connectable<boolean>;
};

export interface CodeOutputs {
}

export function code(inputs: CodeInputs): DslNode<CodeOutputs> {
  return createNode("nodetool.code.Code", inputs, { outputNames: [], streaming: true });
}
