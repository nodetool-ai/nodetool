// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Kie AI — kie.dynamic_schema.KieAI
export interface KieAIInputs {
  model_info?: Connectable<number>;
}

export interface KieAIOutputs {}

export function kieAI(inputs: KieAIInputs): DslNode<KieAIOutputs> {
  return createNode(
    "kie.dynamic_schema.KieAI",
    inputs as Record<string, unknown>,
    { outputNames: [] }
  );
}
