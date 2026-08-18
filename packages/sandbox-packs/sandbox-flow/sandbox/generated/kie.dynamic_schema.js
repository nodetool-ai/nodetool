// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function kieAI(inputs) {
  return callNode("kie.dynamic_schema.KieAI", inputs);
}
export {
  kieAI
};
