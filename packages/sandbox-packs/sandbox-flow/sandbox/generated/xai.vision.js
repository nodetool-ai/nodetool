// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function imageToText(inputs) {
  return callNode("xai.vision.ImageToText", inputs);
}
export {
  imageToText
};
