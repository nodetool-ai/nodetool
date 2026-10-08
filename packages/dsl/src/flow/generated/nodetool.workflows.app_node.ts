// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// App — nodetool.workflows.app_node.App
export type AppInputs = {
  app_id?: string;
  app_json?: Record<string, unknown>;
};

export interface AppOutputs {
}

export function app(inputs: AppInputs): Promise<AppOutputs> {
  return callNode<AppOutputs>("nodetool.workflows.app_node.App", inputs);
}

app.stream = function (inputs: AppInputs): AsyncIterable<Partial<AppOutputs>> {
  return streamNode<Partial<AppOutputs>>("nodetool.workflows.app_node.App", inputs);
};
