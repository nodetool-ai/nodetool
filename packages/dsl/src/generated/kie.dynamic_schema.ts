// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Kie AI — kie.dynamic_schema.KieAI
export interface KieAIInputs {
  model_info?: Connectable<string>;
}

export interface KieAIOutputs {
}

export function kieAI(inputs: KieAIInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<KieAIOutputs> {
  return createNode("kie.dynamic_schema.KieAI", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
