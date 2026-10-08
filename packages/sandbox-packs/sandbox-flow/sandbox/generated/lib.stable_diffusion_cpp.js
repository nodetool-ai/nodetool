// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function generateImage(inputs) {
  return callNode("lib.stable_diffusion_cpp.GenerateImage", inputs);
}
export {
  generateImage
};
