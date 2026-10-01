// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Kie AI — kie.dynamic_schema.KieAI
export type KieAIInputs = {
  model_info?: Connectable<string>;
  [name: string]: unknown;
};

export interface KieAIOutputs {
}

export function kieAI(inputs: KieAIInputs, options?: NodeOptions): NodeWithOutputs<KieAIOutputs> {
  return createNode("kie.dynamic_schema.KieAI", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
