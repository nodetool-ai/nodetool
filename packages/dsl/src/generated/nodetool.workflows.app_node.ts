// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// App — nodetool.workflows.app_node.App
export type AppInputs = {
  app_id?: Connectable<string>;
  app_json?: Connectable<Record<string, unknown>>;
  [name: string]: unknown;
};

export interface AppOutputs {
}

export function app(inputs: AppInputs, options?: NodeOptions): NodeWithOutputs<AppOutputs> {
  return createNode("nodetool.workflows.app_node.App", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true, inputMode: "buffered" });
}
