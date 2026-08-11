// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function kieAI(inputs) {
  return createNode("kie.dynamic_schema.KieAI", inputs, { outputNames: [] });
}
export {
  kieAI
};
