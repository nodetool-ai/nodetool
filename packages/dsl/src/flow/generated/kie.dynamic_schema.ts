// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Kie AI — kie.dynamic_schema.KieAI
export type KieAIInputs = {
  model_info?: string;
};

export interface KieAIOutputs {
}

export function kieAI(inputs: KieAIInputs): Promise<KieAIOutputs> {
  return callNode<KieAIOutputs>("kie.dynamic_schema.KieAI", inputs);
}
