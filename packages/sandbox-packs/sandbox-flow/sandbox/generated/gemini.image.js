// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function imageGeneration(inputs) {
  return callNode("gemini.image.ImageGeneration", inputs);
}
export {
  imageGeneration
};
