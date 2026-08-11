// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function compareImages(inputs) {
  return createNode("nodetool.compare.CompareImages", inputs, { outputNames: ["comparison", "score", "equal"] });
}
export {
  compareImages
};
