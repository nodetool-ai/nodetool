// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Code — nodetool.code.Code
export type CodeInputs = {
  code?: string;
  packages?: Record<string, unknown>[];
  secrets?: string[];
  script?: Record<string, unknown>;
  timeout?: number;
  max_response_mb?: number;
  allow_local_network?: boolean;
  allow_host_filesystem?: boolean;
};

export interface CodeOutputs {
}

export function code(inputs: CodeInputs): Promise<CodeOutputs> {
  return callNode<CodeOutputs>("nodetool.code.Code", inputs);
}

code.stream = function (inputs: CodeInputs): AsyncIterable<Partial<CodeOutputs>> {
  return streamNode<Partial<CodeOutputs>>("nodetool.code.Code", inputs);
};
