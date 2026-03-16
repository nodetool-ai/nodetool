// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Kie AI — kie.dynamic_schema.KieAI
export interface KieAIInputs {
  timeout_seconds?: Connectable<number>;
  model_info?: Connectable<string>;
}

export function kieAI(inputs: KieAIInputs): DslNode<SingleOutput<unknown>> {
  return createNode("kie.dynamic_schema.KieAI", inputs as Record<string, unknown>);
}
