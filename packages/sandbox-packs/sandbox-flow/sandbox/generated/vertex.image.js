// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function imageGeneration(inputs) {
  return callNode("vertex.image.ImageGeneration", inputs);
}
export {
  imageGeneration
};
