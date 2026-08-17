// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function mask(inputs) {
  return callNode("lib.image.Mask", inputs);
}
export {
  mask
};
