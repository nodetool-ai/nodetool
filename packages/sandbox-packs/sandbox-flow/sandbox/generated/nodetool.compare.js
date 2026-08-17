// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function compareImages(inputs) {
  return callNode("nodetool.compare.CompareImages", inputs);
}
export {
  compareImages
};
