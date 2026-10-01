// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function compareImages(inputs, options) {
  return createNode("nodetool.compare.CompareImages", inputs, { id: options?.id, outputNames: ["comparison", "score", "equal"], outputTypes: { "comparison": "any", "score": "float", "equal": "bool" } });
}
export {
  compareImages
};
