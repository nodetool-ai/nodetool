// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Code — nodetool.code.Code
export type CodeInputs = {
  code?: Connectable<string>;
  secrets?: Connectable<string[]>;
  script?: Connectable<Record<string, unknown>>;
  timeout?: Connectable<number>;
  max_response_mb?: Connectable<number>;
  allow_local_network?: Connectable<boolean>;
  allow_host_filesystem?: Connectable<boolean>;
  [name: string]: unknown;
};

export interface CodeOutputs {
}

export function code(inputs: CodeInputs, options?: NodeOptions): NodeWithOutputs<CodeOutputs> {
  return createNode("nodetool.code.Code", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true });
}
